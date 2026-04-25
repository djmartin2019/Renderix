import { RendorixError } from "./errors.js";
import { canonicalize } from "./canonicalize.js";
import { resolveTransform } from "./resolve.js";
import { sign } from "./sign.js";
import { validateTransform } from "./validate.js";
import type { ImgOptions, Presets, RendorixConfig } from "./types.js";

const DEFAULT_TTL = 60 * 60 * 24 * 30; // 30 days

export interface RendorixClient<P extends Presets = Presets> {
  /**
   * Build a signed Rendorix URL for an image key.
   *
   * @param key  - S3 object key, e.g. "photos/hero.jpg". Leading "/" is stripped.
   * @param opts - Preset name and/or transform overrides plus optional per-call ttl.
   * @returns    A fully-signed URL string ready for use in an <img src>.
   */
  img(key: string, opts?: ImgOptions<P>): string;
}

export function createRendorix<P extends Presets = Presets>(
  config: RendorixConfig<P>,
): RendorixClient<P> {
  const { secret, presets, defaultTtl = DEFAULT_TTL } = config;

  // Validate baseUrl once at factory time so consumers get an early, clear error.
  let baseUrl: string;
  try {
    baseUrl = new URL(config.baseUrl).toString().replace(/\/$/, "");
  } catch {
    throw new RendorixError(
      "invalid_config",
      `baseUrl "${config.baseUrl}" is not a valid URL`,
    );
  }

  if (!secret || typeof secret !== "string") {
    throw new RendorixError("invalid_config", "secret must be a non-empty string");
  }

  return {
    img(key: string, opts: ImgOptions<P> = {}): string {
      const cleanKey = key.replace(/^\/+/, "");
      const path = `/${cleanKey}`;

      const transform = resolveTransform(presets, opts);
      validateTransform(transform);

      const ttl = opts.ttl ?? defaultTtl;
      const exp = Math.floor(Date.now() / 1000) + ttl;

      const { queryWithoutSig, signingString } = canonicalize(path, transform, exp);
      const sig = sign(secret, signingString);

      return `${baseUrl}${path}?${queryWithoutSig}&s=${sig}`;
    },
  };
}
