import assert from "node:assert/strict";
import { createServer } from "node:net";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { startKernel, stopKernel } from "../src/kernel.ts";
import { loaderPlugin } from "../src/loader.ts";
import { FREGOLI_RULES } from "../src/plugins/agent/acp.ts";
import { agentPlugin } from "../src/plugins/agent/index.ts";
import { webPlugin } from "../src/plugins/web/index.ts";

const fakeAcp = fileURLToPath(new URL("./fixtures/fake-acp.ts", import.meta.url));

test("in-app rules keep the current canvas when the user adds", () => {
  assert.match(FREGOLI_RULES, /copy nextCanvas/);
  assert.match(FREGOLI_RULES, /Do not call search_tool/);
  assert.match(FREGOLI_RULES, /Do not design a new page/);
  assert.match(FREGOLI_RULES, /different mockup/);
});

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

test("POST /chat uses ACP when an agent is spawned", async () => {
  const port = await freePort();
  const ctx = await startKernel([
    [webPlugin, { port, host: "127.0.0.1" }],
    loaderPlugin,
    [
      agentPlugin,
      {
        acpCommand: process.execPath,
        acpArgs: ["--import", "tsx", fakeAcp],
        origin: `http://127.0.0.1:${port}`,
      },
    ],
  ]);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hello" }),
    });
    assert.equal(res.status, 200);
    const data = (await res.json()) as { text: string };
    assert.equal(data.text, "acp:hello");
  } finally {
    await stopKernel(ctx);
  }
});

test("a canvas change during a reply reloads once when the reply finishes", async () => {
  const port = await freePort();
  const ctx = await startKernel([
    [webPlugin, { port, host: "127.0.0.1" }],
    loaderPlugin,
    [
      agentPlugin,
      {
        acpCommand: process.execPath,
        acpArgs: ["--import", "tsx", fakeAcp],
        origin: `http://127.0.0.1:${port}`,
        acpPauseMs: 400,
      },
    ],
  ]);
  try {
    const pending = fetch(`http://127.0.0.1:${port}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "draw" }),
    });
    let open = false;
    for (let i = 0; i < 20 && !open; i++) {
      const live = (await (await fetch(`http://127.0.0.1:${port}/chat/live`)).json()) as { done?: boolean };
      open = live.done === false;
      if (!open) await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(open, true);
    const ui = ctx.get("ui", true) as { setCanvas: (html: string) => void };
    ui.setCanvas('<p id="next">Next</p>');
    const mid = (await (await fetch(`http://127.0.0.1:${port}/bridge/commands`)).json()) as { reload: boolean };
    assert.equal(mid.reload, false);
    const res = await pending;
    assert.equal(res.status, 200);
    const first = (await (await fetch(`http://127.0.0.1:${port}/bridge/commands`)).json()) as {
      reload: boolean;
      canvas: number;
    };
    assert.equal(first.reload, true);
    const second = (await (await fetch(`http://127.0.0.1:${port}/bridge/commands`)).json()) as { reload: boolean };
    assert.equal(second.reload, true);
    const acked = (await (await fetch(`http://127.0.0.1:${port}/bridge/commands?canvas=${first.canvas}`)).json()) as {
      reload: boolean;
    };
    assert.equal(acked.reload, false);
  } finally {
    await stopKernel(ctx);
  }
});

test("ACP timeout cancels the turn and does not send it again", async () => {
  const port = await freePort();
  const ctx = await startKernel([
    [webPlugin, { port, host: "127.0.0.1" }],
    loaderPlugin,
    [
      agentPlugin,
      {
        acpCommand: process.execPath,
        acpArgs: ["--import", "tsx", fakeAcp],
        origin: `http://127.0.0.1:${port}`,
        promptTimeoutMs: 200,
        acpHang: true,
      },
    ],
  ]);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "again" }),
    });
    assert.equal(res.status, 200);
    const data = (await res.json()) as { text: string };
    assert.match(data.text, /ACP timeout session\/prompt/);
    assert.equal(data.text.includes("acp:again"), false);
    const live = (await (await fetch(`http://127.0.0.1:${port}/chat/live`)).json()) as {
      done: boolean;
      text: string;
    };
    assert.equal(live.done, true);
    assert.match(live.text, /ACP timeout session\/prompt/);
  } finally {
    await stopKernel(ctx);
  }
});

test("GET /chat/live shows a tool line before the reply", async () => {
  const port = await freePort();
  const ctx = await startKernel([
    [webPlugin, { port, host: "127.0.0.1" }],
    loaderPlugin,
    [
      agentPlugin,
      {
        acpCommand: process.execPath,
        acpArgs: ["--import", "tsx", fakeAcp],
        origin: `http://127.0.0.1:${port}`,
        acpPauseMs: 400,
      },
    ],
  ]);
  try {
    const pending = fetch(`http://127.0.0.1:${port}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hello" }),
    });
    let seen = false;
    for (let i = 0; i < 20; i++) {
      const live = (await (await fetch(`http://127.0.0.1:${port}/chat/live`)).json()) as {
        lines?: string[];
      };
      if (live.lines?.includes("read_file")) {
        seen = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    assert.equal(seen, true);
    const res = await pending;
    const data = (await res.json()) as { text: string };
    assert.equal(data.text, "acp:hello");
    const done = (await (await fetch(`http://127.0.0.1:${port}/chat/live`)).json()) as {
      done: boolean;
      text: string;
      lines: string[];
    };
    assert.equal(done.done, true);
    assert.equal(done.text, "acp:hello");
    assert.deepEqual(done.lines, ["read_file"]);
  } finally {
    await stopKernel(ctx);
  }
});
