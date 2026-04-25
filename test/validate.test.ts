import { describe, it, expect } from "vitest";
import { validateTransform, MAX_DIMENSION, MIN_QUALITY, MAX_QUALITY } from "../src/validate.js";
import { RendorixError } from "../src/errors.js";

describe("validateTransform", () => {
  it("passes for empty transform", () => {
    expect(() => validateTransform({})).not.toThrow();
  });

  it("passes for valid w/h", () => {
    expect(() => validateTransform({ w: 800, h: 600 })).not.toThrow();
    expect(() => validateTransform({ w: 1 })).not.toThrow();
    expect(() => validateTransform({ w: MAX_DIMENSION })).not.toThrow();
  });

  it("throws for w = 0", () => {
    expect(() => validateTransform({ w: 0 })).toThrow(RendorixError);
  });

  it("throws for w > MAX_DIMENSION", () => {
    const err = (() => {
      try { validateTransform({ w: MAX_DIMENSION + 1 }); }
      catch (e) { return e; }
    })() as RendorixError;
    expect(err.code).toBe("invalid_dimension");
  });

  it("throws for non-integer w", () => {
    expect(() => validateTransform({ w: 1.5 })).toThrow(RendorixError);
  });

  it("throws for h = 0", () => {
    expect(() => validateTransform({ h: 0 })).toThrow(RendorixError);
  });

  it("passes for valid q", () => {
    expect(() => validateTransform({ q: 1 })).not.toThrow();
    expect(() => validateTransform({ q: 80 })).not.toThrow();
    expect(() => validateTransform({ q: MAX_QUALITY })).not.toThrow();
  });

  it("throws for q < MIN_QUALITY", () => {
    expect(() => validateTransform({ q: MIN_QUALITY - 1 })).toThrow(RendorixError);
  });

  it("throws for q > MAX_QUALITY", () => {
    const err = (() => {
      try { validateTransform({ q: MAX_QUALITY + 1 }); }
      catch (e) { return e; }
    })() as RendorixError;
    expect(err.code).toBe("invalid_quality");
  });

  it("passes for valid formats", () => {
    for (const f of ["jpeg", "jpg", "webp", "png", "avif"] as const) {
      expect(() => validateTransform({ f })).not.toThrow();
    }
  });

  it("throws for unknown format", () => {
    const err = (() => {
      try { validateTransform({ f: "gif" as never }); }
      catch (e) { return e; }
    })() as RendorixError;
    expect(err.code).toBe("invalid_format");
  });
});
