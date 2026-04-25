# Rendorix

![AWS](https://img.shields.io/badge/AWS-%23FF9900?style=flat&logo=amazonwebservices&logoColor=white)
![Terraform](https://img.shields.io/badge/Terraform-%235835CC?style=flat&logo=terraform&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?style=flat&logo=node.js&logoColor=white)
![Sharp](https://img.shields.io/badge/Sharp-0.34-99CC00?style=flat&logo=sharp&logoColor=white)
![Lambda](https://img.shields.io/badge/AWS_Lambda-%23FF9900?style=flat&logo=awslambda&logoColor=white)
![S3](https://img.shields.io/badge/Amazon_S3-%23569A31?style=flat&logo=amazons3&logoColor=white)
![CloudFront](https://img.shields.io/badge/CloudFront-CDN-%238C4FFF?style=flat&logo=amazonwebservices&logoColor=white)

**Stop thinking about image optimization.**

Rendorix is a self-hosted, AWS-powered image delivery system that combines edge validation, signed URLs, and on-demand transformations to deliver optimized images with minimal compute cost.

Upload originals to S3. Request any transform through a URL. Pay for Lambda only on cache misses. Define image roles once — then call `rx.img("photo.jpg", { preset: "hero" })` instead of juggling `w`, `q`, and `f` on every tag.

---

## Why Rendorix Exists

Most image optimization workflows fall into one of two traps:

**Too manual.** Developers maintain multiple versions of every image, make per-tag decisions about width and quality, and copy signing logic between projects.

**Too abstracted.** Managed platforms handle everything but cost real money at scale, offer little visibility into what's happening, and lock you into their SDK and pricing model.

Rendorix is built around three goals:

1. **Eliminate per-image decision making.** Named presets (`hero`, `card`, `avatar`) replace arbitrary width and quality choices. You define the role of an image once; the system handles the rest.
2. **Give developers control over infrastructure and cost.** Everything runs in your AWS account. You own the S3 bucket, the Lambda function, the CloudFront distribution, and the signing secret. There is no third-party in the request path.
3. **Explore real-world AWS and CDN patterns.** The architecture deliberately uses CloudFront Functions for edge validation, cache key normalization, and zero-downtime secret rotation — patterns that appear in production systems but rarely in tutorials.

---

## Architecture

```
Client Request
      │
      ▼
┌──────────────────┐    cache hit
│   CloudFront     │ ──────────────► Cached Response (no Lambda, no S3)
│   (CDN / edge)   │
└────────┬─────────┘
         │ viewer-request
         ▼
┌──────────────────┐
│ CloudFront Func  │  validates HMAC-SHA256 signature + expiration
│ (signer.js.tpl)  │  strips s= and exp= before forwarding
└────────┬─────────┘
         │ cache miss
         ▼
┌──────────────────┐
│     Lambda       │  Node.js 20.x + Sharp
│  (index.js)      │  resize, convert, quality control
└────────┬─────────┘
         │ fetch original
         ▼
┌──────────────────┐
│       S3         │  private bucket, originals only
│  (storage)       │
└──────────────────┘
```

### Layer by layer

| Layer | Service | Responsibility |
|-------|---------|----------------|
| CDN | CloudFront | Global edge caching, HTTPS termination, request routing |
| Edge validation | CloudFront Function (`cloudfront-js-2.0`) | Validates HMAC-SHA256 signature and expiration on every viewer request, strips auth params before the cache key is formed |
| Compute | Lambda (Node.js 20.x) | Fetches original from S3, applies transformations with Sharp, returns the result |
| Processing | [Sharp](https://sharp.pixelplumbing.com/) | Resize, format conversion (WebP / AVIF / JPEG / PNG), quality control |
| Storage | S3 | Private bucket for original images only; no public access |
| Infrastructure | Terraform | All AWS resources defined as code — S3, IAM, Lambda, CloudFront Function, CloudFront distribution |
| IAM | Least-privilege role | Lambda can only `s3:GetObject` on the images bucket and write to CloudWatch Logs |

---

## Key Design Decisions

### Edge validation via CloudFront Function

Signature checking runs in a CloudFront Function (not a Lambda authorizer or API Gateway policy), which means it executes at the edge — closer to the user, before any origin request is made, and at a fraction of the cost. Invalid or expired requests are rejected with a `403` before they ever reach Lambda or count against origin invocations.

### HMAC-SHA256 signed URLs

Every request must carry a valid signature (`s=`) and expiration timestamp (`exp=`). The signing algorithm:

1. Lowercases all parameter keys.
2. Sorts them alphabetically.
3. Excludes `s` from the signed string.
4. Computes `HMAC-SHA256(secret, "/path?sorted_params")` and hex-encodes it.

This prevents parameter forgery. An attacker who captures a signed URL cannot change `w=400` to `w=4096` — the signature covers every query parameter. They can only replay the exact URL they captured, and only until `exp` passes.

### Query normalization for clean cache keys

After signature validation passes, the CloudFront Function strips `s=` and `exp=` from the query string before forwarding. This means two requests for the same image and transform but with different expiration timestamps share a single CloudFront cache entry. The cache key is purely the transform intent (`/photo.jpg?f=webp&q=85&w=1200`), not the authentication metadata.

Without this, every user with a different `exp` would produce a cache miss, effectively defeating edge caching for signed URLs.

### On-demand transforms, not pre-generation

Lambda processes images only when CloudFront has no cached response. There is no build step that pre-generates image variants. The first request for a given image and transform combination incurs a Lambda invocation; every subsequent request for the same combination is served from cache.

### CDN-first caching

Lambda responses include `Cache-Control: public, max-age=31536000, immutable`. CloudFront caches the transformed image at the edge indefinitely (subject to its own TTL configuration). Compute cost scales with the number of unique image-plus-transform combinations, not with traffic volume.

### Server-only signing

The JavaScript client (`createRendorix`) is designed exclusively for server-side use. The signing secret must never reach the browser. `rx.img()` runs in Astro frontmatter, Next.js server components, Express route handlers, or any other server context — the resulting URL string is what gets passed to `<img src>`.

---

## Cost and Performance Model

**Cache miss (first request for a given image + transform):**

1. CloudFront Function validates the signature — sub-millisecond, ~$0.10 per 1M invocations.
2. CloudFront forwards to Lambda.
3. Lambda fetches the original from S3, transforms it with Sharp, and returns the result. Cold start is typically under 500ms; subsequent invocations are faster.
4. CloudFront caches the response at the edge.

**Cache hit (every subsequent identical request):**

1. CloudFront Function validates the signature.
2. CloudFront serves the cached response directly. No Lambda invocation, no S3 fetch.

**Practical implication:** for a site with a stable set of image-and-transform combinations, nearly all production traffic is served from the cache. Lambda cost is bounded by the number of distinct combinations, not by page views.

**Future work:** an optional second S3 bucket for persisting transformed images would make this cache deterministic (surviving CloudFront evictions), at the cost of additional storage and a write-through pattern in Lambda. This is tracked in the roadmap.

---

## JavaScript Client

The `@rendorix/client` package is a server-side TypeScript library. It resolves preset names to raw transform parameters, validates values, signs the URL, and returns a string ready for `<img src>`. It does not run in the browser.

### Install

```bash
# Pin to a tag (recommended for stability)
npm install github:djmartin2019/Rendorix#v0.0.1

# Or track main
npm install github:djmartin2019/Rendorix#main
```

npm runs the `prepare` script on install, which compiles the TypeScript source — no committed build output required.

### Configuration

Create a single server-side module that initializes the client and exports it. Import from this module in any server context that needs to generate image URLs.

```ts
// lib/rendorix.ts  (server-only — never import from client components or browser code)
import { createRendorix } from "@rendorix/client";

export const rx = createRendorix({
  baseUrl: process.env.RENDORIX_BASE_URL!, // your CloudFront distribution URL
  secret:  process.env.RENDORIX_SECRET!,   // HMAC signing secret — server-only
  presets: {
    hero:   { w: 1200, q: 85, f: "webp" },
    card:   { w: 600,  q: 80, f: "webp" },
    avatar: { w: 128,  q: 70, f: "webp" },
  },
  // defaultTtl: optional, defaults to 30 days.
  // Right for static sites. For per-request SSR, pass defaultTtl: 3600.
});
```

Preset names become literal TypeScript types inferred from the config object — `preset: "hreo"` is a compile-time error with no codegen required.

### `rx.img(key, opts?)`

Returns a fully-signed URL string.

```ts
rx.img("photos/hero.jpg", { preset: "hero" })
// => "https://cdn.example.com/photos/hero.jpg?exp=...&f=webp&q=85&w=1200&s=..."

rx.img("photos/hero.jpg", { preset: "hero", w: 400 })    // override one preset field
rx.img("photos/hero.jpg", { w: 400, f: "jpeg" })         // raw params, no preset
rx.img("photos/hero.jpg", { preset: "hero", ttl: 3600 }) // per-call TTL override
```

| Option | Type | Description |
|--------|------|-------------|
| `preset` | `keyof presets` | Named preset from config. Merged with any inline overrides (overrides win). |
| `w` | `number` | Width in pixels (1–4096). Overrides preset. |
| `h` | `number` | Height in pixels (1–4096). Overrides preset. |
| `f` | `"jpeg" \| "webp" \| "png" \| "avif"` | Output format. Overrides preset. |
| `q` | `number` | Quality 1–100. Overrides preset. |
| `ttl` | `number` | URL lifetime in seconds. Falls back to `defaultTtl`, then 30 days. |

`rx.img()` throws `RendorixError` synchronously for unknown presets, out-of-range dimensions, or invalid formats. Errors surface at build or render time on the server — the browser never receives a malformed URL.

### Framework examples

**Astro (static or SSR)**

```astro
---
import { rx } from "../../lib/rendorix";

const heroUrl = rx.img("projects/acme.jpg", { preset: "hero" });
const cardUrl = rx.img("projects/acme.jpg", { preset: "card" });
---
<img src={heroUrl} alt="Acme hero" />
<img src={cardUrl} alt="Acme card" />
```

**Next.js App Router (server component)**

```tsx
import { rx } from "@/lib/rendorix";

export default function PortfolioPage() {
  const heroUrl = rx.img("projects/acme.jpg", { preset: "hero" });
  return <img src={heroUrl} alt="Acme" />;
}
```

**Express**

```ts
app.get("/api/image-url", (req, res) => {
  const url = rx.img(String(req.query.key), { preset: "card" });
  res.json({ url });
});
```

### Static sites and TTL

For build-time rendering (static Astro, Next.js `generateStaticParams`, etc.), `rx.img()` runs once during `npm run build` and bakes signed URLs into HTML. The 30-day default TTL means URLs stay valid well after deploy. Add a monthly rebuild in CI to refresh them before they expire:

```yaml
# .github/workflows/rebuild.yml
on:
  schedule:
    - cron: "0 6 1 * *"   # 1st of each month at 6 AM UTC
jobs:
  rebuild:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
      # deploy step here (Cloudflare Pages, Vercel, etc.)
```

For SSR, pass `defaultTtl: 3600` so each request gets a fresh, short-lived URL.

---

## URL API (Backend)

The image path maps directly to the S3 object key. Transformations are expressed as query parameters. These are the raw parameters that reach Lambda after the CloudFront Function strips `s` and `exp`.

| Parameter | Description | Example | Default |
|-----------|-------------|---------|---------|
| `w` | Width in pixels | `w=800` | Original width |
| `h` | Height in pixels | `h=600` | Original height |
| `f` | Output format | `f=webp` | `jpeg` |
| `q` | Quality (1–100) | `q=80` | `80` |

**Supported formats:** `jpeg`, `webp`, `png`, `avif`

Images are resized to fit within the given dimensions without upscaling or distorting the aspect ratio (`fit: inside`, `withoutEnlargement: true`).

For application usage, prefer presets via `rx.img()` rather than constructing raw URLs manually. Presets keep transform decisions centralized and consistent.

```
# Resize to 400px wide, keep aspect ratio
/photos/hero.jpg?w=400&exp=...&s=...

# Convert to WebP at 75% quality
/photos/hero.jpg?f=webp&q=75&exp=...&s=...

# Resize and convert in one request
/photos/hero.jpg?w=1200&h=630&f=webp&q=85&exp=...&s=...
```

---

## Security Model

### Signed URLs

All requests must carry a valid HMAC-SHA256 signature. Unsigned requests return `403` from the CloudFront Function before reaching the origin.

**Signing algorithm:**

1. Construct the URL with transform parameters.
2. Add `exp=<unix_timestamp>` for the expiration.
3. Lowercase all keys, sort alphabetically, exclude `s`.
4. Compute `HMAC-SHA256(secret, "/path?sorted_params")` and hex-encode.
5. Append `&s=<hex_signature>`.

The `s` and `exp` parameters are stripped by the CloudFront Function before the request is forwarded to the cache, keeping the cache key clean and allowing URLs with different expiration times to share cache entries.

**Quick signing via CLI:**

```bash
# Sign a URL, expires in 1 hour (default)
RENDORIX_SECRET=your-secret node scripts/sign-url.js "/photo.jpg?w=800&f=webp"
# => /photo.jpg?exp=1714003600&f=webp&w=800&s=a3f1b2c4...

# Sign with a 24-hour TTL
RENDORIX_SECRET=your-secret node scripts/sign-url.js "/photo.jpg?w=800&f=webp" --ttl 86400
```

### Secret rotation

Rotating the signing secret without downtime requires two deploys and no service interruption.

**Step 1 — introduce the new secret while keeping the old as fallback:**

```bash
terraform apply \
  -var="signing_secret=new-secret" \
  -var="signing_secret_previous=old-secret"
```

The CloudFront Function accepts URLs signed by either secret. Existing URLs with the old secret remain valid.

**Step 2 — update your application** to sign new URLs with `new-secret`. Wait for all previously issued URLs with the old secret to expire.

**Step 3 — remove the fallback:**

```bash
terraform apply \
  -var="signing_secret=new-secret" \
  -var="signing_secret_previous="
```

---

## Getting Started

### Prerequisites

- [AWS CLI](https://aws.amazon.com/cli/) configured with credentials
- [Terraform](https://www.terraform.io/) >= 1.5
- [Node.js](https://nodejs.org/) >= 20
- An AWS account

### 1. Build the Lambda package

Sharp requires platform-specific native binaries. Lambda runs on Amazon Linux, so Linux binaries are required regardless of your local OS:

```bash
cd lambda

# Install dependencies
npm install

# Add Linux-specific Sharp binaries (required when building on macOS or Windows)
npm pack @img/sharp-linux-x64@0.34.5 @img/sharp-libvips-linux-x64@1.2.4
mkdir -p node_modules/@img/sharp-linux-x64 node_modules/@img/sharp-libvips-linux-x64
tar xzf img-sharp-linux-x64-0.34.5.tgz -C node_modules/@img/sharp-linux-x64 --strip-components=1
tar xzf img-sharp-libvips-linux-x64-1.2.4.tgz -C node_modules/@img/sharp-libvips-linux-x64 --strip-components=1
rm -f *.tgz

# Create the deployment zip
zip -r function.zip index.js node_modules/
```

### 2. Deploy with Terraform

```bash
cd terraform
terraform init
terraform plan
terraform apply -var="signing_secret=your-secret-here"
```

Terraform outputs:

- `cloudfront_url` — your CDN endpoint
- `lambda_function_url` — direct Lambda URL (useful for debugging)
- `s3_bucket_name` — the bucket to upload originals to

**Terraform variables:**

| Variable | Description | Default |
|----------|-------------|---------|
| `aws_region` | AWS region to deploy into | `us-east-1` |
| `bucket_name` | S3 bucket name for original images | `rendorix-cdn-images` |
| `signing_secret` | HMAC secret for signing image URLs (**required**) | — |
| `signing_secret_previous` | Previous secret for zero-downtime rotation. Optional. | `""` |

### 3. Upload originals to S3

```bash
# Upload a single image
aws s3 cp ./photo.jpg s3://$(terraform -chdir=terraform output -raw s3_bucket_name)/photos/photo.jpg

# Sync a directory of originals
aws s3 sync ./originals/ s3://$(terraform -chdir=terraform output -raw s3_bucket_name)/
```

Upload full-resolution originals. Rendorix transforms on demand — you never manage derived variants.

### 4. Request a transformed image (unsigned, for testing only)

```bash
curl "https://$(terraform -chdir=terraform output -raw cloudfront_url)/test.jpg?w=400&f=webp&q=80" \
  --output test-400.webp
```

All production requests must be signed. Use `rx.img()` from the JavaScript client or `scripts/sign-url.js` for one-off requests.

---

## Tradeoffs vs Managed Image Platforms

Managed image CDNs (Cloudinary, Imgix, Cloudflare Images, and similar) are excellent products with good reasons to use them. Rendorix is not trying to replace them. The differences are intentional:

| | Managed platform | Rendorix |
|---|---|---|
| **Infrastructure ownership** | Vendor-managed | Your AWS account |
| **Cost model** | Per-transformation or per-bandwidth pricing | Pay for what you use (Lambda, S3, CloudFront) at AWS rates |
| **Signing / security** | Platform-specific SDKs | HMAC-SHA256, documented algorithm, no lock-in |
| **Visibility** | Dashboard and analytics | CloudWatch; you instrument what you care about |
| **Setup time** | Minutes | Hours (Terraform + Lambda build) |
| **Operational burden** | Zero | You own the infra |
| **Suitable for** | Teams optimizing for speed of delivery | Teams optimizing for cost control, learning, or infrastructure ownership |

Rendorix is a reasonable choice when you want to understand what an image CDN actually does, when you need the infra to live in your own AWS account for compliance or budget reasons, or when you want to build on top of it rather than work around a vendor's API surface.

---

## Project Structure

```
rendorix/
├── src/                        # JavaScript client (TypeScript)
│   ├── index.ts                # Public exports
│   ├── createRendorix.ts       # Factory: config validation, img() assembly
│   ├── resolve.ts              # Preset lookup + override merge
│   ├── validate.ts             # Bounds and enum checks (mirrors CFF rules)
│   ├── canonicalize.ts         # Canonical signing string construction
│   ├── sign.ts                 # HMAC-SHA256 wrapper
│   ├── errors.ts               # RendorixError with typed code field
│   └── types.ts                # Format, Transform, Presets, Config, ImgOptions
├── test/                       # Client unit tests (vitest)
│   ├── validate.test.ts
│   ├── canonicalize.test.ts
│   ├── sign.test.ts
│   ├── resolve.test.ts
│   ├── createRendorix.test.ts
│   └── parity.test.ts          # Byte-identical signing vs. scripts/sign-url.js
├── cloudfront-function/
│   └── signer.js.tpl           # CloudFront Function source (secrets injected by Terraform)
├── lambda/
│   ├── index.js                # Lambda handler (Sharp image processing)
│   ├── package.json
│   └── function.zip            # Deployment artifact (built locally)
├── scripts/
│   └── sign-url.js             # CLI helper for generating signed URLs
├── terraform/
│   ├── main.tf                 # S3, Lambda, CloudFront Function, CloudFront, IAM
│   ├── providers.tf            # AWS provider + version constraints
│   ├── variables.tf            # Configurable inputs
│   └── outputs.tf              # CloudFront URL, Lambda URL, bucket name
├── package.json                # @rendorix/client — name, version, build scripts
├── tsconfig.json
├── tsup.config.ts
├── Marketing.md                # Positioning, vision, planned DX
├── .gitignore
└── README.md
```

---

## Roadmap

Not a committed schedule — directional ideas in priority order.

**Product / DX**

- [x] Signed URLs with HMAC-SHA256 and expiration
- [x] JavaScript client (`createRendorix`) with preset-based URL building and signing
- [ ] Composable or chained presets
- [ ] Framework integration guides (Astro, Next.js)
- [ ] npm package publishing (deferred until API is stable)

**Infrastructure**

- [ ] Custom domain with ACM certificate
- [ ] Transformed image caching in a second S3 bucket (deterministic cache, survives CloudFront eviction)
- [ ] Automated Lambda packaging via CI/CD (no manual zip step)
- [ ] CloudFront cache invalidation workflow
- [ ] Rate limiting via AWS WAF
- [ ] Secrets Manager integration for signing secrets
- [ ] Monitoring and alerting (CloudWatch)

---

## License

MIT
