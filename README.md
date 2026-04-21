# Renderix

![AWS](https://img.shields.io/badge/AWS-%23FF9900?style=flat&logo=amazonwebservices&logoColor=white)
![Terraform](https://img.shields.io/badge/Terraform-%235835CC?style=flat&logo=terraform&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?style=flat&logo=node.js&logoColor=white)
![Sharp](https://img.shields.io/badge/Sharp-0.34-99CC00?style=flat&logo=sharp&logoColor=white)
![Lambda](https://img.shields.io/badge/AWS_Lambda-%23FF9900?style=flat&logo=awslambda&logoColor=white)
![S3](https://img.shields.io/badge/Amazon_S3-%23569A31?style=flat&logo=amazons3&logoColor=white)
![CloudFront](https://img.shields.io/badge/CloudFront-CDN-%238C4FFF?style=flat&logo=amazonwebservices&logoColor=white)

Turn any S3 bucket into an on-demand image CDN.

Renderix is a lightweight image delivery service built on AWS. It lets you resize, convert, and optimize images on the fly through a simple URL-based API — no SDK, no pre-processing, no manual optimization.

```
https://your-cdn.cloudfront.net/photos/hero.jpg?w=800&f=webp&q=80
```

Upload your originals to S3. Request any size, format, or quality via query parameters. Renderix handles the rest.

## How It Works

```
Client Request
      │
      ▼
┌──────────────┐    cache hit
│  CloudFront  │ ────────────► Response (fast)
│   (CDN)      │
└──────┬───────┘
       │ cache miss
       ▼
┌──────────────┐
│   Lambda     │  ◄── Node.js + Sharp
│  (process)   │
└──────┬───────┘
       │ fetch original
       ▼
┌──────────────┐
│     S3       │  ◄── Private bucket, originals only
│  (storage)   │
└───────────--─┘
```

1. A request hits **CloudFront**, which caches responses by full URL (path + query string).
2. On a cache miss, CloudFront forwards the request to a **Lambda function**.
3. Lambda fetches the original image from **S3**, applies the requested transformations using [Sharp](https://sharp.pixelplumbing.com/), and returns the result.
4. CloudFront caches the transformed image. Subsequent identical requests are served from the edge.

## URL API

The image path maps directly to the S3 object key. Transformations are controlled via query parameters:

| Parameter | Description      | Example  | Default         |
| --------- | ---------------- | -------- | --------------- |
| `w`       | Width in pixels  | `w=800`  | Original width  |
| `h`       | Height in pixels | `h=600`  | Original height |
| `f`       | Output format    | `f=webp` | `jpeg`          |
| `q`       | Quality (1–100)  | `q=80`   | `80`            |

**Supported formats:** `jpeg`, `webp`, `png`, `avif`

### Examples

```
# Resize to 400px wide, keep aspect ratio
/photos/hero.jpg?w=400

# Convert to WebP at 75% quality
/photos/hero.jpg?f=webp&q=75

# Resize and convert in one request
/photos/hero.jpg?w=1200&h=630&f=webp&q=85

# Serve the original (no transforms)
/photos/hero.jpg
```

Images are resized to fit within the given dimensions without upscaling or distorting aspect ratio.

## Tech Stack

| Layer          | Technology                                | Purpose                                     |
| -------------- | ----------------------------------------- | ------------------------------------------- |
| CDN            | CloudFront                                | Edge caching, HTTPS termination             |
| Compute        | Lambda (Node.js 20.x)                     | Image processing on demand                  |
| Processing     | [Sharp](https://sharp.pixelplumbing.com/) | Resize, format conversion, quality control  |
| Storage        | S3                                        | Private bucket for original images          |
| Infrastructure | Terraform                                 | Provision and manage all AWS resources      |
| IAM            | Least-privilege roles                     | Lambda can only read from S3 and write logs |

## Project Structure

```
renderix/
├── lambda/
│   ├── index.js            # Lambda handler
│   ├── package.json
│   └── function.zip        # Deployment artifact (built locally)
├── terraform/
│   ├── main.tf             # S3, Lambda, CloudFront, IAM
│   ├── providers.tf        # AWS provider + version constraints
│   ├── variables.tf        # Configurable inputs
│   └── outputs.tf          # CloudFront URL, Lambda URL, bucket name
├── .gitignore
└── README.md
```

## Getting Started

### Prerequisites

- [AWS CLI](https://aws.amazon.com/cli/) configured with credentials
- [Terraform](https://www.terraform.io/) >= 1.5
- [Node.js](https://nodejs.org/) >= 20
- An AWS account

### 1. Build the Lambda package

Sharp requires platform-specific native binaries. Since Lambda runs on Amazon Linux, you need to install the Linux binaries regardless of your local OS:

```bash
cd lambda

# Install dependencies
npm install

# Add Linux-specific Sharp binaries (required if building on macOS/Windows)
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
terraform apply
```

Terraform will output:

- `cloudfront_url` — your CDN endpoint
- `lambda_function_url` — direct Lambda URL (useful for debugging)
- `s3_bucket_name` — the bucket to upload images to

### 3. Upload a test image

```bash
aws s3 cp test.jpg s3://$(terraform -chdir=terraform output -raw s3_bucket_name)/test.jpg
```

### 4. Request a transformed image

```bash
curl "https://$(terraform -chdir=terraform output -raw cloudfront_url)/test.jpg?w=400&f=webp&q=80" --output test-400.webp
```

### Configuration

You can override defaults by passing variables to Terraform:

```bash
terraform apply \
  -var="bucket_name=my-custom-bucket" \
  -var="aws_region=eu-west-1" \
  -var="signing_secret=your-secret-here"
```

| Variable                  | Description                                                      | Default               |
| ------------------------- | ---------------------------------------------------------------- | --------------------- |
| `aws_region`              | AWS region to deploy into                                        | `us-east-1`           |
| `bucket_name`             | S3 bucket name for original images                               | `renderix-cdn-images` |
| `signing_secret`          | HMAC secret for signing image URLs (**required**)                | —                     |
| `signing_secret_previous` | Previous secret, set during key rotation (see below). Optional. | `""`                  |

## Signed URLs

All requests to the CDN must be signed. Unsigned requests are rejected at the CloudFront edge by a Lambda@Edge function before they ever reach the origin.

### How signing works

1. Construct the image URL with your transform parameters.
2. Add an expiration timestamp (`exp`) as a Unix timestamp in seconds.
3. Canonicalize the parameters: lowercase all keys, sort alphabetically, exclude `s`.
4. Compute `HMAC-SHA256(secret, "/path?canonicalized_params")` and hex-encode it.
5. Append `&s=<signature>` to the URL.

The signature and expiration are stripped by the edge function before forwarding to the cache, so URLs with different expiration times share the same cache entry for the same image and transforms.

### Generating signed URLs

Use the included helper script. It reads the secret from `RENDERIX_SECRET` and accepts an optional `--ttl` flag (default: 1 hour).

```bash
# Sign a URL, expires in 1 hour (default)
RENDERIX_SECRET=your-secret node scripts/sign-url.js "/photo.jpg?w=800&f=webp"
# => /photo.jpg?exp=1714003600&f=webp&w=800&s=a3f1b2c4...

# Sign a URL with a 24-hour TTL
RENDERIX_SECRET=your-secret node scripts/sign-url.js "/photo.jpg?w=800&f=webp" --ttl 86400
```

Use your CloudFront domain to build the full URL:

```bash
CDN="https://$(terraform -chdir=terraform output -raw cloudfront_url)"
SIGNED=$(RENDERIX_SECRET=your-secret node scripts/sign-url.js "/photo.jpg?w=800&f=webp")
echo "$CDN$SIGNED"
```

### Server-side integration

Sign URLs on your server — never expose the secret to the client. Example in Node.js:

```js
const crypto = require("crypto");

function signUrl(path, params, secret, ttlSeconds = 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const allParams = { ...params, exp: String(exp) };

  const canonical = Object.entries(allParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const sig = crypto
    .createHmac("sha256", secret)
    .update(`${path}?${canonical}`)
    .digest("hex");

  return `${path}?${canonical}&s=${sig}`;
}

// Usage
const url = signUrl("/photo.jpg", { w: "800", f: "webp" }, process.env.RENDERIX_SECRET);
// => /photo.jpg?exp=1714003600&f=webp&w=800&s=a3f1b2c4...
```

### Secret rotation

Rotating the secret without downtime requires two deploys:

**Step 1 — add the old secret as the fallback:**

```bash
terraform apply \
  -var="signing_secret=new-secret" \
  -var="signing_secret_previous=old-secret"
```

The edge function will now accept URLs signed by either secret.

**Step 2 — update your application** to sign new URLs with `new-secret`. Wait for all previously issued URLs to expire.

**Step 3 — remove the fallback:**

```bash
terraform apply \
  -var="signing_secret=new-secret" \
  -var="signing_secret_previous="
```

## Roadmap

These are potential improvements, not commitments. The current version is intentionally minimal.

- [x] Signed URLs with HMAC-SHA256 and expiration
- [ ] Custom domain with ACM certificate
- [ ] Processed image caching in a separate S3 bucket
- [ ] Automated Lambda packaging (CI/CD)
- [ ] Support for crop modes (cover, contain, fill)
- [ ] CloudFront cache invalidation endpoint
- [ ] Rate limiting via AWS WAF
- [ ] Secrets Manager integration for secret storage
- [ ] Monitoring and alerting (CloudWatch dashboards)

## License

MIT
