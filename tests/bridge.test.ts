import assert from "node:assert/strict";
import { createServer } from "node:net";
import { test } from "node:test";
import { startKernel, stopKernel } from "../src/kernel.ts";
import { webPlugin } from "../src/plugins/web/index.ts";
import type { PageBridge } from "../src/plugins/web/bridge.ts";

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

async function withWeb<T>(fn: (port: number, ctx: Awaited<ReturnType<typeof startKernel>>) => Promise<T>) {
  const port = await freePort();
  const ctx = await startKernel([[webPlugin, { port, host: "127.0.0.1" }]]);
  try {
    return await fn(port, ctx);
  } finally {
    await stopKernel(ctx);
  }
}

test("observe errors when no browser is connected", async () => {
  await withWeb(async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/observe`);
    assert.equal(res.status, 503);
  });
});

test("observe returns serialized DOM of the focused tab", async () => {
  await withWeb(async (port) => {
    const post = (tabId: string, html: string) =>
      fetch(`http://127.0.0.1:${port}/bridge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tabId,
          html,
          url: "http://127.0.0.1/app",
          viewport: { width: 800, height: 600 },
          focused: null,
        }),
      });
    await post("a", "<html id=a>");
    await new Promise((r) => setTimeout(r, 5));
    await post("b", "<html id=b>");
    const res = await fetch(`http://127.0.0.1:${port}/observe`);
    assert.equal(res.status, 200);
    const snap = (await res.json()) as { tabId: string; html: string };
    assert.equal(snap.tabId, "b");
    assert.match(snap.html, /id=b/);
  });
});

test("highlight then user click returns a tool result", async () => {
  await withWeb(async (port, ctx) => {
    const bridge = ctx.get("pageBridge", true) as PageBridge;
    const pending = bridge.waitForAction();
    await fetch(`http://127.0.0.1:${port}/bridge/highlight`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ selector: "#drawn" }),
    });
    const cmds = await (await fetch(`http://127.0.0.1:${port}/bridge/commands`)).json() as { highlight: string };
    assert.equal(cmds.highlight, "#drawn");
    await fetch(`http://127.0.0.1:${port}/bridge/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "click", selector: "#drawn" }),
    });
    const action = await pending;
    assert.equal(action.type, "click");
    assert.equal(action.selector, "#drawn");
  });
});

test("reload_page is a one-shot command for the browser", async () => {
  await withWeb(async (port) => {
    await fetch(`http://127.0.0.1:${port}/bridge/reload`, { method: "POST" });
    const first = (await (await fetch(`http://127.0.0.1:${port}/bridge/commands`)).json()) as {
      reload: boolean;
    };
    assert.equal(first.reload, true);
    const second = (await (await fetch(`http://127.0.0.1:${port}/bridge/commands`)).json()) as {
      reload: boolean;
    };
    assert.equal(second.reload, false);
  });
});

test("GET /bridge/wait returns the user click", async () => {
  await withWeb(async (port) => {
    const waiting = fetch(`http://127.0.0.1:${port}/bridge/wait?timeout=3000`);
    await new Promise((r) => setTimeout(r, 20));
    await fetch(`http://127.0.0.1:${port}/bridge/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "click", selector: "#go" }),
    });
    const res = await waiting;
    assert.equal(res.status, 200);
    const action = (await res.json()) as { type: string; selector: string };
    assert.equal(action.type, "click");
    assert.equal(action.selector, "#go");
  });
});
