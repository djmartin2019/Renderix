import { RendorixError } from "./errors.js";
import type { Format, Transform } from "./types.js";

export const MAX_DIMENSION = 4096;
export const MIN_QUALITY = 1;
export const MAX_QUALITY = 100;
export const ALLOWED_FORMATS = new Set<Format>([
  "jpeg",
  "jpg",
  "webp",
  "png",
  "avif",
]);

export function validateTransform(t: Transform): void {
  if (t.w !== undefined) {
    if (!Number.isInteger(t.w) || t.w < 1 || t.w > MAX_DIMENSION) {
      throw new RendorixError(
        "invalid_dimension",
        `w must be an integer between 1 and ${MAX_DIMENSION}, got ${t.w}`,
      );
    }
  }
  if (t.h !== undefined) {
    if (!Number.isInteger(t.h) || t.h < 1 || t.h > MAX_DIMENSION) {
      throw new RendorixError(
        "invalid_dimension",
        `h must be an integer between 1 and ${MAX_DIMENSION}, got ${t.h}`,
      );
    }
  }
  if (t.q !== undefined) {
    if (
      !Number.isInteger(t.q) ||
      t.q < MIN_QUALITY ||
      t.q > MAX_QUALITY
    ) {
      throw new RendorixError(
        "invalid_quality",
        `q must be an integer between ${MIN_QUALITY} and ${MAX_QUALITY}, got ${t.q}`,
      );
    }
  }
  if (t.f !== undefined && !ALLOWED_FORMATS.has(t.f)) {
    throw new RendorixError(
      "invalid_format",
      `f must be one of ${[...ALLOWED_FORMATS].join(", ")}, got "${t.f}"`,
    );
  }
}
