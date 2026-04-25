import type { Transform } from "./types.js";

export interface Canonicalized {
  /** The query string to forward (without s=) */
  queryWithoutSig: string;
  /** The string fed into HMAC: "/path?sorted-params-without-s" */
  signingString: string;
}

/**
 * Builds the canonical signing string and the forwarded query string.
 *
 * Rules (must match cloudfront-function/signer.js.tpl):
 * - Keys are lowercased.
 * - All params (transform fields + exp) are sorted alphabetically.
 * - "s" is excluded from both the signing string and the forwarded query.
 */
export function canonicalize(
  path: string,
  transform: Transform,
  expSeconds: number,
): Canonicalized {
  const entries: Record<string, string> = {};

  if (transform.w !== undefined) entries["w"] = String(transform.w);
  if (transform.h !== undefined) entries["h"] = String(transform.h);
  if (transform.f !== undefined) entries["f"] = transform.f;
  if (transform.q !== undefined) entries["q"] = String(transform.q);
  entries["exp"] = String(expSeconds);

  const sorted = Object.entries(entries).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  const queryWithoutSig = sorted.map(([k, v]) => `${k}=${v}`).join("&");
  const signingString = `${path}?${queryWithoutSig}`;

  return { queryWithoutSig, signingString };
}
