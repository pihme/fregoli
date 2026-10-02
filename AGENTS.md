# AGENTS.md

This file is for the coding agent working in this repo. Read it at the start of a session.

## What this repo is

**Fregoli** is a self-evolving web application on a Cordis kernel. Spec: `SPEC.md`. Named for Leopoldo Fregoli, the quick-change artist.

CLI `fregoli`, never `freg`. License: **PolyForm Noncommercial 1.0.0** (`LICENSE`). Do not relicense to Apache/MIT/GPL.

## How to work here

- TypeScript on Node 22+, ESM, npm `cordis` (cordiverse). Do not wrap `dsh`. Do not use `@deepseek-ai/cordis` unless `cordis` on npm is unusable.
- Layout: `src/cli.ts`, `src/boot.ts`, `src/kernel.ts`, `src/plugins/{web,agent,assistant}/` (kernel), `plugins/shipped/` (repo canvas plugins), `plugins/runtime/` (agent-written, gitignored), `src/mcp.ts`, `tests/`.
- Boot plugins: **web** (8080, canvas, page bridge), **agent** (Grok CLI over ACP; stub if `grok` is missing), **assistant** (replaceable; `fregoli --assistant` remounts stock).
- App root is process cwd. Config: `fregoli.json`.
- HTTP handlers must use `ctx.get(name, true)` for services; `ctx.ui` off-fiber throws without inject.
- Grok is the agent: `grok agent --always-approve stdio`. MCP tools in `src/mcp.ts` (`list_plugins`, `load_plugin`, `unload_plugin`, `observe_page`, `highlight`, `wait_click`, `reload_page`). After `load_plugin`, Grok should `reload_page`; the assistant panel and chat history persist in sessionStorage. Skill: `.grok/skills/fregoli-app`.
- Page snapshot is the serialized DOM of this origin. No WASM. Scanner is outside this process.
- **Versions:** one artifact, tag `fregoli/vX.Y.Z`. [Conventional Commits](https://www.conventionalcommits.org/): `feat:` minor, `fix:`/`perf:` patch, `feat!:`/`fix!:` or a `BREAKING CHANGE:` footer major (minor while the version is 0.x); `docs:`, `test:`, `chore:`, `ci:` do not bump. A commit only bumps when it touches `src/`, `package.json`, `package-lock.json`, `tsconfig.json`, `Dockerfile`, or `Makefile`. After CI on a push to `main`, `.github/scripts/release.py` creates the GitHub Release and attaches `fregoli-src.tar.gz`.
- **Release 1.0** (or any chosen version): an empty commit with the footer `Release-As: 1.0.0` (or `Release-As: fregoli@1.0.0`), e.g. `git commit --allow-empty -m "chore: release 1.0" -m "Release-As: 1.0.0"`. It releases by itself, regardless of type or paths; upwards only (a version at or below the current one is ignored with a warning). Only use it when the maintainer decided the version.
- **Dependabot** (`.github/dependabot.yml`): runtime deps and the Docker base image `fix(deps):` (patch release), dev deps `chore(deps-dev):`, GitHub Actions `ci(deps):`. Merge its PRs only with green CI.
- **Changes on main:** keep them small; `npm test` should pass on Node 22. Do not call the xAI HTTP API as the agent (use Grok CLI / ACP). Do not add WASM inner plugins or an in-process scanner.
- Outside pull requests are not accepted (see `CONTRIBUTING.md`); issues are.
- [Hermetarium](https://github.com/pihme/hermetarium) is a recommended deployment, not required. Image listens on 8080.
- Prefer small, reversible files. `npm test` is the merge gate.

## Do not invent

- Grok marketplace plugins
- Silent pointer automation
- Accessibility tree or screenshots as the required page snapshot
- In-process tool sandbox (the habitat wall is the box when deployed)

Decided in SPEC.md (do not reopen): Cordis kernel, Grok CLI as agent, assistant replaceable/removable, DOM page bridge, no WASM.
