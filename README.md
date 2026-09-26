# Fregoli

[![CI](https://github.com/pihme/fregoli/actions/workflows/ci.yml/badge.svg)](https://github.com/pihme/fregoli/actions/workflows/ci.yml)

Self-evolving web application on a Cordis kernel, named for Leopoldo Fregoli, the quick-change artist. One process, many appearances: plugins load and unload without restarting Node.

The CLI name is `fregoli` in full; do not shorten to `freg`.

- [SPEC.md](SPEC.md) — product spec
- [USAGE.md](USAGE.md) — CLI, HTTP, Grok, Docker
- [CONTRIBUTING.md](CONTRIBUTING.md) — tests, commits, versions

## Run

Needs Node 22+. For a real agent, Grok CLI on `PATH`.

```bash
npm ci
npx tsx src/cli.ts
# http://127.0.0.1:8080/
```

A welcome canvas (`plugins/shipped/welcome.ts`) is shown at boot, assistant in the lower right. Chat goes to Grok over ACP when `grok` is available, otherwise an in-process stub. `fregoli --assistant` forces the stock assistant UI.

`fregoli/vX.Y.Z` GitHub Releases attach a source tarball. Local `--version` is `dev` unless `FREGOLI_VERSION` is set.

## Pieces

The **kernel** is Cordis. Capabilities are plugins.

**Web** serves HTTP on 8080, the canvas, and the page bridge (DOM snapshot, highlight, user click).

**Agent** spawns `grok agent --always-approve stdio` and speaks ACP. It hands Grok an MCP server: `list_plugins` (mounted Cordis fibers), `load_plugin` (mount a plugin file), `unload_plugin` (dispose a fiber by name), `observe_page` (serialized DOM of the current tab), `highlight` (highlight a CSS selector), `wait_click` (highlight a selector and wait for the user to click or type), `reload_page` (reload the browser tab; assistant chat stays open). Unload kills that child.

**Assistant** is its own plugin: lower-right chat, replaceable and removable.

**Loader** mounts extra Cordis plugins from `fregoli.json` or `POST /load`. A failed `apply` does not become `ACTIVE` and does not replace the canvas.

Running inside [Hermetarium](https://github.com/pihme/hermetarium) is a recommended deployment (listen on 8080), not a requirement.

```bash
docker build -t fregoli:local .
```

License: [PolyForm Noncommercial 1.0.0](LICENSE). Source-available, not OSI Open Source.
