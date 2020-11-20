with (import <nixpkgs> {});

mkShell {

  buildInputs = [
    sbt
    (postgresql_11.overrideAttrs (attrs:
      { patches =
          builtins.filter
            (p: !lib.strings.hasSuffix "patches/socketdir-in-run.patch" (builtins.toString p))
            attrs.patches;}))
    flyway
    ansible
  ];

}
