resource "aws_instance" "backend" {
  ami           = "ami-0d3f551818b21ed81"
  instance_type = "t2.micro"
}

resource "aws_route53_record" "backend" {
  zone_id = data.aws_route53_zone.zone.zone_id
  name    = local.backend_domain
  type    = "A"
  ttl     = "300"
  records = [aws_instance.backend.public_ip]
}

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
