---
name: fregoli-app
description: How Fregoli works and how to change the running app (Cordis plugins, canvas, MCP tools). Use whenever the user wants the UI changed, a plugin loaded or unloaded, or asks what this app is.
---

You are the agent inside **Fregoli**, a Cordis kernel. The process stays up; you change the app by loading and unloading plugins, not by restarting Node.

## What is on screen

- **Canvas** (`#canvas`) is the product UI. At boot it shows the welcome canvas (shipped plugin `welcome` in `plugins/shipped/welcome.ts`). Users look at this.
- **Assistant** is the chat in the lower-right quarter. It is optional and replaceable. Do not treat it as the app.

`observe_page` returns `nextCanvas` (the canvas the server will serve) and `html` (the tab on screen). During a reply the tab stays old until the reply finishes. Judge a canvas change from `nextCanvas` only.

The user can press **Point** at the top of the chat and click the canvas. The message then names that element. That is the element they mean. Do not highlight the assistant.

## How to change the app

For a canvas change, do not explore the repository. Do not read `src/` or `tests/`. Do not call `search_tool`. Do not browse, click, or screenshot. The arguments are `load_plugin` `{ "file" }`, `unload_plugin` `{ "name" }`, `reload_page` `{}`, `observe_page` `{}`.

`setCanvas` replaces the whole canvas. When the user adds or changes a piece, keep what is already there. Call `observe_page` once, copy `nextCanvas`, and change only the part they named. If a runtime plugin already draws that canvas, edit that file, then `unload_plugin` its name and `load_plugin` the same file. Do not design a new page. Replace the canvas only when the user asks for a new scene, a different mockup, or to clear or start over.

Then `reload_page` once. The tab stays as it is until the reply finishes, then turns away and reloads once. Judge the change from `nextCanvas`. `html` stays old until then. Do not reload again. Reply in one sentence only when `nextCanvas` shows the change.

1. Write a TypeScript Cordis plugin on disk (absolute path). Example:

```ts
import type { Context } from "cordis";
export const plugin = {
  name: "my-feature",
  inject: ["ui"],
  apply(ctx: Context) {
    ctx.effect(() => {
      ctx.ui.setCanvas('<p id="hello">Hello</p>'); // replaces the whole canvas; to add, start from nextCanvas
      return () => ctx.ui.setCanvas("");
    });
  },
};
```

2. Only load it when the file is complete (valid `apply`, not half-written).
3. Write runtime plugins under `plugins/runtime/<name>.ts` (gitignored). Shipped plugins live in `plugins/shipped/` (in git). Kernel plugins are `src/plugins/` — do not put canvas features there.
4. Call MCP `load_plugin` with `{ "file": "plugins/runtime/<name>.ts" }` or an absolute path. That writes `fregoli.json`, so the plugin is still mounted after a restart. `unload_plugin` removes it from the file. Unloading the assistant sets `assistant` to false. Plugins in `plugins/shipped/` mount on every start and are not listed in the file.
5. Call `reload_page` once. The request is held until the reply finishes, then the figure turns away and the page loads the final canvas. Further calls in that reply do not reload again. The assistant panel and chat history stay open. The stock assistant is a Helferlein figure: resting, it opens the panel; while the panel is open it floats above the panel. The figure stays in the working pose until that one spin.
6. Call `list_plugins` to see fibers and states (`ACTIVE` means the UI should have changed).
7. Call `unload_plugin` with `{ "name": "my-feature" }` to reverse it.

Boot fibers: `web`, `agent`, `assistant`, `loaderApi`. Do not unload `web` unless you are replacing HTTP. Do not unload `agent` (that is you).

## MCP tools (server `fregoli`)

| Tool | Use |
| --- | --- |
| `list_plugins` | What is mounted |
| `load_plugin` | Mount a finished plugin file |
| `unload_plugin` | Dispose a fiber by name |
| `observe_page` | `nextCanvas` plus the on-screen DOM. Judge canvas changes from `nextCanvas` |
| `highlight` | Fill a canvas element so it is obvious. Do not highlight the assistant |
| `wait_click` | Highlight a canvas element and wait for the user to click it |
| `reload_page` | Hold one reload until the reply finishes |

## Skills and extra MCP

You may write Grok skills under `.grok/skills/<name>/SKILL.md` and MCP servers in `.grok/config.toml`. Those are Grok-side. Cordis plugins are how the **canvas** changes.
