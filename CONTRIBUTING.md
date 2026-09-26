# Contributing

Source-available under [PolyForm Noncommercial 1.0.0](LICENSE). Other licenses can be negotiated with the copyright holder.

## Contributions

This project does not accept outside code contributions at the moment, so that its licensing stays in one hand. Issues, bug reports and ideas are very welcome: please [open an issue](https://github.com/pihme/fregoli/issues/new/choose). Pull requests from outside contributors will be closed without merging.

The sections below describe how the maintainer works on the code.

## Run tests

Needs Node 22+. Docker is optional ([inhabitant image](https://github.com/pihme/hermetarium) test is skipped without it).

```bash
npm ci
npm test
```

A live Grok turn needs the Grok CLI authenticated (`grok` on `PATH`). That is not the merge gate.

## Commits and versions

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` minor
- `fix:` or `perf:` patch
- `feat!:` / `fix!:` or a `BREAKING CHANGE:` footer: major
- `docs:`, `test:`, `chore:`, `ci:` do not bump a release

One artifact, tag `fregoli/vX.Y.Z`. A commit only bumps when it touches `src/`, `package.json`, `package-lock.json`, `tsconfig.json`, `Dockerfile`, or `Makefile`. Docs and tests alone do not cut a release. After CI on `main`, `.github/scripts/release.py` creates the GitHub Release and attaches `fregoli-src.tar.gz`.

## Changes on main

For the maintainer's own changes and Dependabot pull requests:

- Keep changes small.
- `npm test` should pass on Node 22.
- CLI name is `fregoli` in full, never `freg`.
- Do not wrap DeepSeek Harness. Do not call the xAI HTTP API as the agent (use Grok CLI / ACP).
- Do not add WASM inner plugins or an in-process scanner.
