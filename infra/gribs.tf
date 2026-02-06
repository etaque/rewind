# GRIB files bucket (private, server-only access)
resource "aws_s3_bucket" "gribs" {
  bucket = "rewind-gribs"

  tags = {
    ManagedBy = "terraform"
  }
}

resource "aws_s3_bucket_public_access_block" "gribs" {
  bucket = aws_s3_bucket.gribs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "gribs" {
  bucket = aws_s3_bucket.gribs.id

  rule {
    id     = "move-to-glacier"
    status = "Enabled"

    filter {}

    transition {
      days          = 7
      storage_class = "GLACIER"
    }
  }
}

# Wind rasters bucket (public read for client access)
resource "aws_s3_bucket" "rasters" {
  bucket = "rewind-wind-rasters"

  tags = {
    ManagedBy = "terraform"
  }
}

resource "aws_s3_bucket_public_access_block" "rasters" {
  bucket = aws_s3_bucket.rasters.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "rasters_public_read" {
  bucket = aws_s3_bucket.rasters.id

  depends_on = [aws_s3_bucket_public_access_block.rasters]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.rasters.arn}/*"
      }
    ]
  })
}

resource "aws_s3_bucket_cors_configuration" "rasters" {
  bucket = aws_s3_bucket.rasters.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

# Race paths bucket (public read for client replay)
resource "aws_s3_bucket" "paths" {
  bucket = "rewind-race-paths"

  tags = {
    ManagedBy = "terraform"
  }
}

resource "aws_s3_bucket_public_access_block" "paths" {
  bucket = aws_s3_bucket.paths.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "paths_public_read" {
  bucket = aws_s3_bucket.paths.id

  depends_on = [aws_s3_bucket_public_access_block.paths]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.paths.arn}/*"
      }
    ]
  })
}

resource "aws_s3_bucket_cors_configuration" "paths" {
  bucket = aws_s3_bucket.paths.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

# IAM user for server to access both buckets
resource "aws_iam_user" "gribs_uploader" {
  name = "rewind-gribs-uploader"
}

resource "aws_iam_user_policy" "gribs_uploader" {
  name = "rewind-gribs-uploader-policy"
  user = aws_iam_user.gribs_uploader.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.gribs.arn,
          "${aws_s3_bucket.gribs.arn}/*",
          aws_s3_bucket.rasters.arn,
          "${aws_s3_bucket.rasters.arn}/*",
          aws_s3_bucket.paths.arn,
          "${aws_s3_bucket.paths.arn}/*"
        ]
      }
    ]
  })
}

resource "aws_iam_access_key" "gribs_uploader" {
  user = aws_iam_user.gribs_uploader.name
}

output "gribs_uploader_secret" {
  value     = aws_iam_access_key.gribs_uploader.secret
  sensitive = true
}

output "rasters_bucket_url" {
  value = "https://${aws_s3_bucket.rasters.bucket_regional_domain_name}"
}

output "paths_bucket_url" {
  value = "https://${aws_s3_bucket.paths.bucket_regional_domain_name}"
}
