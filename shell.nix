let
  mozOverlay = import (builtins.fetchTarball https://github.com/mozilla/nixpkgs-mozilla/archive/master.tar.gz);
  nixpkgs = import <nixpkgs> {
    overlays = [ mozOverlay ];
  };
  rustStable = (nixpkgs.latest.rustChannels.stable.rust.override {
    targets = [ "wasm32-unknown-unknown" "x86_64-unknown-linux-gnu" ];
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
    cargo-make
    cargo-watch

    # server
    ansible_2_9
    postgresql_11
    postgis
    osm2pgsql
    eccodes

    # client
    wasm-pack
    nodePackages.webpack-cli
  ];

}

