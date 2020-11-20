# Rewind

## Development

Start backend with:

    sbt ~reStart


## Deployment

### Local VM

Start and provision the VM with:

    vagrant up

### Production

Provision EC2 instance with:

    cd ops
    ansible-playbook -i hosts.yml \
      --extra-vars "@secrets/shared.yml" \
      --extra-vars "@secrets/prod.yml" \
      deploy-prod.yml
