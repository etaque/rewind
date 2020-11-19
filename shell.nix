with (import <nixpkgs> {});

mkShell {

  buildInputs = [
    sbt
    postgresql_11
    flyway
    ansible
  ];

}
