"use strict";

const crypto = require("crypto");

const SIGNING_SECRET = "${signing_secret}";
const SIGNING_SECRET_PREVIOUS = "${signing_secret_previous}";

const ALLOWED_PARAMS = new Set(["w", "h", "f", "q", "exp", "s"]);
const ALLOWED_FORMATS = new Set(["jpeg", "jpg", "webp", "png", "avif"]);
const MAX_DIMENSION = 4096;

function respond(statusCode, message) {
  return {
    status: String(statusCode),
    statusDescription: message,
    headers: {
      "content-type": [{ key: "Content-Type", value: "application/json" }],
    },
    body: JSON.stringify({ error: message }),
  };
}

function verifySignature(signingString, provided) {
  const secrets = [SIGNING_SECRET];
  if (SIGNING_SECRET_PREVIOUS) {
    secrets.push(SIGNING_SECRET_PREVIOUS);
  }

  for (const secret of secrets) {
    const computed = crypto
      .createHmac("sha256", secret)
      .update(signingString)
      .digest("hex");

    const a = Buffer.from(computed, "hex");
    const b = Buffer.from(provided, "hex");

    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return true;
    }
  }
  return false;
}

exports.handler = async (event) => {
  const request = event.Records[0].cf.request;
  const uri = request.uri;

  const rawQs = request.querystring || "";
  const parsed = new URLSearchParams(rawQs);
  const params = {};
  for (const [key, value] of parsed.entries()) {
    params[key.toLowerCase()] = value;
  }

  // 1. Whitelist: reject unknown params
  for (const key of Object.keys(params)) {
    if (!ALLOWED_PARAMS.has(key)) {
      return respond(400, "Invalid query parameter: " + key);
    }
  }

  // 2. Value sanity checks
  if (params.w !== undefined) {
    const w = Number(params.w);
    if (!Number.isInteger(w) || w <= 0 || w > MAX_DIMENSION) {
      return respond(400, "Invalid value for w");
    }
  }
  if (params.h !== undefined) {
    const h = Number(params.h);
    if (!Number.isInteger(h) || h <= 0 || h > MAX_DIMENSION) {
      return respond(400, "Invalid value for h");
    }
  }
  if (params.q !== undefined) {
    const q = Number(params.q);
    if (!Number.isInteger(q) || q < 1 || q > 100) {
      return respond(400, "Invalid value for q");
    }
  }
  if (params.f !== undefined && !ALLOWED_FORMATS.has(params.f)) {
    return respond(400, "Invalid value for f");
  }

  // 3. Require s param
  const providedSig = params.s;
  if (!providedSig) {
    return respond(403, "Forbidden");
  }

  // 4. Expiration check
  const expRaw = params.exp;
  if (!expRaw) {
    return respond(403, "Forbidden");
  }
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) {
    return respond(403, "Forbidden");
  }

  // 5. Build canonical signing string (path + sorted params, excluding s)
  const signingParams = Object.entries(params)
    .filter(([key]) => key !== "s")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => key + "=" + value)
    .join("&");
  const signingString = uri + "?" + signingParams;

  // 6. HMAC validation (tries current secret, then previous)
  if (!verifySignature(signingString, providedSig)) {
    return respond(403, "Forbidden");
  }

  // 7. Strip s and exp before forwarding — keeps cache keys clean
  const forwardParams = Object.entries(params)
    .filter(([key]) => key !== "s" && key !== "exp")
    .map(([key, value]) => key + "=" + encodeURIComponent(value))
    .join("&");
  request.querystring = forwardParams;

  return request;
};
