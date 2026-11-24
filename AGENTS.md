# AGENTS.md

This file is for the coding agent working in this repo. Read it at the start of a session.

## What this repo is

**Fregoli** is a self-evolving web application on a Cordis kernel. Spec: `SPEC.md`. Named for Leopoldo Fregoli, the quick-change artist.

CLI `fregoli`, never `freg`. License: **PolyForm Noncommercial 1.0.0** (`LICENSE`). Do not relicense to Apache/MIT/GPL.

## How to work here

- Reference environment: `nix/reference-env` (Node.js 22) is binding for build and test. Run `nix develop ./nix/reference-env -c npm ci` and then `nix develop ./nix/reference-env -c npm test`, locally and in CI. Add language tools there. `flake.lock` is committed; Dependabot updates it.
- TypeScript on Node 22+, ESM, npm `cordis` (cordiverse). Do not wrap `dsh`. Do not use `@deepseek-ai/cordis` unless `cordis` on npm is unusable.
- Layout: `src/cli.ts`, `src/boot.ts`, `src/kernel.ts`, `src/plugins/{web,agent,assistant}/` (kernel), `plugins/shipped/` (repo canvas plugins), `plugins/runtime/` (agent-written, gitignored), `src/mcp.ts`, `tests/`.
- Boot plugins: **web** (8080, canvas, page bridge), **agent** (OpenCode 2 over ACP; stub if `opencode` is missing), **assistant** (replaceable; `fregoli --assistant` remounts stock).
- App root is process cwd. Config: `fregoli.json`.
- HTTP handlers must use `ctx.get(name, true)` for services; `ctx.ui` off-fiber throws without inject.
- OpenCode 2 is the in-app agent: `opencode acp`. This replaces the earlier Grok CLI decision. The model is `FREGOLI_MODEL_BASE_URL`, `FREGOLI_MODEL`, and `FREGOLI_MODEL_API_KEY` (no vendor default; the key stays in the environment). MCP tools in `src/mcp.ts` (`list_plugins`, `load_plugin`, `unload_plugin`, `observe_page`, `highlight`, `wait_click`, `reload_page`). After `load_plugin`, the agent should `reload_page`; the assistant panel and chat history persist in sessionStorage. The in-app session does not load `.grok/skills/fregoli-app` or this file.
- Page snapshot is the serialized DOM of this origin. No WASM. Scanner is outside this process.
- **Versions:** one artifact, tag `fregoli/vX.Y.Z`. [Conventional Commits](https://www.conventionalcommits.org/): `feat:` minor, `fix:`/`perf:` patch, `feat!:`/`fix!:` or a `BREAKING CHANGE:` footer major (minor while the version is 0.x); `docs:`, `test:`, `chore:`, `ci:` do not bump. A commit only bumps when it touches `src/`, `package.json`, `package-lock.json`, `tsconfig.json`, `Dockerfile`, or `Makefile`. After CI on a push to `main`, `.github/scripts/release.py` creates the GitHub Release and attaches `fregoli-src.tar.gz`.
- **Release 1.0** (or any chosen version): an empty commit with the footer `Release-As: 1.0.0` (or `Release-As: fregoli@1.0.0`), e.g. `git commit --allow-empty -m "chore: release 1.0" -m "Release-As: 1.0.0"`. It releases by itself, regardless of type or paths; upwards only (a version at or below the current one is ignored with a warning). Only use it when the maintainer decided the version.
- **Dependabot** (`.github/dependabot.yml`): runtime deps and the Docker base image `fix(deps):` (patch release), dev deps `chore(deps-dev):`, GitHub Actions `ci(deps):`. Never merge a Dependabot PR on green CI alone. Dependabot PRs arrive with `ready-for-maintainer` (set by `.github/dependabot.yml`); Maintainer reviews the content and sets `ready-for-qa`; QA merges (squash, keep the Dependabot title). Decisions go to the owner with `ready-for-human`. No Dependabot PRs are handed on during a release. Release PRs from 1.0.0 on are merged only by the owner. Details: `docs/agents/team.md`.
- **Changes on main:** keep them small; `npm test` should pass on Node 22. Do not call the model HTTP API from this process. The in-app agent is OpenCode 2 over ACP. Do not add WASM inner plugins or an in-process scanner.
- Outside pull requests are not accepted (see `CONTRIBUTING.md`); issues are.
- [Hermetarium](https://github.com/pihme/hermetarium) is a recommended deployment, not required. Image listens on 8080.
- Prefer small, reversible files. `npm test` is the merge gate.

## Do not invent

- OpenCode or Grok marketplace plugins
- Silent pointer automation
- Accessibility tree or screenshots as the required page snapshot
- In-process tool sandbox (the habitat wall is the box when deployed)

Decided in SPEC.md (do not reopen): Cordis kernel, OpenCode 2 over ACP as the in-app agent (this replaced Grok CLI), assistant replaceable/removable, DOM page bridge, no WASM.

## Team rules

Labels: `needs-triage`, `needs-info`, `needs-input`, `ready-for-maintainer`, `ready-for-development`, `ready-for-qa`, `ready-for-human`, `wontfix`, plus `bug` / `enhancement`. `ready-for-maintainer` is for Maintainer (website, docs fixes, smaller changes), `ready-for-development` is for Developer (larger feature and code work), and `ready-for-qa` is for QA. Team roles, labels, handover, merging and release mode: `docs/agents/team.md` (same in every repo; change it in presets first). See `docs/agents/triage-labels.md`.
