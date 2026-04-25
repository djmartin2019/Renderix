export type RendorixErrorCode =
  | "unknown_preset"
  | "invalid_dimension"
  | "invalid_quality"
  | "invalid_format"
  | "invalid_config";

export class RendorixError extends Error {
  readonly code: RendorixErrorCode;

  constructor(code: RendorixErrorCode, message: string) {
    super(message);
    this.name = "RendorixError";
    this.code = code;
  }
}
