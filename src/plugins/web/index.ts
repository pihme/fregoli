import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Context, Service } from "cordis";
import { bridgeClientScript, PageBridge, type Snapshot, type UserAction } from "./bridge.ts";

declare module "cordis" {
  interface Context {
    ui: Ui;
    httpServer: http.Server;
    pageBridge: PageBridge;
  }
}

export class Ui extends Service {
  canvasInner = "";
  assistantInner = "";
  bootId = crypto.randomUUID();

  constructor(ctx: Context) {
    super(ctx, "ui");
  }

  setCanvas(html: string): void {
    this.canvasInner = html;
  }

  setAssistant(html: string): void {
    this.assistantInner = html;
  }

  pageHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Fregoli</title>
<script>window.FREGOLI_BOOT=${JSON.stringify(this.bootId)}</script>
<style>
html,body{margin:0;height:100%;font-family:system-ui,sans-serif}
#canvas{position:absolute;inset:0}
#assistant-slot{position:absolute;inset:0;z-index:2;pointer-events:none}
#assistant-slot button,#assistant-slot #assistant-panel,#assistant-slot input{pointer-events:auto}
</style>
</head>
<body>
<div id="canvas">${this.canvasInner}</div>
<div id="assistant-slot">${this.assistantInner}</div>
${bridgeClientScript}
</body>
</html>
`;
  }
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function handle(
  ctx: Context,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = req.url ?? "/";
  const bridge = ctx.get("pageBridge", true) as PageBridge | undefined;
  if (url === "/observe" && req.method === "GET") {
    if (!bridge) {
      res.writeHead(503);
      res.end();
      return;
    }
    try {
      const snap = bridge.observe();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(snap));
    } catch (err) {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
    }
    return;
  }
  if (url === "/bridge" && req.method === "POST") {
    if (!bridge) {
      res.writeHead(503);
      res.end();
      return;
    }
    try {
      const body = JSON.parse(await readBody(req)) as Snapshot;
      body.at = Date.now();
      bridge.connect(body);
      bridge.focus(body.tabId);
      res.writeHead(204);
      res.end();
    } catch {
      res.writeHead(400);
      res.end();
    }
    return;
  }
  if (url === "/bridge/commands" && req.method === "GET") {
    const cmds = bridge?.takeCommands() ?? { highlight: null, reload: false };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(cmds));
    return;
  }
  if (url === "/bridge/reload" && req.method === "POST") {
    if (!bridge) {
      res.writeHead(503);
      res.end();
      return;
    }
    bridge.requestReload();
    res.writeHead(204);
    res.end();
    return;
  }
  if (url === "/bridge/action" && req.method === "POST") {
    if (!bridge) {
      res.writeHead(503);
      res.end();
      return;
    }
    try {
      const action = JSON.parse(await readBody(req)) as UserAction;
      bridge.reportAction(action);
      res.writeHead(204);
      res.end();
    } catch {
      res.writeHead(400);
      res.end();
    }
    return;
  }
  if (url.startsWith("/bridge/wait") && req.method === "GET") {
    if (!bridge) {
      res.writeHead(503);
      res.end();
      return;
    }
    const timeoutMs = Number(new URL(url, "http://fregoli.local").searchParams.get("timeout") ?? "15000");
    const action = await Promise.race([
      bridge.waitForAction(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (!action) {
      res.writeHead(504, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "wait_click timeout" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(action));
    return;
  }
  if (url === "/bridge/highlight" && req.method === "POST") {
    if (!bridge) {
      res.writeHead(503);
      res.end();
      return;
    }
    try {
      const body = JSON.parse(await readBody(req)) as { selector?: string };
      bridge.highlight(body.selector ?? "");
      res.writeHead(204);
      res.end();
    } catch {
      res.writeHead(400);
      res.end();
    }
    return;
  }
  if (url === "/plugins" && req.method === "GET") {
    const api = ctx.get("loaderApi", true) as { list: () => unknown } | undefined;
    if (!api) {
      res.writeHead(503);
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(api.list()));
    return;
  }
  if (url === "/unload" && req.method === "POST") {
    const api = ctx.get("loaderApi", true) as
      | { unload: (name: string) => Promise<unknown> }
      | undefined;
    if (!api) {
      res.writeHead(503);
      res.end();
      return;
    }
    let name = "";
    try {
      name = (JSON.parse(await readBody(req)) as { name?: string }).name ?? "";
    } catch {
      name = "";
    }
    try {
      const out = await api.unload(name);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(out));
    } catch (err) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }
  if (url === "/load" && req.method === "POST") {
    const api = ctx.get("loaderApi", true) as
      | { mount: (file: string) => Promise<unknown> }
      | undefined;
    if (!api) {
      res.writeHead(503);
      res.end();
      return;
    }
    let file = "";
    try {
      const body = JSON.parse(await readBody(req)) as { file?: string };
      file = body.file ?? "";
    } catch {
      file = "";
    }
    try {
      await api.mount(file);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    }
    return;
  }
  if (url === "/chat" && req.method === "POST") {
    const chat = ctx.get("chat", true);
    if (!chat) {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ text: "" }));
      return;
    }
    let text = "";
    try {
      const body = JSON.parse(await readBody(req)) as { text?: string };
      text = body.text ?? "";
    } catch {
      text = "";
    }
    try {
      const reply = await chat.reply(text);
      const payload = JSON.stringify({ text: reply });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(payload);
    } catch (err) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ text: `agent error: ${String(err)}` }));
    }
    return;
  }
  if (url === "/" || url === "/index.html") {
    const ui = ctx.get("ui", true);
    if (!ui) {
      res.writeHead(503);
      res.end();
      return;
    }
    const body = ui.pageHtml();
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "content-length": Buffer.byteLength(body),
    });
    res.end(body);
    return;
  }
  res.writeHead(404);
  res.end();
}

export interface WebConfig {
  port?: number;
  host?: string;
}

export const webPlugin = {
  name: "web",
  provide: ["ui", "pageBridge"],
  async apply(ctx: Context, config: WebConfig = {}): Promise<void> {
    await ctx.plugin(Ui);
    await ctx.plugin(PageBridge);
  const host = config.host ?? "127.0.0.1";
  const port = config.port ?? 8080;
    const server = http.createServer((req, res) => {
      void handle(ctx, req, res);
    });
    ctx.effect(async () => {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => resolve());
      });
      return () =>
        new Promise<void>((resolve) => {
          server.closeAllConnections?.();
          server.close(() => resolve());
        });
    }, "http.listen");
  },
};
