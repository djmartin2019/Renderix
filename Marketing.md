# Rendorix

**Stop thinking about image optimization.**

Rendorix is a developer-first image delivery service that lets you transform and optimize images using simple, semantic **presets** — instead of messy query parameters.

No more guessing widths. No more tweaking quality. No more memorizing transformation options.

Just:

```
/photo.jpg?p=hero
```

---

## The problem

Image optimization today is unnecessarily complicated.

Developers constantly deal with:

- Arbitrary width and quality decisions
- Inconsistent image sizes across apps
- Bloated URLs like `?w=783&q=82&f=webp`
- Too many options, not enough defaults

Every image becomes a mini decision.

---

## The solution

Rendorix replaces parameter-heavy APIs with **opinionated presets**.

Instead of asking: *“How should I transform this image?”*

You define: *“What role does this image play?”*

---

## Presets over parameters

Define your image system once:

```json
{
  "hero": { "w": 1200, "q": 85, "f": "webp" },
  "card": { "w": 600, "q": 80, "f": "webp" },
  "avatar": { "w": 128, "q": 70, "f": "webp" }
}
```

Then use it everywhere:

```
/photo.jpg?p=hero
/photo.jpg?p=card
/photo.jpg?p=avatar
```

No more second-guessing.

---

## Why this works

Rendorix is inspired by the same principles that made utility-first CSS popular:

- **Constraints** over chaos
- **Consistency** over customization
- **Speed** over decision fatigue

You don’t need fifty transformation options. You need the right five.

---

## Built for developers

- URL-based API (no SDK required for the core flow)
- Works with any frontend framework
- Predictable, composable image behavior
- Zero dashboard required

---

## Under the hood

Rendorix runs on AWS:

- **CloudFront** — global caching and delivery
- **Edge validation** — secure, signed requests (CloudFront Function)
- **Lambda + Sharp** — on-demand image processing
- **S3** — durable, private storage for originals

Every unique transformation is computed once and cached at the edge.

---

## Fast by default

- Automatic format optimization (WebP / AVIF)
- Smart quality defaults (via presets)
- CDN-level caching
- Zero redundant processing

---

## Example

|        | URL |
| ------ | --- |
| Before | `/photo.jpg?w=837&q=82&f=webp` |
| After  | `/photo.jpg?p=hero` |

Same intent. Cleaner URL.

*(Presets are part of the product direction; see the repo README for what ships today.)*

---

## Who this is for

- Developers tired of tweaking image parameters
- Indie builders who want sane defaults
- Teams that want consistent image behavior across apps

---

## What Rendorix is not

- Not a bloated media platform
- Not a dashboard-heavy SaaS
- Not a “configure everything” tool

Rendorix is intentionally minimal.

---

## Philosophy

You shouldn’t have to think about image optimization.

You should be able to say: **“This is a hero image.”** — and move on.

---

## Coming soon

- Preset parameter (`p=hero`) wired to configurable transforms
- Composable presets (`p=hero,rounded,blur`)
- Lightweight JavaScript helper for URLs, signing, and preset names
- Framework guides (Astro, Next.js, etc.)
- Optional hosted / managed offering

---

## Developer experience (planned)

Rendorix isn’t only a CDN. The goal is to feel effortless in real apps: no manual URL construction, no parameter juggling, no copy-pasted signing logic in every repo.

### No more URL construction

Instead of:

```
/photo.jpg?p=hero&exp=1714003600&s=a3f1b2c4...
```

You write:

```js
img("photo.jpg", { preset: "hero" });
```

### Built-in signing

Secure delivery shouldn’t require custom crypto in every project. The planned client would:

- Generate expiration timestamps
- Canonicalize parameters
- Sign with HMAC-SHA256
- Append the correct query string

…behind one function call.

### Works anywhere

Framework-agnostic by design: React, Astro, Next.js, Express — any JavaScript environment.

### Zero-configuration feel (target API)

Environment variables:

```bash
RENDORIX_BASE_URL=https://img.rendorix.dev
RENDORIX_SECRET=your-secret
```

Initialize once:

```js
const rx = createRendorix({
  baseUrl: process.env.RENDORIX_BASE_URL,
  secret: process.env.RENDORIX_SECRET,
});
```

Use everywhere:

```js
rx.img("photo.jpg", { preset: "hero" });
```

```jsx
<img src={rx.img("photo.jpg", { preset: "hero" })} alt="" />
```

### Secure by default

Signing stays server-side. No secrets in the browser. No unsigned traffic to your origin.

---

## Why this matters

Most image services give you power. Rendorix aims to give you **clarity**.

- No parameter guessing
- No repetitive setup
- No reinventing signing logic

Just optimized images — without thinking about how the plumbing works.

---

## The goal

Rendorix isn’t trying to be everything.

It’s trying to be the simplest way to get optimized images into your app — **without** thinking about how it works.
