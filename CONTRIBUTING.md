# Contributing

Source-available under [PolyForm Noncommercial 1.0.0](LICENSE). Other licenses can be negotiated with the copyright holder.

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

## Pull requests

- Keep changes small.
- `npm test` should pass on Node 22.
- CLI name is `fregoli` in full, never `freg`.
- Do not wrap DeepSeek Harness. Do not call the xAI HTTP API as the agent (use Grok CLI / ACP).
- Do not add WASM inner plugins or an in-process scanner.
