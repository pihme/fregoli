import assert from "node:assert/strict";
import { createServer } from "node:net";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { boot } from "../src/boot.ts";
import { stopKernel } from "../src/kernel.ts";

const appRoot = fileURLToPath(new URL("..", import.meta.url));

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

test("default boot mounts shipped welcome canvas", async () => {
  const port = await freePort();
  const ctx = await boot({ appRoot, port, host: "127.0.0.1", acp: false });
  try {
    const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    assert.match(html, /welcome-title/);
    assert.match(html, /Welcome/);
  } finally {
    await stopKernel(ctx);
  }
});
