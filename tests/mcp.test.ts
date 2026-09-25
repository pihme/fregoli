import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { createServer } from "node:net";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { startKernel, stopKernel } from "../src/kernel.ts";
import { webPlugin } from "../src/plugins/web/index.ts";

const mcp = fileURLToPath(new URL("../src/mcp.ts", import.meta.url));

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      if (!addr || typeof addr === "string") {
        s.close();
        reject(new Error("no port"));
        return;
      }
      const port = addr.port;
      s.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

test("MCP observe_page returns the live DOM snapshot", async () => {
  const port = await freePort();
  const ctx = await startKernel([[webPlugin, { port, host: "127.0.0.1" }]]);
  const child = spawn(process.execPath, ["--import", "tsx", mcp], {
    env: { ...process.env, FREGOLI_URL: `http://127.0.0.1:${port}` },
    stdio: ["pipe", "pipe", "pipe"],
  });
  try {
    await fetch(`http://127.0.0.1:${port}/bridge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tabId: "t1",
        html: "<html id=live>",
        url: "http://127.0.0.1/app",
        viewport: { width: 1, height: 1 },
        focused: null,
      }),
    });
    const rl = createInterface({ input: child.stdout! });
    const rpc = (id: number, method: string, params?: unknown) => {
      child.stdin!.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    };
    const read = () =>
      new Promise<Record<string, unknown>>((resolve) => {
        rl.once("line", (line) => resolve(JSON.parse(line) as Record<string, unknown>));
      });
    rpc(1, "initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } });
    const init = await read();
    assert.ok(init.result);
    rpc(2, "tools/list");
    const list = (await read()) as { result: { tools: Array<{ name: string }> } };
    assert.ok(list.result.tools.some((t) => t.name === "observe_page"));
    rpc(3, "tools/call", { name: "observe_page", arguments: {} });
    const call = (await read()) as { result: { content: Array<{ text: string }> } };
    assert.match(call.result.content[0].text, /id=live/);
    const waiting = new Promise<Record<string, unknown>>((resolve) => {
      rl.once("line", (line) => resolve(JSON.parse(line) as Record<string, unknown>));
    });
    rpc(4, "tools/call", { name: "wait_click", arguments: { selector: "#go", timeoutMs: 3000 } });
    await new Promise((r) => setTimeout(r, 50));
    await fetch(`http://127.0.0.1:${port}/bridge/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "click", selector: "#go" }),
    });
    const waited = (await waiting) as { result: { content: Array<{ text: string }> } };
    assert.match(waited.result.content[0].text, /#go/);
  } finally {
    child.kill();
    await stopKernel(ctx);
  }
});
