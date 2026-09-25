import assert from "node:assert/strict";
import { createServer } from "node:net";
import { test } from "node:test";
import { startKernel, stopKernel } from "../src/kernel.ts";
import { webPlugin } from "../src/plugins/web/index.ts";

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

test("GET / is a blank canvas without assistant", async () => {
  const port = await freePort();
  const ctx = await startKernel([[webPlugin, { port, host: "127.0.0.1" }]]);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /id="canvas"/);
    assert.doesNotMatch(html, /assistant-control/);
  } finally {
    await stopKernel(ctx);
  }
});
