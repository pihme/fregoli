# Usage

CLI is `fregoli` in full, never `freg`. From this tree:

```bash
npm ci
npx tsx src/cli.ts --version
npx tsx src/cli.ts              # http://127.0.0.1:8080/
npx tsx src/cli.ts --assistant  # force the stock assistant UI
```

Needs Node 22+. Grok CLI on `PATH` is required for a real agent; without it, chat is an in-process stub.

`--version` is `dev` on a dirty/untagged tree, or the `fregoli/vX.Y.Z` tag (set `FREGOLI_VERSION` to override; `make build` only prints the version derived from `git describe`).

## What you get

| Piece | Role |
| --- | --- |
| Web plugin | HTTP on **8080**, canvas (welcome canvas from `plugins/shipped/welcome.ts` at boot), page bridge |
| Agent plugin | Spawns `grok agent --always-approve stdio` (ACP). Stub if `grok` is missing. |
| Assistant plugin | Lower-right chat. Replaceable and removable. |
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

## HTTP

Base: `http://127.0.0.1:8080`

| Path | Method | What |
| --- | --- | --- |
| `/` | GET | Canvas + assistant slot |
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
docker build -t fregoli:local .
docker run --rm -p 8080:8080 fregoli:local
```

Note: the server currently listens on `127.0.0.1` inside the container, so the published port is likely unreachable from the host ([#1](https://github.com/pihme/fregoli/issues/1)).

[Hermetarium](https://github.com/pihme/hermetarium) is a recommended habitat (image listens on 8080). It is not required.
