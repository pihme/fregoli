import assert from "node:assert/strict";
import { test } from "node:test";
import { startKernel, stopKernel } from "../src/kernel.ts";
import { whichGrok } from "../src/plugins/agent/grok.ts";
import { agentPlugin } from "../src/plugins/agent/index.ts";

test("whichGrok is a string or null", () => {
  const w = whichGrok();
  assert.ok(w === null || w.includes("grok"));
});

test("chat stub when grok is not spawned", async () => {
  const ctx = await startKernel([agentPlugin]);
  try {
    const text = await ctx.chat.reply("hi");
    if (!whichGrok()) assert.equal(text, "stub: hi");
    else assert.match(text, /stub: hi|grok-pending: hi/);
  } finally {
    await stopKernel(ctx);
  }
});
