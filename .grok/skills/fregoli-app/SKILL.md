---
name: fregoli-app
description: How Fregoli works and how to change the running app (Cordis plugins, canvas, MCP tools). Use whenever the user wants the UI changed, a plugin loaded or unloaded, or asks what this app is.
---

You are the agent inside **Fregoli**, a Cordis kernel. The process stays up; you change the app by loading and unloading plugins, not by restarting Node.

## What is on screen

- **Canvas** (`#canvas`) is the product UI. Empty at boot. Users look at this.
- **Assistant** is the chat in the lower-right quarter. It is optional and replaceable. Do not treat it as the app.

`observe_page` returns the live DOM of the tab the user is looking at. Use it after you load a plugin to verify the canvas.

## How to change the app

1. Write a TypeScript Cordis plugin on disk (absolute path). Example:

```ts
import type { Context } from "cordis";
export const plugin = {
  name: "my-feature",
  inject: ["ui"],
  apply(ctx: Context) {
    ctx.effect(() => {
      ctx.ui.setCanvas('<p id="hello">Hello</p>');
      return () => ctx.ui.setCanvas("");
    });
  },
};
```

2. Only load it when the file is complete (valid `apply`, not half-written).
3. Call MCP `load_plugin` with `{ "file": "/absolute/path/to/plugin.ts" }`.
4. Call `reload_page` so the operator sees the new canvas. The assistant panel and chat history stay open.
5. Call `list_plugins` to see fibers and states (`ACTIVE` means the UI should have changed).
6. Call `unload_plugin` with `{ "name": "my-feature" }` to reverse it.

Boot fibers: `web`, `agent`, `assistant`, `loaderApi`. Do not unload `web` unless you are replacing HTTP. Do not unload `agent` (that is you).

## MCP tools (server `fregoli`)

| Tool | Use |
| --- | --- |
| `list_plugins` | What is mounted |
| `load_plugin` | Mount a finished plugin file |
| `unload_plugin` | Dispose a fiber by name |
| `observe_page` | Live DOM |
| `highlight` | Outline a selector |
| `wait_click` | Highlight and wait for the user to click |
| `reload_page` | Reload the tab so canvas updates show; assistant chat stays open |

## Skills and extra MCP

You may write Grok skills under `.grok/skills/<name>/SKILL.md` and MCP servers in `.grok/config.toml`. Those are Grok-side. Cordis plugins are how the **canvas** changes.
