# Fregoli

A self-evolving web application on a Cordis kernel. Status: first slice implemented (web, assistant, Grok ACP, loader gate, page bridge, MCP tools).

## 1. Name

**Fregoli** is named for [Leopoldo Fregoli](https://en.wikipedia.org/wiki/Leopoldo_Fregoli) (1867–1936), the Italian quick-change artist: one performer, many appearances, no restart of the show. The process stays up while plugins change.

- Binary and CLI: `fregoli` in full. Do not shorten to `freg`.
- Nearby term we are not: **Fregoli delusion** (a psychiatric syndrome, 1927, also named after the actor). Not a shipping CLI.
- Nearby systems we are not: DeepSeek Harness (`dsh`), Koishi, the Grok TUI.
- License: **PolyForm Noncommercial 1.0.0**. Source-available, not OSI Open Source. See [LICENSE](LICENSE).

## 2. Problem

An agent that can rewrite a running application usually does it by editing files and restarting the process. Restarts drop in-flight work. A raw JS file watcher serves half-written modules. Wrapping every tool in a host-side sandbox is the wrong shape for this product: the agent is meant to install and run tools in the same world the app runs in.

The paper name for the product shape is a **self-evolving agent harness**: the agent generates and replaces its own components while the process keeps running.

## 3. What it is

A **Cordis kernel** (the TypeScript meta-framework, not a from-scratch calculus and not a wrap of DeepSeek Harness). Capabilities are plugins. On a default first start, three plugins are mounted:

1. **Web** — HTTP server on TCP 8080 and the blank canvas.
2. **Agent** — Cordis plugin that runs **Grok CLI** (ACP). Grok is the coding agent (shell, skills, MCP). The plugin is not the kernel.
3. **Assistant** — lower-right control and chat panel. A boot plugin, not welded to web. Replaceable and removable (§8c).

```
operator
  └── this process (Cordis kernel)
        ├── plugin: web        (HTTP 8080, canvas)
        ├── plugin: agent      (Grok CLI child; ACP)
        ├── plugin: assistant  (lower-right control + chat; optional)
        └── Cordis plugins the agent mounts later (UI and other in-process fibers)
            Grok skills and MCP servers live on disk / as Grok children, not as Cordis plugins
```

There is no in-process sandbox API for tools. The agent uses ordinary processes (shell, package managers, MCP servers). Where that process tree is allowed to run is a **deployment** choice (§6).

## 4. What it is not

- Not a habitat or supervisor. It does not own walls, a network log, or fail-closed routing.
- Not DeepSeek Harness. We do not wrap `dsh`. Cordis is the kernel. The **agent plugin** is a Cordis module that **spawns Grok CLI**; Grok is not the kernel.
- Not a per-command host sandbox. Tools the agent runs are ordinary processes.
- Not a static site with an LLM chatbot bolted on. The chat is how the agent changes the *same* running graph that serves the canvas.
- Not a WebAssembly plugin host. Plugins are TypeScript Cordis modules. There is no in-process WASM sandbox.
- Not a security scanner. Scanning, if any, is an **outside** process (habitat wall, download proxy, artifactory, or another hop on the fetch path). The agent is expected to **write most of its own code**; pulling third-party packages is exceptional, not the normal loop.

## 5. Vocabulary

| Term | Meaning |
| --- | --- |
| Kernel | Cordis runtime in this Node process: load, unload, inject, provide, revertible effects. |
| Plugin | A Cordis plugin: `inject` / `provide` / `apply(ctx)`. Unload runs inverses. |
| Boot plugins | Web, agent, and assistant, mounted when the process starts. Assistant may later be omitted. |
| Canvas | The main visible surface of the web app. Empty at boot. Other plugins may fill it. |
| Assistant | Lower-right control and the chat UI it opens. A Cordis plugin. Talks to the agent plugin in-process. Replaceable and removable. |
| Skill | Grok skill: a directory with `SKILL.md` (YAML frontmatter + markdown). Instruction pack, not a Cordis plugin. |
| MCP server | A process that speaks Model Context Protocol. **Grok CLI** is the client. Config lives in Grok’s TOML. |
| App root | Working directory of the `fregoli` process: Cordis config, `.grok/skills/`, `.grok/config.toml`. |
| Session log | Grok’s own session (what the model sees). Fregoli does not keep a second prompt log. The assistant UI may show a live transcript of the current ACP session. |
| Fiber | A running plugin instance and its lifecycle (`INACTIVE` → `RELOADING` → `ACTIVE` → `UNLOADING`). |
| Page bridge | Browser ↔ web plugin ↔ agent plugin ↔ Grok. Lets the agent see the live page and receive user UI actions. |

## 6. Deployment

This process is a Node program that listens on **8080**. It can run on a developer machine, in an ordinary container, or behind any reverse proxy.

**Recommended:** run it as an inhabitant of **Hermetarium** (https://github.com/pihme/hermetarium): OCI image, weak `runc` or strong Firecracker wall, Squid as the only network path, I/O log on the wall. Then:

- Operator reaches the UI at `hermetarium url <id>`.
- Outbound model APIs and package downloads use that logged path. Keys stay in the host ACL, not in the image.
- The agent may use the image’s Linux (`apt-get`, a compiler, …). That is habitat freedom, not the normal way to add app features. App features are written as Cordis plugins (D30).

Hermetarium is **not required**. A laptop `node` process is a valid deployment. Without a habitat there is no wall-side I/O log and no fail-closed network; that is accepted for that deployment, not a defect of this spec.

**Cordis effects wrap only processes the agent plugin itself starts:** the Grok CLI child, and the page-bridge MCP server the plugin offers to Grok. Inverse = kill that child. Grok’s descendants (shell, `npm`, MCP servers listed in Grok’s TOML) are Grok’s. Unload of the agent plugin kills Grok, which should take its children with it. Files and packages on disk remain.

## 7. Kernel

Use **Cordis** (https://github.com/cordiverse/cordis). Do not reimplement the paper’s calculus. Do not start from DeepSeek Harness.

- `ctx.effect` is the only mutation primitive. Listeners, HTTP routes, child processes, and service registration go through it so unload reverses them.
- Plugins declare `inject` and `provide`. The loader activates a fiber when injects exist and deactivates it when they vanish.
- Consumers look up services on `ctx` (stable keys). They do not import a concrete implementation.
- Cordis’s loader mounts plugins from config under the app root. The agent plugin exposes load/unload to Grok as tools (or as the page-bridge MCP). Native ESM is not the load/unload mechanism (Node ESM cannot evict modules).

The kernel has no product features. Web UI and the Grok-CLI bridge are plugins. Skills and MCP belong to Grok CLI.

## 8. Boot plugins

### 8a. Web

Provides HTTP on 8080 and the first UI.

**Canvas.** Full remaining viewport, empty. No demo widgets. This is the surface later UI plugins render into (a `ui` service or equivalent that the web plugin hosts). A slot for the assistant control is part of that host, not the assistant itself.

If the web plugin unloads, 8080 closes. The agent must not unload it without a replacement that `provide`s the same HTTP/UI keys, or the operator loses the HTTP server. The loader’s inject graph is what enforces that, not a special case in the kernel.

### 8b. Agent

**Provides** the chat service (ACP session to Grok). The assistant plugin **injects** that service. Implementation: spawn **Grok CLI** as a child and speak [ACP](https://agentclientprotocol.com) (`grok agent --always-approve stdio`, working directory = app root). Unload kills that process (`ctx.effect`). This is not the Grok TUI, and Grok is not the Cordis kernel.

Grok already has shell, file tools, skills, and MCP. We do not reimplement those in the agent plugin. Default model is whatever that CLI uses (override with Grok’s own flags/config). Auth: `XAI_API_KEY`, or a habitat ACL that injects `Authorization` on the path to the xAI origin.

The agent is **told the setup** (system context / rules, not a secret): this process is a Cordis graph; boot plugins are web, agent, and assistant; the assistant UI is replaceable and may be removed; it changes the app by writing Cordis plugins, Grok skills, and MCP servers and asking the loader to load or unload; the canvas is what users see; half-written modules must not be mounted; it may install and run ordinary tools (Grok’s shell). If it is running in a sealed habitat, that is extra context, not a different agent.

It can:

- Run **shell** and file tools (Grok built-ins).
- **See the live page** the operator is looking at, and receive user clicks/highlights, via the page bridge (§8d).
- Write a **Cordis plugin** (TypeScript module), register it with the loader, wait until the fiber is `ACTIVE`. That may change routes and the canvas. The loader is a tool or MCP the agent plugin exposes to Grok.
- Write a **skill** (Grok `SKILL.md` under the app root). Grok discovers it on the next turn or new session.
- Write and configure an **MCP server**; Grok is the client.

**Skills** are Grok’s format (Grok CLI loads them; we do not parse them ourselves except to write files):

- Directory containing `SKILL.md`.
- YAML frontmatter: required `name` (lowercase, digits, hyphens) and `description`. Optional: `when-to-use`, `allowed-tools`, `argument-hint`, `compatibility`, `license`, `metadata`.
- Markdown body: the procedure.
- Discovery is Grok’s: `<app root>/.grok/skills/`, then `~/.grok/skills/`, plus Grok’s other documented roots. New skills go under the app root so they travel with the app.

A skill is not a Cordis plugin.

**MCP** is Grok’s. We do not add a second MCP client. Config: `[mcp_servers.<name>]` in `<app root>/.grok/config.toml`. Stdio is what we document. If the agent writes an HTTP/SSE server into that file, Grok CLI may use it; Fregoli does not implement HTTP MCP itself. **Grok marketplace plugins** (skill+MCP+hook bundles) are out of scope until asked. Say **Cordis plugin** when we mean in-process load/unload.

A first-slice stub is allowed only if the `grok` binary is missing. When `grok` is on `PATH`, the agent plugin must use it, not a bare chat API and not another vendor CLI.

### 8c. Assistant

The assistant is its own Cordis plugin. It `provide`s a well-known key (for example `assistantUi`). Default UI: a control in the **lower right** that opens a panel to talk to the agent (send, replies, working state). Chat is in-process (assistant → agent plugin → Grok ACP). Outbound network is Grok calling the model or a remote tool. The page-bridge WebSocket is local, not that outbound path.

It is **replaceable**: another plugin may `provide` the same key (new layout, new copy, no button, a menu item, …).

It is **removable**: unload it with no replacement. A finished app may be canvas-only. The agent plugin can stay loaded (tools, future `--assistant`) even when no chat UI is mounted.

Saved loader config may omit assistant. Then a normal start has no assistant UI.

**`fregoli --assistant`** at process start mounts the **stock** assistant as the provider of `assistantUi`. Saved config that omitted assistant, or that named a replacement, is ignored for that key on this start. Use this to get the original chat UI back after the app was “finished.” The flag is start-time only; a later unload in that session is still allowed.

Loader config (which extra plugins to mount besides the default first-start set) lives under the app root. Exact filename is an implementation choice (Cordis config).

### 8d. Page bridge

Grok does not run in the browser. The operator’s tab is a different process. The agent must still **see what the user sees** on this app’s page (canvas and, if mounted, assistant), not only the source files on disk.

**Observe.** A live connection from the browser to the web plugin (WebSocket or equivalent) carries a snapshot of the **current document**: the **serialized DOM** of this origin (the app root), plus selected metadata (URL, viewport, focused element). That is the required shape. An accessibility tree or a screenshot may be added later; they are not required. Not other browser tabs, not cross-origin iframes we do not control. The agent plugin exposes this to Grok as tools. DOM capture and click handling stay **in the Fregoli Node process**. Grok is only the MCP **client** (D33): the agent plugin starts that server (stdio or a loopback port) before Grok, as a Cordis effect (D32). If no browser is connected, observe returns an error, not an empty fake page. If several tabs are connected, the snapshot is the **most recently focused** connected tab.

**Act.** The agent can offer **in-page tools for the user**: highlight a target, ask the user to click (or type). The user’s action (selector, click, value) is sent back on the same bridge and returned to Grok as a **tool result**. The agent does not silently drive the operator’s pointer unless a later slice adds an explicit automation tool.

Path: browser → web plugin → agent plugin → Grok ACP/MCP → model. Unload of web or agent tears down the bridge (`ctx.effect`).

The snapshot Grok sees is the DOM, not a screenshot.

## 9. Self-modification and the gate

A file watcher is **not** “every disk write becomes the UI.” A half-written file is an incomplete effect.

- The loader (or an agent tool that talks to the loader) mounts a plugin only when load/`apply` succeeds. The UI reflects **ACTIVE** fibers, not the contents of a dirty editor buffer.
- Failed load: fiber does not become `ACTIVE`; previous provider stays if it still exists; the session log records the error.
- Unload runs inverses (routes dropped, MCP child killed, canvas contribution removed).
- Hot replace: unload then load, or Cordis HMR through the loader — same gate.

The agent improving the app is **load/unload of plugins**, not rewrite-a-monolith-and-restart-Node. Restarting Node is a last resort and drops in-process state.

## 10. Logs

| Log | Where | What |
| --- | --- | --- |
| Session log | Grok’s session files | Prompts and tool calls the model saw. The assistant UI may stream the live ACP transcript. |
| Network I/O log | Optional, outside this process | Packets that leave the machine or habitat, if the deployment provides one (Hermetarium does) |

The session log is required. A wall-side I/O log is a property of the deployment, not of the kernel.

## 11. Lifecycle

1. Start `fregoli` with the boot plugins (directly, or as a container `CMD`). Pass `--assistant` to force the stock assistant UI.
2. Open `http://<host>:8080`. Canvas is blank. Assistant is in the lower right unless it was omitted from the saved graph and `--assistant` was not passed.
3. Operator talks to the agent. The agent may install tools, write plugins/skills/MCP servers, and mount them.
4. The canvas and routes update when new fibers become `ACTIVE`.
5. Stop the process. In-process state is gone. Files on disk remain if the deployment keeps the filesystem.

If deployed in Hermetarium: `create --image … --acl …`, open `hermetarium url`, `destroy` drops the wall. This app must tolerate ephemeral filesystems.

## 12. First slice (when we implement)

Specified so a later hello-world has a bar. Not implemented yet.

1. Kernel boots; web, agent, and stock assistant fibers `ACTIVE`.
2. GET `/` shows blank canvas + lower-right assistant.
3. Assistant chat reaches the agent. Stub only if `grok` is not on `PATH`; otherwise Grok CLI over ACP.
4. Agent (or a test stand-in) mounts a plugin that draws on the canvas; reload without restarting Node.
5. A deliberately broken plugin file does not become `ACTIVE` and does not replace the canvas.

Hermetarium is not part of that bar. Later slices: inhabitant image; page bridge (observe DOM + user click back to Grok).

## 13. Open questions

None for the product shape. Implementation can still choose library versions, exact ACP flags, and DOM serialization details.
