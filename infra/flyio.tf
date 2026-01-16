# Fly.io provider configuration
# Set FLY_API_TOKEN environment variable or use fly auth token
provider "fly" {
  # API token from environment: FLY_API_TOKEN
}

# Persistent volume for SQLite database
resource "fly_volume" "sqlite_data" {
  name   = "sqlite_data"
  app    = "rewind-api"
  region = "cdg"
  size   = 1 # Size in GB
}

# Fly.io app configuration
resource "fly_app" "rewind_api" {
  name = "rewind-api"
  org  = "personal" # Update with your Fly.io organization
}

# Optional: Fly.io machine configuration
# This shows how to reference the volume in a machine
resource "fly_machine" "rewind_api" {
  app    = fly_app.rewind_api.name
  region = "cdg"
  name   = "rewind-api-machine"

  image = "registry.fly.io/rewind-api:latest" # Update with your image

  services = [
    {
      ports = [
        {
          port     = 443
          handlers = ["tls", "http"]
        },
        {
          port     = 80
          handlers = ["http"]
        }
      ]
      protocol      = "tcp"
      internal_port = 8080
    }
  ]

  mounts = [
    {
      volume = fly_volume.sqlite_data.id
      path   = "/data"
    }
  ]

  env = {
    DATABASE_URL = "sqlite:///data/rewind.db"
  }
}

output "volume_id" {
  description = "ID of the SQLite data volume"
  value       = fly_volume.sqlite_data.id
}
