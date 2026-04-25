import { describe, it, expect } from "vitest";
import { resolveTransform } from "../src/resolve.js";
import { RendorixError } from "../src/errors.js";

const PRESETS = {
  hero:   { w: 1200, q: 85, f: "webp" as const },
  card:   { w: 600,  q: 80, f: "webp" as const },
  avatar: { w: 128,  q: 70, f: "webp" as const },
};

describe("resolveTransform", () => {
  it("returns the preset transform when preset is given", () => {
    const t = resolveTransform(PRESETS, { preset: "hero" });
    expect(t).toEqual({ w: 1200, q: 85, f: "webp" });
  });

  it("merges inline overrides on top of preset", () => {
    const t = resolveTransform(PRESETS, { preset: "hero", w: 400 });
    expect(t).toEqual({ w: 400, q: 85, f: "webp" });
  });

  it("override wins for every field", () => {
    const t = resolveTransform(PRESETS, { preset: "card", w: 100, q: 50, f: "png" });
    expect(t).toEqual({ w: 100, q: 50, f: "png" });
  });

  it("uses raw transform when no preset is specified", () => {
    const t = resolveTransform(PRESETS, { w: 400, f: "jpeg" });
    expect(t).toEqual({ w: 400, f: "jpeg" });
  });

  it("returns empty transform when opts is empty", () => {
    const t = resolveTransform(PRESETS, {});
    expect(t).toEqual({});
  });

  it("strips ttl from the returned transform", () => {
    const t = resolveTransform(PRESETS, { preset: "hero", ttl: 7200 });
    expect(t).not.toHaveProperty("ttl");
  });

  it("strips preset key from the returned transform", () => {
    const t = resolveTransform(PRESETS, { preset: "hero" });
    expect(t).not.toHaveProperty("preset");
  });

  it("throws RendorixError for unknown preset", () => {
    const err = (() => {
      try { resolveTransform(PRESETS, { preset: "nope" as never }); }
      catch (e) { return e; }
    })() as RendorixError;
    expect(err).toBeInstanceOf(RendorixError);
    expect(err.code).toBe("unknown_preset");
    expect(err.message).toContain("nope");
    expect(err.message).toContain("hero");
  });

  it("throws when presets is undefined and a preset name is given", () => {
    const err = (() => {
      try { resolveTransform(undefined, { preset: "hero" as never }); }
      catch (e) { return e; }
    })() as RendorixError;
    expect(err).toBeInstanceOf(RendorixError);
    expect(err.code).toBe("unknown_preset");
  });
});
