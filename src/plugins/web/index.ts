import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Context, Service } from "cordis";

declare module "cordis" {
  interface Context {
    ui: Ui;
    httpServer: http.Server;
  }
}

export class Ui extends Service {
  canvasInner = "";
  assistantInner = "";

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
<style>
html,body{margin:0;height:100%;font-family:system-ui,sans-serif}
#canvas{position:absolute;inset:0}
#assistant-slot{position:absolute;right:1.25rem;bottom:1.25rem;z-index:2}
</style>
</head>
<body>
<div id="canvas">${this.canvasInner}</div>
<div id="assistant-slot">${this.assistantInner}</div>
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
    const reply = await chat.reply(text);
    const payload = JSON.stringify({ text: reply });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(payload);
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
  provide: ["ui"],
  async apply(ctx: Context, config: WebConfig = {}): Promise<void> {
    await ctx.plugin(Ui);
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
