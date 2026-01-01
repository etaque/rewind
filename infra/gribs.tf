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
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.gribs.arn,
          "${aws_s3_bucket.gribs.arn}/*"
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
