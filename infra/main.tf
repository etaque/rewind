provider "aws" {
  region  = "eu-west-3"
  profile = "rewind-terraform"
}

provider "aws" {
  alias   = "global"
  region  = "us-east-1"
  profile = "rewind-terraform"
}

data "aws_acm_certificate" "ssl" {
  provider = aws.global
  domain   = "*.skiffr.me"
  statuses = ["ISSUED"]
}

data "aws_route53_zone" "zone" {
  name = "skiffr.me"
}

locals {
  frontend_domain = "rewind.skiffr.me"
  backend_domain  = "rewind-api.skiffr.me"
}
