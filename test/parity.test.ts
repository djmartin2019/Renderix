/**
 * Parity test: the package must produce signing strings byte-identical to those
 * produced by scripts/sign-url.js and validated by cloudfront-function/signer.js.tpl.
 *
 * We inline the reference signing logic from the CLI script so this test remains
 * self-contained and doesn't import a .js CLI file at runtime.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { canonicalize } from "../src/canonicalize.js";
import { sign } from "../src/sign.js";
import { createRendorix } from "../src/createRendorix.js";

afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
// Reference implementation — inlined from scripts/sign-url.js
// ---------------------------------------------------------------------------

function refSignUrl(
  rawUrl: string,
  secret: string,
  ttl: number,
): string {
  const [path, qs = ""] = rawUrl.split("?");
  const parsed = new URLSearchParams(qs);
  const params: Record<string, string> = {};
  for (const [key, value] of parsed.entries()) {
    params[key.toLowerCase()] = value;
  }
  const exp = Math.floor(Date.now() / 1000) + ttl;
  params["exp"] = String(exp);

  const canonical = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const signingString = path + "?" + canonical;
  const sig = createHmac("sha256", secret).update(signingString).digest("hex");
  return path + "?" + canonical + "&s=" + sig;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseParams(url: string): Record<string, string> {
  const qs = url.split("?")[1] ?? "";
  const result: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(qs).entries()) {
    result[k] = v;
  }
  return result;
}

const BASE = "https://cdn.example.com";
const SECRET = "parity-test-secret";
const FIXED_NOW = 1_800_000_000 * 1000; // ms
const TTL = 3600;
const FIXED_EXP = FIXED_NOW / 1000 + TTL;

// ---------------------------------------------------------------------------
// Parity tests
// ---------------------------------------------------------------------------

describe("signing parity with scripts/sign-url.js", () => {
  it("canonicalize produces the same sorting as the CLI script", () => {
    const transform = { w: 800, f: "webp" as const, q: 80 };
    const { signingString } = canonicalize("/photo.jpg", transform, FIXED_EXP);

    // Reference: simulate what the CLI does for the same params
    const refParams = { w: "800", f: "webp", q: "80", exp: String(FIXED_EXP) };
    const refCanonical = Object.entries(refParams)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("&");
    const refSigning = `/photo.jpg?${refCanonical}`;

    expect(signingString).toBe(refSigning);
  });

  it("sign() matches raw HMAC of the same string", () => {
    const input = `/photo.jpg?exp=${FIXED_EXP}&f=webp&q=80&w=800`;
    const expected = createHmac("sha256", SECRET).update(input).digest("hex");
    expect(sign(SECRET, input)).toBe(expected);
  });

  it("full URL from rx.img() matches full URL from refSignUrl() — w/f/q", () => {
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
    const rx = createRendorix({ baseUrl: BASE, secret: SECRET });
    const rxUrl = rx.img("photo.jpg", { w: 800, f: "webp", q: 80, ttl: TTL });
    const refFull = `${BASE}${refSignUrl("/photo.jpg?w=800&f=webp&q=80", SECRET, TTL)}`;

    expect(rxUrl).toBe(refFull);
  });

  it("full URL matches for h/w/f/q", () => {
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
    const rx = createRendorix({ baseUrl: BASE, secret: SECRET });
    const rxUrl = rx.img("photos/hero.jpg", { w: 1200, h: 630, f: "webp", q: 85, ttl: TTL });
    const refFull = `${BASE}${refSignUrl("/photos/hero.jpg?w=1200&h=630&f=webp&q=85", SECRET, TTL)}`;

    expect(rxUrl).toBe(refFull);
  });

  it("full URL matches for exp-only (no transform params)", () => {
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
    const rx = createRendorix({ baseUrl: BASE, secret: SECRET });
    const rxUrl = rx.img("photo.jpg", { ttl: TTL });
    const refFull = `${BASE}${refSignUrl("/photo.jpg", SECRET, TTL)}`;

    expect(rxUrl).toBe(refFull);
  });

  it("different secrets produce different signatures (sanity check)", () => {
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
    const rxA = createRendorix({ baseUrl: BASE, secret: "secret-a" });
    const rxB = createRendorix({ baseUrl: BASE, secret: "secret-b" });
    const sigA = parseParams(rxA.img("x.jpg", { ttl: TTL }))["s"];
    const sigB = parseParams(rxB.img("x.jpg", { ttl: TTL }))["s"];
    expect(sigA).not.toBe(sigB);
  });

  it("CFF strips s+exp: forwarded query contains only transform params", () => {
    // Verify what would remain after CFF strips s and exp — should be just the transform.
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
    const rx = createRendorix({ baseUrl: BASE, secret: SECRET });
    const url = rx.img("photo.jpg", { w: 800, f: "webp", q: 80, ttl: TTL });
    const params = parseParams(url);
    delete params["s"];
    delete params["exp"];
    expect(params).toEqual({ w: "800", f: "webp", q: "80" });
  });
});
