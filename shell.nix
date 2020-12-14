let
  mozOverlay = import (builtins.fetchTarball https://github.com/mozilla/nixpkgs-mozilla/archive/master.tar.gz);
  nixpkgs = import <nixpkgs> {
    overlays = [ mozOverlay ];
  };
  rustStable = (nixpkgs.latest.rustChannels.stable.rust.override {
    extensions = [ 
      "rust-src"
      "rls-preview"
      "clippy-preview"
      "rustfmt-preview"
      "rust-analysis"
    ];
  });
in
with nixpkgs;

mkShell {

  buildInputs = [
    # infra
    terraform

    # base
    rustStable
    cargo
    cargo-watch

    # server
    ansible_2_9
    postgresql_11
    postgis
    osm2pgsql
    eccodes

    # client
    nodePackages.webpack-cli
    elmPackages.elm
    elmPackages.elm-format
    elmPackages.elm-analyse
    elmPackages.elm-test
  ];

}

