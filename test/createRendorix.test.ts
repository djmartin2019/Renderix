import { describe, it, expect, vi, afterEach } from "vitest";
import { createRendorix } from "../src/createRendorix.js";
import { RendorixError } from "../src/errors.js";

const BASE = "https://cdn.example.com";
const SECRET = "test-secret-xyz";

const PRESETS = {
  hero:   { w: 1200, q: 85, f: "webp" as const },
  card:   { w: 600,  q: 80, f: "webp" as const },
};

afterEach(() => vi.restoreAllMocks());

describe("createRendorix — config validation", () => {
  it("throws for invalid baseUrl", () => {
    expect(() =>
      createRendorix({ baseUrl: "not-a-url", secret: SECRET }),
    ).toThrow(RendorixError);
  });

  it("throws for empty secret", () => {
    expect(() =>
      createRendorix({ baseUrl: BASE, secret: "" }),
    ).toThrow(RendorixError);
  });
});

describe("rx.img — URL shape", () => {
  const rx = createRendorix({ baseUrl: BASE, secret: SECRET, presets: PRESETS });

  it("returns a string starting with baseUrl", () => {
    const url = rx.img("photo.jpg");
    expect(url.startsWith(BASE)).toBe(true);
  });

  it("includes s= in the URL", () => {
    const url = rx.img("photo.jpg");
    expect(url).toContain("s=");
  });

  it("includes exp= in the URL", () => {
    const url = rx.img("photo.jpg");
    expect(url).toContain("exp=");
  });

  it("strips leading slash from key", () => {
    const a = rx.img("photo.jpg");
    const b = rx.img("/photo.jpg");
    // Both should produce the same URL modulo exp-driven timestamp difference.
    // To compare structurally, freeze time.
    expect(a.replace(/exp=\d+/, "exp=X").replace(/s=[0-9a-f]+/, "s=X"))
      .toBe(b.replace(/exp=\d+/, "exp=X").replace(/s=[0-9a-f]+/, "s=X"));
  });

  it("produces different signatures for different keys", () => {
    const a = rx.img("photo-a.jpg");
    const b = rx.img("photo-b.jpg");
    const sig = (u: string) => new URLSearchParams(u.split("?")[1]).get("s");
    expect(sig(a)).not.toBe(sig(b));
  });
});

describe("rx.img — preset resolution", () => {
  const rx = createRendorix({ baseUrl: BASE, secret: SECRET, presets: PRESETS });

  it("expands a known preset into transform params", () => {
    const url = rx.img("photo.jpg", { preset: "hero" });
    expect(url).toContain("w=1200");
    expect(url).toContain("q=85");
    expect(url).toContain("f=webp");
  });

  it("allows raw params without a preset", () => {
    const url = rx.img("photo.jpg", { w: 400, f: "jpeg" });
    expect(url).toContain("w=400");
    expect(url).toContain("f=jpeg");
  });

  it("allows override on top of preset", () => {
    const url = rx.img("photo.jpg", { preset: "hero", w: 400 });
    expect(url).toContain("w=400");
    expect(url).toContain("q=85");
  });

  it("throws for unknown preset", () => {
    expect(() => rx.img("photo.jpg", { preset: "nope" as never })).toThrow(RendorixError);
  });
});

describe("rx.img — validation", () => {
  const rx = createRendorix({ baseUrl: BASE, secret: SECRET });

  it("throws for w > 4096", () => {
    expect(() => rx.img("x.jpg", { w: 5000 })).toThrow(RendorixError);
  });

  it("throws for q = 0", () => {
    expect(() => rx.img("x.jpg", { q: 0 })).toThrow(RendorixError);
  });

  it("throws for unknown format", () => {
    expect(() => rx.img("x.jpg", { f: "gif" as never })).toThrow(RendorixError);
  });
});

describe("rx.img — TTL", () => {
  it("uses custom per-call ttl", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000_000 * 1000);
    const rx = createRendorix({ baseUrl: BASE, secret: SECRET });
    const url = rx.img("x.jpg", { ttl: 7200 });
    const exp = Number(new URLSearchParams(url.split("?")[1]).get("exp"));
    expect(exp).toBe(1_000_000_000 + 7200);
  });

  it("falls back to defaultTtl from config", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000_000 * 1000);
    const rx = createRendorix({ baseUrl: BASE, secret: SECRET, defaultTtl: 3600 });
    const url = rx.img("x.jpg");
    const exp = Number(new URLSearchParams(url.split("?")[1]).get("exp"));
    expect(exp).toBe(1_000_000_000 + 3600);
  });

  it("defaults to 30 days when no ttl is specified", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000_000 * 1000);
    const rx = createRendorix({ baseUrl: BASE, secret: SECRET });
    const url = rx.img("x.jpg");
    const exp = Number(new URLSearchParams(url.split("?")[1]).get("exp"));
    expect(exp).toBe(1_000_000_000 + 60 * 60 * 24 * 30);
  });
});

describe("rx.img — signature determinism", () => {
  it("produces identical URL for identical inputs at the same timestamp", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000_000 * 1000);
    const rx = createRendorix({ baseUrl: BASE, secret: SECRET, presets: PRESETS });
    const a = rx.img("photo.jpg", { preset: "hero" });
    const b = rx.img("photo.jpg", { preset: "hero" });
    expect(a).toBe(b);
  });
});
