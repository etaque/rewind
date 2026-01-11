provider "aws" {
  region  = "eu-west-3"
  profile = "rewind-terraform"
}

provider "aws" {
  alias   = "global"
  region  = "us-east-1"
  profile = "rewind-terraform"
}

# ACM certificate for CloudFront (must be in us-east-1)
resource "aws_acm_certificate" "ssl" {
  provider          = aws.global
  domain_name       = "rewind.taque.fr"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    ManagedBy = "terraform"
  }
}

# Output the DNS validation records to configure in Gandi
output "acm_validation_records" {
  description = "DNS records to add in Gandi for ACM certificate validation"
  value = {
    for dvo in aws_acm_certificate.ssl.domain_validation_options : dvo.domain_name => {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  }
}

# Wait for certificate validation (requires DNS records to be configured in Gandi first)
resource "aws_acm_certificate_validation" "ssl" {
  provider        = aws.global
  certificate_arn = aws_acm_certificate.ssl.arn

  timeouts {
    create = "30m"
  }
}

locals {
  frontend_domain = "rewind.taque.fr"
}
