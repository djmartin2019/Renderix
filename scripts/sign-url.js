#!/usr/bin/env node
"use strict";

/**
 * Rendorix URL Signer
 *
 * Generates a signed image URL with an expiration timestamp.
 *
 * Usage:
 *   RENDORIX_SECRET=mysecret node scripts/sign-url.js "/photo.jpg?w=800&f=webp"
 *   RENDORIX_SECRET=mysecret node scripts/sign-url.js "/photo.jpg?w=800&f=webp" --ttl 86400
 *
 * Options:
 *   --ttl <seconds>   URL lifetime in seconds (default: 3600 = 1 hour)
 *
 * Output:
 *   The signed URL path, ready to append to your CloudFront domain.
 */

const crypto = require("crypto");

const ALLOWED_PARAMS = new Set(["w", "h", "f", "q"]);
const ALLOWED_FORMATS = new Set(["jpeg", "jpg", "webp", "png", "avif"]);
const MAX_DIMENSION = 4096;

function usage() {
  console.error(
    'Usage: RENDORIX_SECRET=<secret> node sign-url.js "<path?params>" [--ttl <seconds>]'
  );
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const rawUrl = args[0];
  if (!rawUrl) usage();

  let ttl = 3600;
  const ttlIdx = args.indexOf("--ttl");
  if (ttlIdx !== -1) {
    const ttlVal = parseInt(args[ttlIdx + 1], 10);
    if (!ttlVal || ttlVal <= 0) {
      console.error("Error: --ttl must be a positive integer (seconds)");
      process.exit(1);
    }
    ttl = ttlVal;
  }

  return { rawUrl, ttl };
}

function signUrl(rawUrl, secret, ttl) {
  const [path, qs = ""] = rawUrl.split("?");

  if (!path.startsWith("/")) {
    console.error("Error: path must start with /");
    process.exit(1);
  }

  // Parse and validate provided params
  const parsed = new URLSearchParams(qs);
  const params = {};
  for (const [key, value] of parsed.entries()) {
    const k = key.toLowerCase();
    if (!ALLOWED_PARAMS.has(k)) {
      console.error(`Error: unknown param "${key}". Allowed: ${[...ALLOWED_PARAMS].join(", ")}`);
      process.exit(1);
    }
    params[k] = value;
  }

  // Validate values
  if (params.w !== undefined) {
    const w = parseInt(params.w, 10);
    if (isNaN(w) || w <= 0 || w > MAX_DIMENSION) {
      console.error(`Error: w must be a positive integer <= ${MAX_DIMENSION}`);
      process.exit(1);
    }
  }
  if (params.h !== undefined) {
    const h = parseInt(params.h, 10);
    if (isNaN(h) || h <= 0 || h > MAX_DIMENSION) {
      console.error(`Error: h must be a positive integer <= ${MAX_DIMENSION}`);
      process.exit(1);
    }
  }
  if (params.q !== undefined) {
    const q = parseInt(params.q, 10);
    if (isNaN(q) || q < 1 || q > 100) {
      console.error("Error: q must be between 1 and 100");
      process.exit(1);
    }
  }
  if (params.f !== undefined && !ALLOWED_FORMATS.has(params.f)) {
    console.error(`Error: f must be one of: ${[...ALLOWED_FORMATS].join(", ")}`);
    process.exit(1);
  }

  // Add expiration
  const exp = Math.floor(Date.now() / 1000) + ttl;
  params.exp = String(exp);

  // Canonicalize: sort keys alphabetically (s excluded — not yet added)
  const canonical = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => k + "=" + v)
    .join("&");

  const signingString = path + "?" + canonical;

  // Compute HMAC-SHA256
  const sig = crypto.createHmac("sha256", secret).update(signingString).digest("hex");

  // Build final URL: canonical params + signature
  const finalQs = canonical + "&s=" + sig;

  return path + "?" + finalQs;
}

// --- Main ---

const secret = process.env.RENDORIX_SECRET;
if (!secret) {
  console.error("Error: RENDORIX_SECRET environment variable is not set");
  process.exit(1);
}

const { rawUrl, ttl } = parseArgs(process.argv);
const signed = signUrl(rawUrl, secret, ttl);

console.log(signed);
