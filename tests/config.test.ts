import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { boot } from "../src/boot.ts";
import { stopKernel } from "../src/kernel.ts";

const draw = fileURLToPath(new URL("./fixtures/draw.ts", import.meta.url));

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

test("default start includes assistant", async () => {
  const port = await freePort();
  const dir = await mkdtemp(join(tmpdir(), "fregoli-"));
  const ctx = await boot({ appRoot: dir, port, host: "127.0.0.1", acp: false });
  try {
    const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    assert.match(html, /assistant-control/);
  } finally {
    await stopKernel(ctx);
  }
});

test("saved config can omit assistant", async () => {
  const port = await freePort();
  const dir = await mkdtemp(join(tmpdir(), "fregoli-"));
  await writeFile(join(dir, "fregoli.json"), JSON.stringify({ assistant: false }));
  const ctx = await boot({ appRoot: dir, port, host: "127.0.0.1", acp: false });
  try {
    const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    assert.doesNotMatch(html, /assistant-control/);
  } finally {
    await stopKernel(ctx);
  }
});

test("listen host 0.0.0.0 is reachable on loopback", async () => {
  const port = await freePort();
  const dir = await mkdtemp(join(tmpdir(), "fregoli-"));
  const ctx = await boot({ appRoot: dir, port, host: "0.0.0.0", acp: false });
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /assistant-control/);
  } finally {
    await stopKernel(ctx);
  }
});

test("load and unload are written to fregoli.json", async () => {
  const port = await freePort();
  const dir = await mkdtemp(join(tmpdir(), "fregoli-"));
  const shipped = join(dir, "plugins/shipped");
  const ctx = await boot({ appRoot: dir, port, host: "127.0.0.1", acp: false });
  try {
    await mkdir(shipped, { recursive: true });
    const shippedFile = join(shipped, "extra.ts");
    await writeFile(shippedFile, `export const plugin = { name: "extra", apply() {} };\n`);
    const shippedLoad = await fetch(`http://127.0.0.1:${port}/load`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file: shippedFile }),
    });
    assert.equal(shippedLoad.status, 200);
    const loaded = await fetch(`http://127.0.0.1:${port}/load`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file: draw }),
    });
    assert.equal(loaded.status, 200);
    const saved = JSON.parse(await readFile(join(dir, "fregoli.json"), "utf8")) as {
      assistant: boolean;
      plugins: string[];
    };
    assert.equal(saved.assistant, true);
    assert.deepEqual(saved.plugins, [draw]);
    const unloaded = await fetch(`http://127.0.0.1:${port}/unload`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "draw" }),
    });
    assert.equal(unloaded.status, 200);
    const afterDraw = JSON.parse(await readFile(join(dir, "fregoli.json"), "utf8")) as {
      plugins: string[];
    };
    assert.deepEqual(afterDraw.plugins, []);
    const drop = await fetch(`http://127.0.0.1:${port}/unload`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "assistant" }),
    });
    assert.equal(drop.status, 200);
    const finalCfg = JSON.parse(await readFile(join(dir, "fregoli.json"), "utf8")) as {
      assistant: boolean;
    };
    assert.equal(finalCfg.assistant, false);
  } finally {
    await stopKernel(ctx);
  }
  const port2 = await freePort();
  const again = await boot({ appRoot: dir, port: port2, host: "127.0.0.1", acp: false });
  try {
    const html = await (await fetch(`http://127.0.0.1:${port2}/`)).text();
    assert.doesNotMatch(html, /assistant-control/);
  } finally {
    await stopKernel(again);
  }
});

test("stock assistant serves the pinned Helferlein build", async () => {
  const port = await freePort();
  const dir = await mkdtemp(join(tmpdir(), "fregoli-"));
  const ctx = await boot({ appRoot: dir, port, host: "127.0.0.1", acp: false });
  try {
    const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    assert.match(html, /src="\/helferlein\.min\.js"/);
    assert.match(html, /fregoli-helferlein/);
    const script = await fetch(`http://127.0.0.1:${port}/helferlein.min.js`);
    assert.equal(script.status, 200);
    assert.match(script.headers.get("content-type") ?? "", /javascript/);
    assert.match(await script.text(), /Helferlein 0\.1\.2/);
  } finally {
    await stopKernel(ctx);
  }
});

test("--assistant remounts stock assistant", async () => {
  const port = await freePort();
  const dir = await mkdtemp(join(tmpdir(), "fregoli-"));
  await writeFile(join(dir, "fregoli.json"), JSON.stringify({ assistant: false }));
  const ctx = await boot({
    appRoot: dir,
    port,
    host: "127.0.0.1",
    forceAssistant: true,
    acp: false,
  });
  try {
    const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    assert.match(html, /assistant-control/);
  } finally {
    await stopKernel(ctx);
  }
});
