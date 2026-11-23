import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { startKernel, stopKernel } from "../src/kernel.ts";
import { agentPlugin, type Chat } from "../src/plugins/agent/index.ts";
import { opencodeEnv } from "../src/plugins/agent/opencode.ts";
import {
  isOpenCode,
  noEndpointMessage,
  openCodeModelConfig,
  readModelEndpoint,
} from "../src/plugins/agent/model.ts";

const fakeEnvAcp = fileURLToPath(new URL("./fixtures/fake-acp-env.ts", import.meta.url));
const KEY = "test-key-not-real";
const full = {
  FREGOLI_MODEL_BASE_URL: "http://127.0.0.1:9/v1/",
  FREGOLI_MODEL_API_KEY: KEY,
  FREGOLI_MODEL_ID: "qwen3-coder",
};

test("no model endpoint without all three variables", () => {
  const none = readModelEndpoint({});
  assert.equal(none.endpoint, null);
  assert.equal(
    none.problem,
    "FREGOLI_MODEL_BASE_URL, FREGOLI_MODEL_API_KEY, FREGOLI_MODEL_ID not set",
  );
  const noKey = readModelEndpoint({ ...full, FREGOLI_MODEL_API_KEY: " " });
  assert.equal(noKey.endpoint, null);
  assert.equal(noKey.problem, "FREGOLI_MODEL_API_KEY not set");
  // A Grok key is not a model endpoint.
  assert.equal(readModelEndpoint({ XAI_API_KEY: "x" }).endpoint, null);
});

test("an invalid base URL is a problem, not a throw, and the message never holds the key", () => {
  for (const baseURL of ["not a url", "ftp://host/v1", "https://user:pw@host/v1"]) {
    const r = readModelEndpoint({ ...full, FREGOLI_MODEL_BASE_URL: baseURL });
    assert.equal(r.endpoint, null);
    assert.match(r.problem ?? "", /FREGOLI_MODEL_BASE_URL/);
    assert.ok(!noEndpointMessage(r.problem ?? "").includes(KEY));
    assert.ok(!noEndpointMessage(r.problem ?? "").includes("pw"));
  }
});

test("a full endpoint becomes an OpenCode Chat Completions provider without the key", () => {
  const r = readModelEndpoint(full);
  assert.deepEqual(r.endpoint, { baseURL: "http://127.0.0.1:9/v1", model: "qwen3-coder" });
  const cfg = openCodeModelConfig(r.endpoint!);
  assert.equal(cfg.model, "fregoli/qwen3-coder");
  assert.equal(cfg.providers, undefined);
  const provider = (cfg.provider as Record<string, Record<string, unknown>>).fregoli!;
  assert.equal(provider.npm, "@ai-sdk/openai-compatible");
  assert.deepEqual(provider.env, ["FREGOLI_MODEL_API_KEY"]);
  assert.deepEqual(provider.options, {
    baseURL: "http://127.0.0.1:9/v1",
    apiKey: "{env:FREGOLI_MODEL_API_KEY}",
  });
  assert.deepEqual(provider.models, { "qwen3-coder": { name: "qwen3-coder" } });
  const env = opencodeEnv(cfg);
  assert.ok(!env.OPENCODE_CONFIG_CONTENT!.includes(KEY));
  const merged = JSON.parse(env.OPENCODE_CONFIG_CONTENT!) as Record<string, unknown>;
  assert.equal(merged.model, cfg.model);
  assert.deepEqual(merged.provider, cfg.provider);
});

test("a model id with a slash stays one OpenCode model", () => {
  const r = readModelEndpoint({ ...full, FREGOLI_MODEL_ID: "openai/gpt-4o-mini" });
  assert.equal(openCodeModelConfig(r.endpoint!).model, "fregoli/openai/gpt-4o-mini");
});

test("isOpenCode looks at the command name only", () => {
  assert.ok(isOpenCode("opencode"));
  assert.ok(isOpenCode("/usr/local/bin/opencode"));
  assert.ok(isOpenCode("C:\\tools\\opencode.exe"));
  assert.ok(!isOpenCode("/usr/bin/grok"));
  assert.ok(!isOpenCode(process.execPath));
  assert.ok(!isOpenCode(""));
});

/** A command named `opencode` that is really Node; the fake ACP child is its script. */
function fakeOpenCode(): { command: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "fregoli-oc-"));
  const command = join(dir, "opencode");
  symlinkSync(process.execPath, command);
  return { command, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("OpenCode without an endpoint is not started and the chat answers with the stub", async () => {
  const oc = fakeOpenCode();
  const warnings: string[] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => void warnings.push(args.join(" "));
  const ctx = await startKernel([
    [
      agentPlugin,
      { acpCommand: oc.command, acpArgs: ["--import", "tsx", fakeEnvAcp], modelEnv: {} },
    ],
  ]);
  try {
    const chat = ctx.get("chat") as Chat;
    assert.equal(chat.acp, null);
    assert.equal(await chat.reply("hi"), "stub: hi");
    assert.deepEqual(warnings, [
      "fregoli agent: no model endpoint (FREGOLI_MODEL_BASE_URL, FREGOLI_MODEL_API_KEY, FREGOLI_MODEL_ID not set); the chat answers with the stub",
    ]);
  } finally {
    console.warn = warn;
    await stopKernel(ctx);
    oc.cleanup();
  }
});

test("OpenCode with an endpoint gets the config; the key comes from its own environment", async () => {
  const oc = fakeOpenCode();
  const saved = process.env.FREGOLI_MODEL_API_KEY;
  process.env.FREGOLI_MODEL_API_KEY = KEY;
  const ctx = await startKernel([
    [
      agentPlugin,
      { acpCommand: oc.command, acpArgs: ["--import", "tsx", fakeEnvAcp], modelEnv: full },
    ],
  ]);
  try {
    const chat = ctx.get("chat") as Chat;
    const seen = JSON.parse(await chat.reply("hi")) as { config: string | null; key: string };
    assert.ok(seen.config);
    assert.ok(!seen.config.includes(KEY));
    assert.equal((JSON.parse(seen.config) as { model: string }).model, "fregoli/qwen3-coder");
    assert.equal(seen.key, KEY);
  } finally {
    if (saved === undefined) delete process.env.FREGOLI_MODEL_API_KEY;
    else process.env.FREGOLI_MODEL_API_KEY = saved;
    await stopKernel(ctx);
    oc.cleanup();
  }
});

test("another ACP child still starts without an endpoint", async () => {
  const ctx = await startKernel([
    [
      agentPlugin,
      { acpCommand: process.execPath, acpArgs: ["--import", "tsx", fakeEnvAcp], modelEnv: {} },
    ],
  ]);
  try {
    const chat = ctx.get("chat") as Chat;
    const seen = JSON.parse(await chat.reply("hi")) as { config: string | null };
    // Only the slim profile, no model provider.
    const cfg = JSON.parse(seen.config!) as Record<string, unknown>;
    assert.ok(cfg.agent);
    assert.equal(cfg.model, undefined);
    assert.equal(cfg.provider, undefined);
  } finally {
    await stopKernel(ctx);
  }
});
