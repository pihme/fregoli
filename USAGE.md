# Usage

CLI is `fregoli` in full, never `freg`. From this tree:

```bash
npm ci
npx tsx src/cli.ts --help
npx tsx src/cli.ts --version
npx tsx src/cli.ts              # http://127.0.0.1:8080/
npx tsx src/cli.ts --assistant  # force the stock assistant UI
npx tsx src/cli.ts --host 0.0.0.0
npm link                        # `fregoli` on PATH, using this checkout's tsx
```

Needs Node 22+. Grok CLI on `PATH` is required for a real agent; without it, chat is an in-process stub.

`--host` sets the listen address. `FREGOLI_HOST` does the same when the flag is omitted. The default is `127.0.0.1`. The page-bridge MCP server always calls `127.0.0.1` on that port.

`--version` prints `FREGOLI_VERSION` if it is set. Otherwise it prints `git describe --tags --match 'fregoli/v*' --dirty` when this checkout has a `fregoli` tag (with a `-dirty` suffix if the working tree has uncommitted changes), and `dev` when it does not. `make build` prints that same string. A release tarball carries the tag in `src/RELEASE_VERSION`, and a Docker image carries `FREGOLI_VERSION`, so neither needs git at runtime.

## What you get

| Piece | Role |
| --- | --- |
| Web plugin | HTTP on **8080**, canvas (welcome canvas from `plugins/shipped/welcome.ts` at boot), page bridge |
| Agent plugin | Spawns `grok agent --always-approve stdio` (ACP). Stub if `grok` is missing. |
| Assistant plugin | Lower-right chat. The stock control is a Helferlein figure (v1.0.0): it opens the panel, floats above it while the panel is open, and rolls a new look when a plugin load, unload, or reload lands. The look is kept in `localStorage` under `fregoli-helferlein`. Replaceable and removable. |
| Loader | `POST /load` mounts a Cordis plugin file |
| MCP | `src/mcp.ts` for Grok: `list_plugins`, `load_plugin`, `unload_plugin`, `observe_page`, `highlight`, `wait_click`, `reload_page` |
| Skill | `.grok/skills/fregoli-app/SKILL.md` — how to change the running app |

Canvas plugins:

| Directory | Who writes it | Git |
| --- | --- | --- |
| `src/plugins/` | This repo (web, agent, assistant) | Tracked |
| `plugins/shipped/` | This repo; every `*.ts` mounts at boot | Tracked |
| `plugins/runtime/` | The agent at runtime | Gitignored |

Saved config is `fregoli.json` in the process cwd (app root):

```json
{ "assistant": true, "plugins": [] }
```

`plugins` is extra files to mount (typically under `plugins/runtime/`).

`assistant: false` omits the stock chat UI on the next start. Starting with `--assistant` puts it back for that process only.

`POST /load` adds the plugin file to `plugins` (a path under `plugins/shipped/` is not added; those files mount on every start). `POST /unload` removes it. Unloading the assistant sets `assistant` to false. The next start reads that file.

## HTTP

Base: `http://127.0.0.1:8080`

| Path | Method | What |
| --- | --- | --- |
| `/` | GET | Canvas + assistant slot |
| `/helferlein.min.js` | GET | Pinned Helferlein build used by the stock assistant |
| `/chat` | POST | `{ "text": "..." }` → `{ "text": "..." }` (ACP or stub) |
| `/plugins` | GET | Mounted fibers |
| `/load` | POST | `{ "file": "/abs/path/to/plugin.ts" }` |
| `/unload` | POST | `{ "name": "draw" }` |
| `/observe` | GET | Serialized DOM of the most recently focused connected tab |
| `/bridge` | POST | Browser snapshot (`tabId`, `html`, `url`, `viewport`, `focused`) |
| `/bridge/commands` | GET | `{ "highlight": "#sel" \| null }` |
| `/bridge/highlight` | POST | `{ "selector": "#sel" }` |
| `/bridge/action` | POST | `{ "type": "click"\|"type", "selector": "...", "value": "..." }` |
| `/bridge/reload` | POST | Ask the tab to reload; assistant chat is restored open |
| `/bridge/wait` | GET | `?timeout=15000` — wait for a user action |

The page injects a small script that POSTs snapshots and reports clicks.

## Grok

When `grok` is on `PATH`, Fregoli speaks ACP and starts Grok with an MCP server (`src/mcp.ts`) whose `FREGOLI_URL` is this process. Auth is Grok CLI login or `XAI_API_KEY`, not a host-side habitat ACL unless you deploy that way.

## Docker / Hermetarium

```bash
docker build -t fregoli:local --build-arg FREGOLI_VERSION="$(git describe --tags --match 'fregoli/v*' 2>/dev/null || echo dev)" .
docker run --rm -p 8080:8080 fregoli:local
```

The image sets `FREGOLI_HOST=0.0.0.0`, so the published port reaches the server. It copies `plugins/shipped/`, `fregoli.json`, and `.grok/skills/fregoli-app/`, creates `plugins/runtime/`, and installs `iproute2` and `iptables` so a Hermetarium wall can set the default route. Omit the build arg and `--version` inside the image is `dev`.

[Hermetarium](https://github.com/pihme/hermetarium) is a recommended habitat (image listens on 8080). It is not required.
