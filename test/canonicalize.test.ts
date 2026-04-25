import { describe, it, expect } from "vitest";
import { canonicalize } from "../src/canonicalize.js";

const EXP = 1_800_000_000;

describe("canonicalize", () => {
  it("includes exp in the signing string", () => {
    const { signingString } = canonicalize("/photo.jpg", {}, EXP);
    expect(signingString).toContain(`exp=${EXP}`);
  });

  it("sorts keys alphabetically", () => {
    const { queryWithoutSig } = canonicalize("/photo.jpg", { w: 800, f: "webp", q: 80 }, EXP);
    const keys = queryWithoutSig.split("&").map((p) => p.split("=")[0]);
    expect(keys).toEqual([...keys].sort());
  });

  it("does not include s in the output", () => {
    const { queryWithoutSig, signingString } = canonicalize("/photo.jpg", { w: 400 }, EXP);
    expect(queryWithoutSig).not.toContain("s=");
    expect(signingString).not.toContain("s=");
  });

  it("produces expected signing string for w/f/q/exp", () => {
    const { signingString } = canonicalize("/photo.jpg", { w: 800, f: "webp", q: 85 }, EXP);
    // keys sorted: exp, f, q, w
    expect(signingString).toBe(`/photo.jpg?exp=${EXP}&f=webp&q=85&w=800`);
  });

  it("omits undefined transform fields", () => {
    const { queryWithoutSig } = canonicalize("/photo.jpg", { w: 400 }, EXP);
    expect(queryWithoutSig).not.toContain("h=");
    expect(queryWithoutSig).not.toContain("f=");
    expect(queryWithoutSig).not.toContain("q=");
    expect(queryWithoutSig).toContain("w=400");
  });

  it("handles empty transform (exp only)", () => {
    const { signingString } = canonicalize("/img.png", {}, EXP);
    expect(signingString).toBe(`/img.png?exp=${EXP}`);
  });

  it("produces the same result for equivalent h/w/f/q combinations regardless of field ordering", () => {
    const a = canonicalize("/x.jpg", { w: 1200, h: 630, f: "webp", q: 85 }, EXP);
    const b = canonicalize("/x.jpg", { h: 630, q: 85, w: 1200, f: "webp" }, EXP);
    expect(a.signingString).toBe(b.signingString);
  });
});
