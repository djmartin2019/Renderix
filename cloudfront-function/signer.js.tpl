// CloudFront Function — viewer-request (runtime: cloudfront-js-2.0)
// Validates HMAC-SHA256 signed URLs before forwarding to the origin.
// Secrets are injected at deploy time by Terraform templatefile().

var SIGNING_SECRET = "${signing_secret}";
var SIGNING_SECRET_PREVIOUS = "${signing_secret_previous}";

var ALLOWED_PARAMS = { w: true, h: true, f: true, q: true, exp: true, s: true };
var ALLOWED_FORMATS = { jpeg: true, jpg: true, webp: true, png: true, avif: true };
var MAX_DIMENSION = 4096;

function respond(status, message) {
  return {
    statusCode: status,
    statusDescription: message,
    headers: { "content-type": { value: "application/json" } },
    body: JSON.stringify({ error: message }),
  };
}

// Plain string equality is acceptable here: HMAC-SHA256 output is always
// exactly 64 hex chars — no incremental structure an attacker can probe.
// CloudFront network jitter far exceeds any micro-timing from == comparison.
function verifySignature(signingString, provided) {
  var secrets = [SIGNING_SECRET];
  if (SIGNING_SECRET_PREVIOUS) {
    secrets.push(SIGNING_SECRET_PREVIOUS);
  }
  for (var i = 0; i < secrets.length; i++) {
    var computed = crypto
      .createHmac("sha256", secrets[i])
      .update(signingString)
      .digest("hex");
    if (computed === provided) {
      return true;
    }
  }
  return false;
}

function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // CFF querystring is an auto-parsed object: { key: { value: "...", multiValue: [...] } }
  var qs = request.querystring;

  // Flatten to a simple map with lowercased keys
  var params = {};
  for (var key in qs) {
    params[key.toLowerCase()] = qs[key].value;
  }

  // 1. Whitelist: reject unknown params
  for (var p in params) {
    if (!ALLOWED_PARAMS[p]) {
      return respond(400, "Invalid query parameter: " + p);
    }
  }

  // 2. Value sanity checks
  if (params.w !== undefined) {
    var w = Number(params.w);
    if (!Number.isInteger(w) || w <= 0 || w > MAX_DIMENSION) {
      return respond(400, "Invalid value for w");
    }
  }
  if (params.h !== undefined) {
    var h = Number(params.h);
    if (!Number.isInteger(h) || h <= 0 || h > MAX_DIMENSION) {
      return respond(400, "Invalid value for h");
    }
  }
  if (params.q !== undefined) {
    var q = Number(params.q);
    if (!Number.isInteger(q) || q < 1 || q > 100) {
      return respond(400, "Invalid value for q");
    }
  }
  if (params.f !== undefined && !ALLOWED_FORMATS[params.f]) {
    return respond(400, "Invalid value for f");
  }

  // 3. Require signature
  var providedSig = params.s;
  if (!providedSig) {
    return respond(403, "Forbidden");
  }

  // 4. Expiration check
  var expRaw = params.exp;
  if (!expRaw) {
    return respond(403, "Forbidden");
  }
  var exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) {
    return respond(403, "Forbidden");
  }

  // 5. Build canonical signing string (path + sorted params, excluding s)
  var signingEntries = [];
  for (var k in params) {
    if (k !== "s") {
      signingEntries.push(k + "=" + params[k]);
    }
  }
  signingEntries.sort();
  var signingString = uri + "?" + signingEntries.join("&");

  // 6. HMAC validation (tries current secret, then previous for zero-downtime rotation)
  if (!verifySignature(signingString, providedSig)) {
    return respond(403, "Forbidden");
  }

  // 7. Strip s and exp before forwarding — keeps the cache key clean (only w/h/f/q)
  var forwardQs = {};
  for (var fk in params) {
    if (fk !== "s" && fk !== "exp") {
      forwardQs[fk] = { value: params[fk] };
    }
  }
  request.querystring = forwardQs;

  return request;
}
