# -*- mode: ruby -*-
# vi: set ft=ruby :

Vagrant.configure("2") do |config|
  config.vm.box = "ubuntu/focal64"

  config.vm.network "forwarded_port", guest: 80, host: 8081, host_ip: "127.0.0.1"

  config.vm.synced_folder "target/universal", "/home/vagrant/packages", create: true

  config.vm.define "local"

  config.vm.provision "ansible", run: "always" do |ansible|
    ansible.playbook = "ops/deploy-local.yml"
    ansible.inventory_path = "ops/hosts.yml"
    ansible.extra_vars = YAML.load_file("ops/secrets/local.yml")
  end
end
