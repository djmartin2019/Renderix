variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "bucket_name" {
  description = "Name for the S3 bucket storing original images"
  type        = string
  default     = "renderix-cdn-images"
}

variable "signing_secret" {
  description = "Current HMAC secret for signing image URLs"
  type        = string
  sensitive   = true
}

variable "signing_secret_previous" {
  description = "Previous HMAC secret (for zero-downtime rotation). Leave empty when not rotating."
  type        = string
  sensitive   = true
  default     = ""
}
