# ECR Repository
resource "aws_ecr_repository" "rewind" {
  name                 = "rewind"
  image_tag_mutability = "MUTABLE"

  tags = {
    ManagedBy = "terraform"
  }
}

# ECS Cluster
resource "aws_ecs_cluster" "rewind" {
  name = "rewind"

  tags = {
    ManagedBy = "terraform"
  }
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "pull_gribs" {
  name              = "/ecs/rewind-pull-gribs"
  retention_in_days = 14

  tags = {
    ManagedBy = "terraform"
  }
}

# ECS Execution Role (pull images, write logs)
resource "aws_iam_role" "ecs_execution" {
  name = "rewind-ecs-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })

  tags = {
    ManagedBy = "terraform"
  }
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# ECS Task Role (S3 access)
resource "aws_iam_role" "ecs_task" {
  name = "rewind-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })

  tags = {
    ManagedBy = "terraform"
  }
}

resource "aws_iam_role_policy" "ecs_task_s3" {
  name = "s3-access"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["s3:GetObject", "s3:PutObject", "s3:ListBucket"]
      Resource = [
        aws_s3_bucket.gribs.arn,
        "${aws_s3_bucket.gribs.arn}/*",
        aws_s3_bucket.rasters.arn,
        "${aws_s3_bucket.rasters.arn}/*",
      ]
    }]
  })
}

# Security Group (outbound HTTPS only)
resource "aws_security_group" "ecs_task" {
  name        = "rewind-ecs-task"
  description = "Allow outbound HTTPS for NCAR and S3"
  vpc_id      = data.aws_vpc.default.id

  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    ManagedBy = "terraform"
  }
}

# Default VPC data sources
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# Task Definition
resource "aws_ecs_task_definition" "pull_gribs" {
  family                   = "rewind-pull-gribs"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "rewind"
    image     = "${aws_ecr_repository.rewind.repository_url}:latest"
    command   = ["rewind", "pull-gribs"]
    essential = true

    environment = [
      { name = "REWIND_S3_ENDPOINT", value = "https://s3.eu-west-3.amazonaws.com" },
      { name = "REWIND_S3_REGION", value = "eu-west-3" },
      { name = "REWIND_S3_GRIB_BUCKET", value = aws_s3_bucket.gribs.id },
      { name = "REWIND_S3_RASTER_BUCKET", value = aws_s3_bucket.rasters.id },
      { name = "RUST_LOG", value = "info" },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.pull_gribs.name
        "awslogs-region"        = "eu-west-3"
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])

  tags = {
    ManagedBy = "terraform"
  }
}

# Outputs
output "ecr_repository_url" {
  value = aws_ecr_repository.rewind.repository_url
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.rewind.name
}

output "pull_gribs_task_definition" {
  value = aws_ecs_task_definition.pull_gribs.family
}

output "run_task_command" {
  description = "Command to manually run the pull-gribs task"
  value       = <<-EOT
    aws ecs run-task \
      --profile rewind-terraform \
      --region eu-west-3 \
      --cluster ${aws_ecs_cluster.rewind.name} \
      --task-definition ${aws_ecs_task_definition.pull_gribs.family} \
      --launch-type FARGATE \
      --network-configuration 'awsvpcConfiguration={subnets=[${join(",", data.aws_subnets.default.ids)}],securityGroups=[${aws_security_group.ecs_task.id}],assignPublicIp=ENABLED}'
  EOT
}
