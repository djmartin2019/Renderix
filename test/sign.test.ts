import { describe, it, expect } from "vitest";
import { sign } from "../src/sign.js";
import { createHmac } from "node:crypto";

const SECRET = "test-secret";
const INPUT = "/photo.jpg?exp=1800000000&w=800";

describe("sign", () => {
  it("produces a 64-character hex string", () => {
    const result = sign(SECRET, INPUT);
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same input", () => {
    expect(sign(SECRET, INPUT)).toBe(sign(SECRET, INPUT));
  });

  it("differs for different secrets", () => {
    expect(sign("secret-a", INPUT)).not.toBe(sign("secret-b", INPUT));
  });

  it("differs for different inputs", () => {
    expect(sign(SECRET, "/photo.jpg?exp=1&w=800")).not.toBe(
      sign(SECRET, "/photo.jpg?exp=2&w=800"),
    );
  });

  it("matches raw node:crypto HMAC-SHA256", () => {
    const expected = createHmac("sha256", SECRET).update(INPUT).digest("hex");
    expect(sign(SECRET, INPUT)).toBe(expected);
  });
});
