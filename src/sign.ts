import { createHmac } from "node:crypto";

export function sign(secret: string, signingString: string): string {
  return createHmac("sha256", secret).update(signingString).digest("hex");
}
