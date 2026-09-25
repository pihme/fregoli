#!/usr/bin/env tsx
import { createInterface } from "node:readline";

const origin = process.env.FREGOLI_URL ?? "http://127.0.0.1:8080";

type Rpc = { jsonrpc: string; id?: number; method?: string; params?: Record<string, unknown> };

const tools = [
  {
    name: "observe_page",
    description: "Serialized DOM of the operator's current Fregoli tab",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "load_plugin",
    description: "Mount a Cordis plugin file; only ACTIVE fibers change the UI",
    inputSchema: {
      type: "object",
      properties: { file: { type: "string" } },
      required: ["file"],
    },
  },
  {
    name: "highlight",
    description: "Highlight a CSS selector on the live page",
    inputSchema: {
      type: "object",
      properties: { selector: { type: "string" } },
      required: ["selector"],
    },
  },
];

async function callHttp(path: string, init?: RequestInit): Promise<string> {
  const res = await fetch(origin + path, init);
  return await res.text();
}

async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  if (name === "observe_page") return await callHttp("/observe");
  if (name === "load_plugin") {
    return await callHttp("/load", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file: args.file }),
    });
  }
  if (name === "highlight") {
    const res = await fetch(origin + "/bridge/highlight", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ selector: args.selector }),
    });
    return res.ok ? "ok" : await res.text();
  }
  throw new Error("unknown tool " + name);
}

function respond(id: number, result: unknown): void {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function fail(id: number, message: string): void {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message } }) + "\n");
}

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  void (async () => {
    let msg: Rpc;
    try {
      msg = JSON.parse(line) as Rpc;
    } catch {
      return;
    }
    if (msg.id == null || !msg.method) return;
    try {
      if (msg.method === "initialize") {
        respond(msg.id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "fregoli", version: "0.0.0" },
        });
        return;
      }
      if (msg.method === "notifications/initialized" || msg.method === "ping") {
        if (msg.method === "ping") respond(msg.id, {});
        return;
      }
      if (msg.method === "tools/list") {
        respond(msg.id, { tools });
        return;
      }
      if (msg.method === "tools/call") {
        const name = String(msg.params?.name ?? "");
        const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
        const text = await callTool(name, args);
        respond(msg.id, { content: [{ type: "text", text }] });
        return;
      }
      fail(msg.id, "unknown method " + msg.method);
    } catch (err) {
      fail(msg.id, String(err));
    }
  })();
});
