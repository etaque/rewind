resource "aws_instance" "backend" {
  ami           = "ami-0d3f551818b21ed81"
  instance_type = "t2.micro"
}

resource "aws_route53_record" "backend" {
  zone_id = data.aws_route53_zone.zone.zone_id
  name    = local.backend_domain
  type    = "A"
  ttl     = 300
  records = [aws_instance.backend.public_ip]

  # alias {
  #   name                   = aws_lb.backend.dns_name
  #   zone_id                = aws_lb.backend.zone_id
  #   evaluate_target_health = false
  # }
}

# resource "aws_lb" "backend" {
#   name               = "rewind-backend-lb"
#   internal           = false
#   load_balancer_type = "application"
#   # security_groups    = [aws_security_group.lb_sg.id]
#   subnets = aws_subnet.public.*.id

#   # enable_deletion_protection = true
# }

# resource "aws_lb_target_group" "backend" {
#   port     = 443
#   protocol = "HTTPS"
# }

# resource "aws_lb_target_group_attachment" "backend" {
#   target_group_arn = aws_lb_target_group.backend.arn
#   target_id        = aws_instance.backend.id
#   port             = 443
# }

# resource "aws_lb_listener" "backend" {
#   load_balancer_arn = aws_lb.backend.arn
#   port              = 443
#   protocol          = "HTTPS"
#   ssl_policy        = "ELBSecurityPolicy-2016-08"
#   certificate_arn   = data.aws_acm_certificate.ssl.arn

#   default_action {
#     type             = "forward"
#     target_group_arn = aws_lb_target_group.backend.arn
#   }
# }
