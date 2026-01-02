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
            # Rust
            rustToolchain
            cargo-watch

            # Node.js
            nodejs_22

            # Database tools
            postgresql_16
            postgresql16Packages.postgis
            osm2pgsql
            pgcli
          ];
          # ++ lib.optionals stdenv.isDarwin [
          #   darwin.apple_sdk.frameworks.Security
          #   darwin.apple_sdk.frameworks.SystemConfiguration
          # ];

          shellHook = ''
            echo "Rewind development environment"
            echo ""
            echo "Commands:"
            echo "  ./server/bin/container up  - Start database and martin"
            echo "  cd server && ./bin/dev-server - Start server with auto-reload"
            echo "  cd client && npm run dev   - Start client"
          '';
        };
      }
    );
}
