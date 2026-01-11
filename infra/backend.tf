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
  instance_type = "t3.nano"

  tags = {
    Name      = "rewind-backend"
    ManagedBy = "terraform"
  }
}

# Output backend IP for Gandi DNS configuration
output "backend_ip" {
  description = "Backend server IP to use as A record in Gandi for rewind-api.taque.fr"
  value       = aws_instance.backend.public_ip
}
