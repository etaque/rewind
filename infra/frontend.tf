resource "aws_s3_bucket" "frontend_assets" {
  bucket = local.frontend_domain

  tags = {
    ManagedBy = "terraform"
  }
}

resource "aws_s3_bucket_versioning" "frontend_assets" {
  bucket = aws_s3_bucket.frontend_assets.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_website_configuration" "frontend_assets" {
  bucket = aws_s3_bucket.frontend_assets.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

resource "aws_s3_bucket_public_access_block" "frontend_assets" {
  bucket = aws_s3_bucket.frontend_assets.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "frontend_assets" {
  bucket = aws_s3_bucket.frontend_assets.id

  depends_on = [aws_s3_bucket_public_access_block.frontend_assets]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_user.frontend_uploader.arn
        }
        Action = [
          "s3:DeleteObject",
          "s3:GetBucketLocation",
          "s3:GetObject",
          "s3:ListBucket",
          "s3:PutObject"
        ]
        Resource = [
          aws_s3_bucket.frontend_assets.arn,
          "${aws_s3_bucket.frontend_assets.arn}/*"
        ]
      },
      {
        Effect    = "Allow"
        Principal = "*"
        Action    = ["s3:GetObject"]
        Resource  = ["${aws_s3_bucket.frontend_assets.arn}/*"]
      }
    ]
  })
}

resource "aws_cloudfront_distribution" "frontend_cdn" {
  enabled     = true
  price_class = "PriceClass_100"
  aliases     = [local.frontend_domain]

  origin {
    origin_id   = "origin-bucket-${aws_s3_bucket.frontend_assets.id}"
    domain_name = aws_s3_bucket_website_configuration.frontend_assets.website_endpoint

    custom_origin_config {
      origin_protocol_policy = "http-only"
      http_port              = 80
      https_port             = 443
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_root_object = "index.html"

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD", "OPTIONS"]
    target_origin_id = "origin-bucket-${aws_s3_bucket.frontend_assets.id}"
    min_ttl          = 0
    default_ttl      = 300
    max_ttl          = 1200

    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.ssl.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  custom_error_response {
    error_caching_min_ttl = 300
    error_code            = 404
    response_page_path    = "/404.html"
    response_code         = 404
  }

  tags = {
    ManagedBy = "terraform"
  }
}

# Output CloudFront domain for Gandi CNAME configuration
output "cloudfront_domain" {
  description = "CloudFront domain to use as CNAME target for rewind.milox.dev"
  value       = aws_cloudfront_distribution.frontend_cdn.domain_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID for cache invalidation"
  value       = aws_cloudfront_distribution.frontend_cdn.id
}

resource "aws_iam_user" "frontend_uploader" {
  name = "rewind-frontend-uploader"
}

resource "aws_iam_access_key" "frontend_uploader" {
  user = aws_iam_user.frontend_uploader.name
}

output "frontend_uploader_secret" {
  value     = aws_iam_access_key.frontend_uploader.secret
  sensitive = true
}
