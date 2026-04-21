output "cloudfront_url" {
  description = "CloudFront distribution domain name"
  value       = aws_cloudfront_distribution.cdn.domain_name
}

output "lambda_function_url" {
  description = "Direct Lambda function URL (bypass CDN)"
  value       = aws_lambda_function_url.url.function_url
}

output "s3_bucket_name" {
  description = "S3 bucket for original images"
  value       = aws_s3_bucket.images.id
}

output "signing_secret" {
  description = "Current HMAC signing secret — use this to generate signed URLs"
  value       = var.signing_secret
  sensitive   = true
}
