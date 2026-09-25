# Implementation plan

Interruptible. **Local commits only** until someone asks to push. After every completed step: run the step’s tests, `git commit` in this repo, tick the step below, set **Status**, update agent memory (`topics/fregoli-implementation.md`).

## How to resume after interruption

1. Read `SPEC.md` and this file.
2. **Status** (below) is the source of truth for what is done.
3. Implement **only the next unchecked step**. Do not start the one after it in the same turn if context is getting tight.
4. Do not `git push`. Do not reopen product questions in `SPEC.md` unless the user asks.
5. Cordis package: npm `cordis` (https://github.com/cordiverse/cordis), ESM, Node 22+. Do not wrap DeepSeek Harness. Do not use `@deepseek-ai/cordis` unless `cordis` on npm is unusable — if you must switch, note it in Status.
6. CLI name `fregoli`, never `freg`.

## Status

- **Last completed step:** 10
- **Next step:** none in this plan. Follow-ups: wire ACP prompt (chat still stub); expose observe/load as MCP for Grok instead of only HTTP.
- **Branch:** `main`
- **Last local commit:** `42e1829` Add Hermetarium inhabitant image
- **Loader config filename:** `fregoli.json`
- **Do not push** to GitHub until asked. Remote may not exist yet.

## Layout (create as you go)

```
fregoli/
  SPEC.md
  IMPLEMENTATION.md   ← this file
  LICENSE
  README.md
  package.json
  tsconfig.json
  src/
    cli.ts            # parse argv, cwd = app root
    kernel.ts         # new Context, mount from config
    plugins/
      web/
      agent/
      assistant/
  tests/
```

App root = process cwd. Loader config filename: pick in step 0 (`fregoli.yml` unless Cordis defaults force otherwise). Record the choice in Status.

## Steps

### 0. Scaffold

- `package.json` (`type: module`, `"bin": { "fregoli": ... }`), `tsconfig.json`, test runner (`node:test` or `vitest`).
- `src/cli.ts` starts a Cordis `Context` and exits 0.
- Test: CLI `--help` or version; kernel constructs.
- Commit: `Scaffold Fregoli Node + Cordis CLI`

### 1. Web plugin: HTTP 8080 + blank canvas

- Plugin `provide`s HTTP and a `ui` host (empty canvas, slot for assistant).
- `GET /` is HTML: full-viewport empty canvas, no demo widgets.
- `ctx.effect` for `listen`; unload closes the port.
- Test: start kernel, `GET http://127.0.0.1:8080/` 200, body has canvas, no assistant yet.
- Commit: `Add web plugin with blank canvas on 8080`

### 2. Assistant plugin: lower-right control

- Own plugin; `provide`s `assistantUi`. Injects web `ui`.
- Default UI: control lower right; opens a chat panel (send + transcript area). Chat backend can be a no-op.
- Test: `GET /` includes the assistant control.
- Commit: `Add replaceable assistant plugin`

### 3. Agent stub (no Grok yet)

- Agent plugin `provide`s chat. If `grok` is **not** on `PATH`, in-process stub that echoes or returns a fixed line. Do **not** call the xAI HTTP API.
- Assistant injects chat; sending a message returns a stub reply.
- Test: POST (or WS) chat round-trip against stub.
- Commit: `Add agent stub when grok is missing`

### 4. Loader: mount UI plugin; reject broken plugin

This is the spec §12 hello-world bar (items 4–5).

- Loader mounts plugins from app-root config. Expose load/unload on `ctx` for tests (Grok tools come in step 6).
- Test A: mount a tiny plugin that draws on the canvas; `GET /` shows it **without** restarting the process.
- Test B: mount a file that throws in `apply`; fiber is not `ACTIVE`; canvas from A still there.
- Commit: `Load UI plugins; failed apply does not go ACTIVE`

### 5. `--assistant` and saved loader config

- Persist extra plugin list under app root (filename from step 0).
- Normal start: omit assistant if saved config says so.
- `fregoli --assistant`: stock plugin is the `assistantUi` provider for that start; ignore a saved replacement for that key.
- Test both starts.
- Commit: `Honor saved loader config and --assistant`

### 6. Grok CLI over ACP

- If `grok` is on `PATH`, spawn `grok agent --always-approve stdio` (cwd = app root) via `ctx.effect`; unload kills it. ACP in the agent plugin; assistant uses that session.
- System/rules text from SPEC §8b (Cordis graph, boot plugins, write plugins not half-written modules, habitat is extra context).
- If `grok` missing: keep stub (step 3). Never use another vendor CLI.
- Test: stub path in CI; ACP path skipped or marked when `grok` absent.
- Commit: `Spawn Grok CLI over ACP when grok is on PATH`

### 7. Loader tools for Grok

- Page-bridge MCP is later. Here: tools Grok can call to load/unload Cordis plugins (MCP server **hosted** in the Fregoli process, Grok is client; or ACP tools). `ctx.effect` owns that server.
- Test: stub or fake ACP client calls load; canvas updates.
- Commit: `Expose Cordis load/unload to Grok`

### 8. Page bridge: observe DOM

- Browser WebSocket (or equivalent) to web plugin. Snapshot: serialized DOM of this origin + URL, viewport, focused element.
- No tab connected → observe **errors**. Several tabs → **most recently focused**.
- Agent plugin hosts MCP for `observe`; Grok is client only.
- Test: fake browser connection; observe returns DOM; disconnect → error.
- Commit: `Page bridge observe (serialized DOM)`

### 9. Page bridge: user click / highlight

- Tools to highlight a selector and wait for a user click/type. Result is a tool result to Grok. No silent pointer drive.
- Test: simulate user click after highlight.
- Commit: `Page bridge user click tools`

### 10. Hermetarium inhabitant (later)

- Dockerfile, listen 8080, `CMD` fregoli. Not part of the local hello-world bar. Skip until the user asks or steps 0–7 are green.
- Commit when done: `Add Hermetarium inhabitant image`

## Out of scope until asked

- `git push` / creating `pihme/fregoli` on GitHub
- WASM, in-process scanner, wrapping `dsh`, Grok marketplace plugins
- Screenshots / accessibility tree as the required snapshot
- Silent pointer automation
