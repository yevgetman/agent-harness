# Legibility Notes

- This repo's primary application surface is the `harness` CLI.
- The module and profile registries are the main source maps for installed
  target behavior.
- Distribution smoke should use disposable copied targets, not a source-owned
  registry of installed repos.
