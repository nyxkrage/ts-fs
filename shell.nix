{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    nodejs
    nodePackages.npm
    nodePackages.nodemon
    nodePackages.typescript
    nodePackages.alive-server

    # keep this line if you use bash
    pkgs.bashInteractive
  ];
}
