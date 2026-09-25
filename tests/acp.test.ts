import assert from "node:assert/strict";
import { createServer } from "node:net";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { startKernel, stopKernel } from "../src/kernel.ts";
import { loaderPlugin } from "../src/loader.ts";
import { agentPlugin } from "../src/plugins/agent/index.ts";
import { webPlugin } from "../src/plugins/web/index.ts";

const fakeAcp = fileURLToPath(new URL("./fixtures/fake-acp.ts", import.meta.url));

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
