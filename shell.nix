with import (builtins.fetchGit {
  name = "nixpkgs-20.09";
  url = "git@github.com:nixos/nixpkgs.git";
  rev = "cd63096d6d887d689543a0b97743d28995bc9bc3";
  ref = "refs/tags/20.09";
}) {};

mkShell {

  buildInputs = [
    # backend
    sbt
    flyway
    ansible
    postgresql_11
    postgis

    # frontend
    nodejs
    elmPackages.elm
    elmPackages.elm-format
    elmPackages.elm-test
    inotify-tools
  ];

}

