
resource "aws_s3_bucket" "gribs" {
  bucket = "rewind-gribs"
}

resource "aws_s3_bucket_public_access_block" "gribs" {
  bucket = aws_s3_bucket.gribs.id

  block_public_acls   = true
  block_public_policy = true
}

resource "aws_s3_bucket_policy" "gribs" {
  bucket = aws_s3_bucket.gribs.id

  policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "${aws_iam_user.gribs_uploader.arn}"
      },
      "Action": [ 
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": [
        "${aws_s3_bucket.gribs.arn}",
        "${aws_s3_bucket.gribs.arn}/*"
      ]
    }
  ]
}
EOF
}
resource "aws_iam_user" "gribs_uploader" {
  name = "rewind-gribs-uploader"
}

resource "aws_iam_access_key" "gribs_uploader" {
  user = aws_iam_user.gribs_uploader.name
}

output "gribs_uploader_secret" {
  value = aws_iam_access_key.gribs_uploader.secret
}

