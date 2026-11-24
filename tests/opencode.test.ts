import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { startKernel, stopKernel } from "../src/kernel.ts";
import { AcpClient, FREGOLI_RULES } from "../src/plugins/agent/acp.ts";
import { agentPlugin } from "../src/plugins/agent/index.ts";
import {
  agentArgs,
  agentCommand,
  agentLaunch,
  makeOpenCodeHome,
  missingModelEndpoint,
  modelEndpointFromEnv,
  modelEnv,
  openCodeChildEnv,
  openCodeConfig,
  providerId,
  removeOpenCodeHome,
  whichOpenCode,
  type ModelEndpoint,
} from "../src/plugins/agent/opencode.ts";

const endpoint: ModelEndpoint = {
  baseURL: "http://model.example/v1",
  model: "some-model",
  apiKey: "synthetic-test-key",
};

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

test("the agent command is opencode acp", () => {
  assert.equal(agentCommand, "opencode");
  assert.deepEqual(agentArgs, ["acp"]);
  const w = whichOpenCode();
  assert.ok(w === null || w.includes("opencode"));
});

test("model endpoint needs all three variables and has no vendor default", () => {
  assert.equal(modelEndpointFromEnv({}), null);
  assert.equal(modelEndpointFromEnv({ [modelEnv.baseURL]: "http://x/v1" }), null);
  assert.equal(
    modelEndpointFromEnv({ [modelEnv.baseURL]: "http://x/v1", [modelEnv.model]: "m" }),
    null,
  );
  assert.deepEqual(
    modelEndpointFromEnv({
      [modelEnv.baseURL]: "http://x/v1",
      [modelEnv.model]: "azure/gpt",
      [modelEnv.apiKey]: "k",
    }),
    { baseURL: "http://x/v1", model: "azure/gpt", apiKey: "k" },
  );
});

test("launch is a stub, a refusal, or a child", () => {
  assert.equal(agentLaunch(undefined, null, endpoint), "stub");
  assert.equal(agentLaunch(undefined, "/usr/bin/opencode", null), "blocked");
  assert.equal(agentLaunch(undefined, "/usr/bin/opencode", endpoint), "spawn");
  assert.equal(agentLaunch("/usr/bin/fake", null, null), "spawn");
});

test("OpenCode 2 config uses the agent system prompt and the configured endpoint", () => {
  const cfg = openCodeConfig(FREGOLI_RULES, endpoint) as {
    model: string;
    default_agent: string;
    agents: Record<string, { system: string }>;
    permissions: unknown;
    policies: Array<{ action: string; resource: string; effect: string }>;
    providers: Record<string, { package: string; settings: { baseURL: string; apiKey: string } }>;
    prompt?: unknown;
  };
  assert.equal(cfg.model, `${providerId}/some-model`);
  assert.equal(cfg.default_agent, providerId);
  assert.equal(cfg.agents[providerId].system, FREGOLI_RULES);
  assert.equal(cfg.prompt, undefined, "OpenCode 2 does not read prompt.system");
  assert.equal(cfg.providers[providerId].package, "@opencode/ai/providers/openai-compatible");
  assert.equal(cfg.providers[providerId].settings.baseURL, endpoint.baseURL);
  assert.equal(cfg.providers[providerId].settings.apiKey, `{env:${modelEnv.apiKey}}`);
  assert.deepEqual(cfg.permissions, [{ action: "skill", resource: "*", effect: "deny" }]);
  assert.ok(cfg.policies.some((p) => p.action === "skill.use" && p.resource === "*" && p.effect === "deny"));
  assert.ok(
    cfg.policies.some((p) => p.action === "provider.use" && p.resource === "*" && p.effect === "deny"),
  );
  const text = JSON.stringify(cfg);
  assert.doesNotMatch(text, /synthetic-test-key/);
  assert.doesNotMatch(text, /xai|grok|openai\.com/i);
});

test("child env skips project instructions and hides the operator config", () => {
  const home = makeOpenCodeHome();
  try {
    const env = openCodeChildEnv(FREGOLI_RULES, endpoint, home);
    assert.equal(env.OPENCODE_DISABLE_PROJECT_CONFIG, "1");
    assert.equal(env.OPENCODE_DISABLE_CLAUDE_CODE, "1");
    assert.equal(env.OPENCODE_CONFIG, undefined);
    assert.equal(env.XDG_CONFIG_HOME, join(home, "config"));
    assert.equal(env[modelEnv.apiKey], endpoint.apiKey);
    const cfg = JSON.parse(String(env.OPENCODE_CONFIG_CONTENT));
    assert.equal(cfg.agents[providerId].system, FREGOLI_RULES);
    assert.doesNotMatch(String(env.OPENCODE_CONFIG_CONTENT), /synthetic-test-key/);
    assert.doesNotMatch(String(env.OPENCODE_CONFIG_CONTENT), /PROJECT-RULES-MUST-NOT-LEAK/);
  } finally {
    removeOpenCodeHome(home);
  }
});

test("chat stub when the agent is not spawned", async () => {
  const ctx = await startKernel([[agentPlugin, { acp: false }]]);
  try {
    assert.equal(await ctx.chat.reply("hi"), "stub: hi");
  } finally {
    await stopKernel(ctx);
  }
});

test("a missing endpoint is reported and no child is started", async () => {
  if (!whichOpenCode()) return;
  const ctx = await startKernel([[agentPlugin, { model: null }]]);
  try {
    assert.equal(ctx.chat.child, null);
    assert.equal(await ctx.chat.reply("hi"), missingModelEndpoint);
  } finally {
    await stopKernel(ctx);
  }
});

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") throw new Error("no port");
      resolve(addr.port);
    });
  });
}

// Records the first Chat Completions body that carries the in-app rules.
// OpenCode 2.3.2 was checked this way: agents.fregoli.system lands, prompt.system does not,
// and OPENCODE_DISABLE_PROJECT_CONFIG keeps the repo AGENTS.md out.
test(
  "the first model request is the slim OpenCode 2 profile",
  { skip: !whichOpenCode(), timeout: 40_000 },
  async () => {
    const seen: string[] = [];
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        seen.push(body);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: "chatcmpl-test",
            object: "chat.completion",
            choices: [
              { index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" },
            ],
          }),
        );
      });
    });
    const port = await listen(server);
    const home = makeOpenCodeHome();
    const skillDir = join(home, "config", "opencode", "skills", "unrelated-skill");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      "---\nname: unrelated-skill\ndescription: UNRELATED_SKILL_MARKER\n---\nUNRELATED_SKILL_MARKER\n",
    );
    const live: ModelEndpoint = {
      baseURL: `http://127.0.0.1:${port}/v1`,
      model: "probe-model",
      apiKey: "synthetic-test-key",
    };
    const child = spawn(whichOpenCode()!, [...agentArgs], {
      cwd: home,
      stdio: ["pipe", "pipe", "pipe"],
      env: openCodeChildEnv(FREGOLI_RULES, live, home),
    });
    const acp = new AcpClient(child);
    try {
      await acp.start({ cwd: repoRoot, mcpServers: [] });
      const prompt = acp.prompt("Say hi. Do not use tools.", 30_000).catch(() => "");
      const deadline = Date.now() + 25_000;
      while (Date.now() < deadline && !seen.some((b) => b.includes("copy nextCanvas"))) {
        await new Promise((r) => setTimeout(r, 100));
      }
      child.kill("SIGTERM");
      await prompt;
      const main = seen.find((b) => b.includes("copy nextCanvas"));
      assert.ok(main, "a model request carrying the in-app rules");
      assert.match(main, new RegExp(live.model));
      assert.doesNotMatch(main, /Leopoldo Fregoli/);
      assert.doesNotMatch(main, /ready-for-development/);
      assert.doesNotMatch(main, /UNRELATED_SKILL_MARKER/);
      assert.doesNotMatch(main, /unrelated-skill/);
      assert.doesNotMatch(main, /You are an AI agent running in OpenCode/);
      assert.doesNotMatch(main, /synthetic-test-key/);
    } finally {
      if (!child.killed) child.kill("SIGTERM");
      removeOpenCodeHome(home);
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);
