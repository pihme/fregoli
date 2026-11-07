import assert from "node:assert/strict";
import { createServer } from "node:net";
import { test } from "node:test";
import { Context, Service } from "cordis";
import { startKernel, stopKernel } from "../src/kernel.ts";
import { webPlugin } from "../src/plugins/web/index.ts";
import type { PageBridge } from "../src/plugins/web/bridge.ts";

class Gate extends Service {
  done = false;
  constructor(ctx: Context) {
    super(ctx, "chat");
  }
  live() {
    return { id: 1, lines: [] as string[], text: this.done ? "ok" : null, done: this.done };
  }
}

const gatePlugin = {
  name: "gate",
  provide: ["chat"],
  async apply(ctx: Context) {
    await ctx.plugin(Gate);
  },
};

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
    const snap = (await res.json()) as { tabId: string; html: string; nextCanvas: string; note: string };
    assert.equal(snap.tabId, "b");
    assert.match(snap.html, /id=b/);
    assert.equal(snap.nextCanvas, "");
    assert.match(snap.note, /nextCanvas/);
  });
});

test("observe reports the canvas the server will serve", async () => {
  await withWeb(async (port, ctx) => {
    const ui = ctx.get("ui", true) as { setCanvas: (html: string) => void };
    ui.setCanvas('<p id="next">Next</p>');
    await fetch(`http://127.0.0.1:${port}/bridge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tabId: "live",
        html: "<html id=old>",
        url: "http://127.0.0.1/app",
        viewport: { width: 1, height: 1 },
        focused: null,
      }),
    });
    const snap = (await (await fetch(`http://127.0.0.1:${port}/observe`)).json()) as {
      html: string;
      nextCanvas: string;
      turnOpen: boolean;
    };
    assert.match(snap.html, /id=old/);
    assert.match(snap.nextCanvas, /id="next"/);
    assert.equal(snap.turnOpen, false);
  });
});

test("reload waits until the chat turn finishes", async () => {
  const port = await freePort();
  const ctx = await startKernel([
    [webPlugin, { port, host: "127.0.0.1" }],
    gatePlugin,
  ]);
  try {
    await fetch(`http://127.0.0.1:${port}/bridge/reload`, { method: "POST" });
    const held = (await (await fetch(`http://127.0.0.1:${port}/bridge/commands`)).json()) as { reload: boolean };
    assert.equal(held.reload, false);
    const still = (await (await fetch(`http://127.0.0.1:${port}/bridge/commands`)).json()) as { reload: boolean };
    assert.equal(still.reload, false);
    (ctx.get("chat", true) as Gate).done = true;
    const ready = (await (await fetch(`http://127.0.0.1:${port}/bridge/commands`)).json()) as {
      reload: boolean;
      canvas: number;
    };
    assert.equal(ready.reload, true);
    const again = (await (await fetch(`http://127.0.0.1:${port}/bridge/commands`)).json()) as { reload: boolean };
    assert.equal(again.reload, true);
    const acked = (await (await fetch(`http://127.0.0.1:${port}/bridge/commands?canvas=${ready.canvas}`)).json()) as {
      reload: boolean;
    };
    assert.equal(acked.reload, false);
  } finally {
    await stopKernel(ctx);
  }
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

test("reload stays until the tab reports the current canvas", async () => {
  await withWeb(async (port) => {
    await fetch(`http://127.0.0.1:${port}/bridge/reload`, { method: "POST" });
    const first = (await (await fetch(`http://127.0.0.1:${port}/bridge/commands`)).json()) as {
      reload: boolean;
      canvas: number;
    };
    assert.equal(first.reload, true);
    const second = (await (await fetch(`http://127.0.0.1:${port}/bridge/commands`)).json()) as {
      reload: boolean;
    };
    assert.equal(second.reload, true);
    const acked = (await (await fetch(`http://127.0.0.1:${port}/bridge/commands?canvas=${first.canvas}`)).json()) as {
      reload: boolean;
    };
    assert.equal(acked.reload, false);
  });
});

test("a canvas change stays pending until the tab loads it", async () => {
  const port = await freePort();
  const ctx = await startKernel([
    [webPlugin, { port, host: "127.0.0.1" }],
    gatePlugin,
  ]);
  try {
    const ui = ctx.get("ui", true) as { setCanvas: (html: string) => void; canvasRev: number };
    const seen = ui.canvasRev;
    ui.setCanvas('<article id="three-buttons-card"></article>');
    const held = (await (await fetch(`http://127.0.0.1:${port}/bridge/commands?canvas=${seen}`)).json()) as {
      reload: boolean;
    };
    assert.equal(held.reload, false);
    const still = (await (await fetch(`http://127.0.0.1:${port}/bridge/commands?canvas=${seen}`)).json()) as {
      reload: boolean;
    };
    assert.equal(still.reload, false);
    (ctx.get("chat", true) as Gate).done = true;
    const ready = (await (await fetch(`http://127.0.0.1:${port}/bridge/commands?canvas=${seen}`)).json()) as {
      reload: boolean;
      canvas: number;
    };
    assert.equal(ready.reload, true);
    assert.equal(ready.canvas, ui.canvasRev);
    const again = (await (await fetch(`http://127.0.0.1:${port}/bridge/commands?canvas=${seen}`)).json()) as {
      reload: boolean;
    };
    assert.equal(again.reload, true);
    const page = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(page.headers.get("cache-control"), "no-store");
    const html = await page.text();
    assert.match(html, new RegExp(`window\\.FREGOLI_CANVAS=${ui.canvasRev}(?:;|<)`));
    assert.match(html, /three-buttons-card/);
    assert.match(html, /commands\?canvas=/);
    assert.match(html, /location\.replace\('\/\?c=' \+/);
    const current = (await (await fetch(`http://127.0.0.1:${port}/bridge/commands?canvas=${ui.canvasRev}`)).json()) as {
      reload: boolean;
    };
    assert.equal(current.reload, false);
  } finally {
    await stopKernel(ctx);
  }
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
