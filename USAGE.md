# Usage

CLI is `fregoli` in full, never `freg`. From this tree:

```bash
npm ci
npx tsx src/cli.ts --version
npx tsx src/cli.ts              # http://127.0.0.1:8080/
npx tsx src/cli.ts --assistant  # force the stock assistant UI
```

Needs Node 22+. Grok CLI on `PATH` is required for a real agent; without it, chat is an in-process stub.

`--version` is `dev` on a dirty/untagged tree, or the `fregoli/vX.Y.Z` tag (see `FREGOLI_VERSION` / `make build`).

## What you get

| Piece | Role |
| --- | --- |
| Web plugin | HTTP on **8080**, blank canvas, page bridge |
| Agent plugin | Spawns `grok agent --always-approve stdio` (ACP). Stub if `grok` is missing. |
| Assistant plugin | Lower-right chat. Replaceable and removable. |
| Loader | `POST /load` mounts a Cordis plugin file |
| MCP | `src/mcp.ts` stdio tools for Grok: `observe_page`, `load_plugin`, `highlight`, `wait_click` |

Saved config is `fregoli.json` in the process cwd (app root):

```json
{ "assistant": true, "plugins": [] }
```

`assistant: false` omits the stock chat UI on the next start. `fregoli --assistant` puts it back for that process only.

## HTTP

Base: `http://127.0.0.1:8080`

| Path | Method | What |
| --- | --- | --- |
| `/` | GET | Canvas + assistant slot |
| `/chat` | POST | `{ "text": "..." }` → `{ "text": "..." }` (ACP or stub) |
| `/load` | POST | `{ "file": "/abs/path/to/plugin.ts" }` |
| `/observe` | GET | Serialized DOM of the most recently focused connected tab |
| `/bridge` | POST | Browser snapshot (`tabId`, `html`, `url`, `viewport`, `focused`) |
| `/bridge/commands` | GET | `{ "highlight": "#sel" \| null }` |
| `/bridge/highlight` | POST | `{ "selector": "#sel" }` |
| `/bridge/action` | POST | `{ "type": "click"\|"type", "selector": "...", "value": "..." }` |
| `/bridge/wait` | GET | `?timeout=15000` — wait for a user action |

The page injects a small script that POSTs snapshots and reports clicks.

## Grok

When `grok` is on `PATH`, Fregoli speaks ACP and starts Grok with an MCP server (`src/mcp.ts`) whose `FREGOLI_URL` is this process. Auth is Grok CLI login or `XAI_API_KEY`, not a host-side habitat ACL unless you deploy that way.

## Docker / Hermetarium

```bash
docker build -t fregoli:local .
docker run --rm -p 8080:8080 fregoli:local
```

[Hermetarium](https://github.com/pihme/hermetarium) is a recommended habitat (image listens on 8080). It is not required.
