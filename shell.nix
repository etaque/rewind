with (import <nixpkgs> {});

mkShell {

  buildInputs = [
    sbt
    flyway
    ansible
    postgresql_11
  ];

}
