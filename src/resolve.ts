import { RendorixError } from "./errors.js";
import type { ImgOptions, Presets, Transform } from "./types.js";

/**
 * Resolves a preset name + any inline overrides into a concrete Transform.
 *
 * - If `opts.preset` is provided, it must exist in `presets` or a RendorixError is thrown.
 * - Inline transform fields (w, h, f, q) override the preset values (spread merge).
 * - If no preset is provided, inline fields are used directly.
 */
export function resolveTransform<P extends Presets>(
  presets: P | undefined,
  opts: ImgOptions<P>,
): Transform {
  const { preset, ttl: _ttl, ...inlineTransform } = opts;

  if (preset !== undefined) {
    if (!presets || !(preset in presets)) {
      const available = presets ? Object.keys(presets).join(", ") : "(none)";
      throw new RendorixError(
        "unknown_preset",
        `Unknown preset "${preset}". Available presets: ${available}`,
      );
    }
    return { ...presets[preset], ...inlineTransform };
  }

  return inlineTransform;
}
