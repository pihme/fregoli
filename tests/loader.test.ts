import assert from "node:assert/strict";
import { createServer } from "node:net";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FiberState } from "cordis";
import { startKernel, stopKernel } from "../src/kernel.ts";
import { isActive, mountPlugin } from "../src/loader.ts";
import { webPlugin } from "../src/plugins/web/index.ts";

const draw = fileURLToPath(new URL("./fixtures/draw.ts", import.meta.url));
const broken = fileURLToPath(new URL("./fixtures/broken.ts", import.meta.url));

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

test("mounting a plugin draws on the canvas without restart", async () => {
  const port = await freePort();
  const ctx = await startKernel([[webPlugin, { port, host: "127.0.0.1" }]]);
  try {
    const before = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    assert.doesNotMatch(before, /hello-canvas/);
    const fiber = await mountPlugin(ctx, draw);
    assert.equal(isActive(fiber), true);
    const after = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    assert.match(after, /hello-canvas/);
  } finally {
    await stopKernel(ctx);
  }
});

test("broken plugin does not become ACTIVE and does not replace canvas", async () => {
  const port = await freePort();
  const ctx = await startKernel([[webPlugin, { port, host: "127.0.0.1" }]]);
  try {
    await mountPlugin(ctx, draw);
    let failed = false;
    try {
      await mountPlugin(ctx, broken);
    } catch {
      failed = true;
    }
    const fibers = [...ctx.registry.values()].flatMap((rt) => [...rt.fibers]);
    const brokenFiber = fibers.find((f) => f.name === "broken");
    if (brokenFiber) {
      assert.notEqual(brokenFiber.state, FiberState.ACTIVE);
    } else {
      assert.equal(failed, true);
    }
    const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    assert.match(html, /hello-canvas/);
  } finally {
    await stopKernel(ctx);
  }
});
