import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { test } from "node:test";
import { boot } from "../src/boot.ts";
import { stopKernel } from "../src/kernel.ts";

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
