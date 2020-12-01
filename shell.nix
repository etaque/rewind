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

    # backend
    sbt
    flyway
    ansible_2_9
    postgresql_11
    postgis

    # gis
    rustStable
    cargo
    cargo-watch
    osm2pgsql
    eccodes

    # frontend
    nodejs
    nodePackages.rollup
    elmPackages.elm
    elmPackages.elm-format
    elmPackages.elm-test
    awscli
  ];

}

