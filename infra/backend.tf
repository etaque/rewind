data "aws_ami" "ubuntu" {
  most_recent = true

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  owners = ["099720109477"] # Canonical
}

resource "aws_instance" "backend" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = "t3.micro"

  tags = {
    Name      = "rewind-backend"
    ManagedBy = "terraform"
  }
}

resource "aws_route53_record" "backend" {
  zone_id = data.aws_route53_zone.zone.zone_id
  name    = local.backend_domain
  type    = "A"
  ttl     = 300
  records = [aws_instance.backend.public_ip]
}
