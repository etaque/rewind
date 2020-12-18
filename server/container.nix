{ pkgs, ... }:

{
  system.stateVersion = "20.09";

  networking.firewall.allowedTCPPorts = [ 5432 ];

  services.postgresql = {
    enable = true;
    package = pkgs.postgresql_13;
    enableTCPIP = true;
    extraPlugins = with pkgs.postgresql.pkgs; [ postgis ];
    authentication = "host all all 10.233.0.0/16 trust";

    ensureDatabases = [ "rewind" ];
    ensureUsers = [{
      name = "rewind";
      ensurePermissions = {
        "DATABASE rewind" = "ALL PRIVILEGES";
      };
    }];
  };
}
