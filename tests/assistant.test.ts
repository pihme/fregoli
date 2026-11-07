import assert from "node:assert/strict";
import { createServer } from "node:net";
import { test } from "node:test";
import { startKernel, stopKernel } from "../src/kernel.ts";
import { assistantPlugin } from "../src/plugins/assistant/index.ts";
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

test("GET / includes the assistant control", async () => {
  const port = await freePort();
  const ctx = await startKernel([
    [webPlugin, { port, host: "127.0.0.1" }],
    assistantPlugin,
  ]);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();
    assert.match(html, /id="assistant-control"/);
    assert.match(html, /id="assistant-thread"/);
    assert.match(html, /fregoli-assistant/);
    assert.match(html, /FREGOLI_BOOT/);
    assert.match(html, /id="canvas"/);
    assert.match(html, /\/chat\/live/);
    assert.match(html, /returnFromBack/);
    assert.match(html, /function revealThread\(\)/);
    assert.match(html, /requestAnimationFrame\(scrollThread\)/);
    assert.match(html, /returnFromBack\(\)\)\.catch\(\(\) => \{\}\);\n  \}\n  revealThread\(\);/);
    assert.match(html, /fregoliDeferReload/);
    assert.match(html, /Working \(/);
    assert.match(html, /count \+ 'x\)'/);
    assert.match(html, /replace\(\/\\s\+\/g, ' '\)/);
    assert.match(html, /pagehide/);
    assert.match(html, /reloadStarted/);
    assert.match(html, /if \(picking\) stopPicking\(\);\n      stage\.setAttribute\('role', 'button'\)/);
    assert.match(html, /location\.replace\('\/\?c=' \+ next\)/);
    assert.match(html, /id="assistant-point"/);
    assert.match(html, /fregoli-picking/);
  } finally {
    await stopKernel(ctx);
  }
});
