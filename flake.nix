{
  description = "Rewind - offshore sail race simulation";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      rust-overlay,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs {
          inherit system overlays;
        };
        rustToolchain = pkgs.rust-bin.stable.latest.default.override {
          extensions = [
            "rust-src"
            "rust-analyzer"
            "clippy"
          ];
        };
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            flyctl

            litecli
            watch

            # Rust
            rustToolchain
            cargo-watch

            # Node.js
            nodejs_22
          ];

          shellHook = ''
            echo "Rewind development environment"
            echo ""
            echo "Commands:"
            echo "  ./server/bin/container up  - Start minio"
            echo "  cd server && ./bin/dev-server - Start server with auto-reload"
            echo "  cd client && ./bin/dev-server - Start client"
          '';
        };
      }
    );
}
