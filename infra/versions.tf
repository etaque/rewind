terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    fly = {
      source  = "fly-apps/fly"
      version = "~> 0.1"
    }
  }

  backend "remote" {
    organization = "skiffr"

    workspaces {
      name = "rewind"
    }
  }
}
