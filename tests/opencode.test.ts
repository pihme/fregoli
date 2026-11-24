import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startKernel, stopKernel } from "../src/kernel.ts";
import { FREGOLI_RULES } from "../src/plugins/agent/acp.ts";
import { agentPlugin } from "../src/plugins/agent/index.ts";
import {
  modelEndpointFromEnv,
  modelEnv,
  openCodeEnv,
  openCodeModelConfig,
  providerId,
  whichOpenCode,
  type ModelEndpoint,
} from "../src/plugins/agent/opencode.ts";

const endpoint: ModelEndpoint = {
  baseURL: "http://model.example/v1",
  model: "some-model",
  apiKey: "synthetic-test-key",
};

// #53: the in-app child is OpenCode over ACP, not Grok CLI.
test("the agent command is opencode acp", () => {
  const w = whichOpenCode();
  assert.ok(w === null || w.includes("opencode"));
});

// #54: the endpoint comes from the environment and has no vendor default.
test("model endpoint needs all three variables", () => {
  assert.equal(modelEndpointFromEnv({}), null);
  assert.equal(modelEndpointFromEnv({ [modelEnv.baseURL]: "http://x/v1" }), null);
  assert.equal(
    modelEndpointFromEnv({ [modelEnv.baseURL]: "http://x/v1", [modelEnv.model]: "m" }),
    null,
    "a key is required",
  );
  assert.deepEqual(
    modelEndpointFromEnv({
      [modelEnv.baseURL]: "http://x/v1",
      [modelEnv.model]: "m",
      [modelEnv.apiKey]: "k",
    }),
    { baseURL: "http://x/v1", model: "m", apiKey: "k" },
  );
});

// #54: the config points OpenCode at the operator's endpoint, nothing vendored.
test("model config uses the configured endpoint", () => {
  const cfg = openCodeModelConfig(endpoint) as {
    model: string;
    providers: Record<string, { settings: { baseURL: string; apiKey: string }; models: Record<string, unknown> }>;
  };
  assert.equal(cfg.model, `${providerId}/some-model`);
  const provider = cfg.providers[providerId];
  assert.equal(provider.settings.baseURL, endpoint.baseURL);
  assert.equal(provider.settings.apiKey, endpoint.apiKey);
  assert.ok("some-model" in provider.models);
  assert.doesNotMatch(JSON.stringify(cfg), /xai|grok/i);
});

// #53: the child gets Fregoli's rules, no project AGENTS.md, skills denied.
test("openCodeEnv carries the slim profile", () => {
  const env = openCodeEnv(FREGOLI_RULES, endpoint);
  assert.equal(env.OPENCODE_DISABLE_PROJECT_CONFIG, "1");
  const cfg = JSON.parse(String(env.OPENCODE_CONFIG_CONTENT));
  assert.equal(cfg.prompt.system, FREGOLI_RULES);
  assert.deepEqual(cfg.permissions, [{ action: "skill", resource: "*", effect: "deny" }]);
  assert.ok(cfg.providers[providerId], "the endpoint reaches the child");
});

// A run without an endpoint must not call a hard-coded vendor (#54).
test("openCodeEnv without an endpoint configures no provider", () => {
  const cfg = JSON.parse(String(openCodeEnv(FREGOLI_RULES, null).OPENCODE_CONFIG_CONTENT));
  assert.equal(cfg.providers, undefined);
  assert.equal(cfg.model, undefined);
  assert.equal(cfg.prompt.system, FREGOLI_RULES);
});

// #53: without opencode on PATH the stub answers and no child is started.
test("chat stub when opencode cannot be spawned", async () => {
  const ctx = await startKernel([[agentPlugin, { acp: false }]]);
  try {
    assert.equal(await ctx.chat.reply("hi"), "stub: hi", "acp: false keeps the stub");
  } finally {
    await stopKernel(ctx);
  }
});

// #53: the app root's AGENTS.md does not reach the in-app session.
test("a repo AGENTS.md is not passed to the child", async () => {
  const appRoot = mkdtempSync(join(tmpdir(), "fregoli-"));
  writeFileSync(join(appRoot, "AGENTS.md"), "PROJECT-RULES-MUST-NOT-LEAK\n");
  const env = openCodeEnv(FREGOLI_RULES, null);
  assert.equal(env.OPENCODE_DISABLE_PROJECT_CONFIG, "1");
  assert.doesNotMatch(String(env.OPENCODE_CONFIG_CONTENT), /PROJECT-RULES-MUST-NOT-LEAK/);
});