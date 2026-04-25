export type Format = "jpeg" | "jpg" | "webp" | "png" | "avif";

export interface Transform {
  w?: number;
  h?: number;
  f?: Format;
  q?: number;
}

export type Presets = Record<string, Transform>;

export interface RendorixConfig<P extends Presets = Presets> {
  /** Base URL of the CloudFront distribution, e.g. "https://cdn.example.com" */
  baseUrl: string;
  /** HMAC-SHA256 signing secret — server-only, never expose to the browser */
  secret: string;
  /** Named image presets, e.g. { hero: { w: 1200, q: 85, f: "webp" } } */
  presets?: P;
  /** Default URL lifetime in seconds. Defaults to 30 days. */
  defaultTtl?: number;
}

export interface ImgOptions<P extends Presets = Presets> extends Transform {
  /** Name of a preset defined in the config. Merged with any inline transform overrides. */
  preset?: keyof P & string;
  /** Override the TTL for this single URL (seconds). Falls back to config.defaultTtl. */
  ttl?: number;
}
