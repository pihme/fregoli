# AGENTS.md

This file is for the coding agent working in this repo. Read it at the start of a session.

## What this repo is

**Fregoli** is a self-evolving web application on a Cordis kernel. Spec: `SPEC.md`. Named for Leopoldo Fregoli, the quick-change artist.

CLI `fregoli`, never `freg`. License: **PolyForm Noncommercial 1.0.0** (`LICENSE`). Do not relicense to Apache/MIT/GPL.

## How to work here

- TypeScript on Node 22+, ESM, npm `cordis` (cordiverse). Do not wrap `dsh`. Do not use `@deepseek-ai/cordis` unless `cordis` on npm is unusable.
- Layout: `src/cli.ts`, `src/boot.ts`, `src/kernel.ts`, `src/plugins/{web,agent,assistant}/`, `src/mcp.ts`, `tests/`.
- Boot plugins: **web** (8080, canvas, page bridge), **agent** (Grok CLI over ACP; stub if `grok` is missing), **assistant** (replaceable; `fregoli --assistant` remounts stock).
- App root is process cwd. Config: `fregoli.json`.
- HTTP handlers must use `ctx.get(name, true)` for services; `ctx.ui` off-fiber throws without inject.
- Grok is the agent: `grok agent --always-approve stdio`. MCP tools in `src/mcp.ts` (`observe_page`, `load_plugin`, `highlight`, `wait_click`). Fregoli hosts MCP; Grok is the client. Do not add a second MCP client.
- Page snapshot is the serialized DOM of this origin. No WASM. Scanner is outside this process.
- **Versions:** tag `fregoli/vX.Y.Z`. Conventional commits (`feat:` minor, `fix:`/`perf:` patch, `feat!:` or `BREAKING CHANGE:` major). Bump only when the commit touches `src/`, `package.json`, `package-lock.json`, `tsconfig.json`, `Dockerfile`, or `Makefile`. `.github/scripts/release.py` on push to `main` after CI.
- Hermetarium is a recommended deployment, not required. Image listens on 8080.
- Prefer small, reversible files. `npm test` is the merge gate.

## Do not invent

- Grok marketplace plugins
- Silent pointer automation
- Accessibility tree or screenshots as the required page snapshot
- In-process tool sandbox (the habitat wall is the box when deployed)

Decided in SPEC.md (do not reopen): Cordis kernel, Grok CLI as agent, assistant replaceable/removable, DOM page bridge, no WASM.
