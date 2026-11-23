import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { startKernel, stopKernel } from "../src/kernel.ts";
import { loaderPlugin } from "../src/loader.ts";
import { FREGOLI_RULES, pickAllowOption } from "../src/plugins/agent/acp.ts";
import { agentPlugin } from "../src/plugins/agent/index.ts";
import { openCodeModelConfig, readModelEndpoint } from "../src/plugins/agent/model.ts";
import {
  OPENCODE_AGENT,
  OPENCODE_ARGS,
  findOnPath,
  opencodeConfig,
  opencodeEnv,
  whichOpencode,
} from "../src/plugins/agent/opencode.ts";
import { webPlugin } from "../src/plugins/web/index.ts";

const fakeAcp = fileURLToPath(new URL("./fixtures/fake-acp.ts", import.meta.url));
const drawPlugin = fileURLToPath(new URL("./fixtures/draw.ts", import.meta.url));
const appRoot = process.cwd();

/** A model endpoint for the OpenCode path; nothing listens there and no test calls it. */
const MODEL_ENV = {
  FREGOLI_MODEL_BASE_URL: "http://127.0.0.1:9/v1",
  FREGOLI_MODEL_API_KEY: "test-key-not-real",
  FREGOLI_MODEL_ID: "test-model",
};
const modelConfig = openCodeModelConfig(readModelEndpoint(MODEL_ENV).endpoint!);

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

/** A directory with an `opencode` executable that runs the fake ACP child. */
function fakeOpencodeBin(): string {
  const dir = mkdtempSync(join(tmpdir(), "fregoli-opencode-"));
  const bin = join(dir, "opencode");
  writeFileSync(bin, `#!/bin/sh\nexec "${process.execPath}" --import tsx "${fakeAcp}" "$@"\n`);
  chmodSync(bin, 0o755);
  return dir;
}

async function withEnv<T>(env: Record<string, string>, run: () => Promise<T>): Promise<T> {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  try {
    return await run();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

async function chat(port: number, text: string): Promise<string> {
  const res = await fetch(`http://127.0.0.1:${port}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  assert.equal(res.status, 200);
  return ((await res.json()) as { text: string }).text;
}

function records(file: string): Array<Record<string, unknown>> {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

test("findOnPath finds an executable opencode and nothing in an empty directory", () => {
  const bin = fakeOpencodeBin();
  const empty = mkdtempSync(join(tmpdir(), "fregoli-empty-"));
  try {
    assert.equal(whichOpencode(`${empty}${delimiter}${bin}`), join(bin, "opencode"));
    assert.equal(whichOpencode(empty), null);
    assert.equal(findOnPath("opencode", ""), null);
  } finally {
    rmSync(bin, { recursive: true, force: true });
    rmSync(empty, { recursive: true, force: true });
  }
});

test("the in-app OpenCode profile uses Fregoli's prompt, no skills and no project config", () => {
  const cfg = opencodeConfig() as {
    default_agent: string;
    agent: Record<string, { mode: string; prompt: string; permission: { skill: Record<string, string> } }>;
  };
  assert.equal(cfg.default_agent, OPENCODE_AGENT);
  const agent = cfg.agent[OPENCODE_AGENT]!;
  assert.equal(agent.mode, "primary");
  assert.equal(agent.prompt, FREGOLI_RULES);
  assert.deepEqual(agent.permission.skill, { "*": "deny" });
  const env = opencodeEnv();
  assert.equal(env.OPENCODE_DISABLE_PROJECT_CONFIG, "1");
  assert.deepEqual(JSON.parse(env.OPENCODE_CONFIG_CONTENT!), cfg);
  assert.equal(JSON.stringify(cfg).includes("apiKey"), false);
  assert.deepEqual(OPENCODE_ARGS, ["acp"]);
});

test("one OPENCODE_CONFIG_CONTENT carries both the slim profile and the model provider", () => {
  const env = opencodeEnv(modelConfig);
  assert.equal(env.OPENCODE_DISABLE_PROJECT_CONFIG, "1");
  const cfg = JSON.parse(env.OPENCODE_CONFIG_CONTENT!) as Record<string, unknown> & {
    agent: Record<string, { prompt: string; permission: { skill: Record<string, string> } }>;
  };
  // Slim profile
  assert.equal(cfg.default_agent, OPENCODE_AGENT);
  assert.equal(cfg.agent[OPENCODE_AGENT]!.prompt, FREGOLI_RULES);
  assert.deepEqual(cfg.agent[OPENCODE_AGENT]!.permission.skill, { "*": "deny" });
  // Model provider
  assert.equal(cfg.model, modelConfig.model);
  assert.equal(cfg.model, "fregoli/test-model");
  assert.deepEqual(cfg.provider, modelConfig.provider);
  assert.equal(
    (cfg.provider as Record<string, { options: { baseURL: string } }>).fregoli!.options.baseURL,
    MODEL_ENV.FREGOLI_MODEL_BASE_URL,
  );
  // Names the key variable, never the key
  assert.equal(env.OPENCODE_CONFIG_CONTENT!.includes(MODEL_ENV.FREGOLI_MODEL_API_KEY), false);
  assert.ok(env.OPENCODE_CONFIG_CONTENT!.includes("{env:FREGOLI_MODEL_API_KEY}"));
});

test("a permission request picks the agent's allow-always option", () => {
  const options = [
    { optionId: "once", kind: "allow_once" },
    { optionId: "always", kind: "allow_always" },
    { optionId: "reject", kind: "reject_once" },
  ];
  assert.equal(pickAllowOption(options), "always");
  assert.equal(pickAllowOption([options[0], options[2]]), "once");
});

test("chat stub when opencode is not on PATH", async () => {
  const empty = mkdtempSync(join(tmpdir(), "fregoli-empty-"));
  try {
    await withEnv({ PATH: empty }, async () => {
      const ctx = await startKernel([[agentPlugin, { appRoot }]]);
      try {
        assert.equal(ctx.chat.child, null);
        assert.equal(ctx.chat.acp, null);
        assert.equal(await ctx.chat.reply("hi"), "stub: hi");
      } finally {
        await stopKernel(ctx);
      }
    });
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test("chat stub when opencode is on PATH but no model endpoint is set", async () => {
  const bin = fakeOpencodeBin();
  const record = join(bin, "record.jsonl");
  const warn = console.warn;
  console.warn = () => {};
  try {
    await withEnv(
      {
        PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
        FAKE_ACP_RECORD: record,
        FREGOLI_MODEL_BASE_URL: "",
        FREGOLI_MODEL_API_KEY: "",
        FREGOLI_MODEL_ID: "",
      },
      async () => {
        const ctx = await startKernel([[agentPlugin, { appRoot }]]);
        try {
          assert.equal(ctx.chat.child, null);
          assert.equal(await ctx.chat.reply("hi"), "stub: hi");
        } finally {
          await stopKernel(ctx);
        }
      },
    );
    // OpenCode was never started.
    assert.throws(() => readFileSync(record, "utf8"));
  } finally {
    console.warn = warn;
    rmSync(bin, { recursive: true, force: true });
  }
});

test("chat stub when the agent is switched off", async () => {
  const ctx = await startKernel([[agentPlugin, { acp: false }]]);
  try {
    assert.equal(await ctx.chat.reply("hi"), "stub: hi");
  } finally {
    await stopKernel(ctx);
  }
});

test("opencode on PATH runs as `opencode acp` with the slim profile and one session", async () => {
  const bin = fakeOpencodeBin();
  const record = join(bin, "record.jsonl");
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  try {
    await withEnv(
      { ...MODEL_ENV, PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`, FAKE_ACP_RECORD: record },
      async () => {
      const ctx = await startKernel([
        [webPlugin, { port, host: "127.0.0.1" }],
        loaderPlugin,
        [agentPlugin, { appRoot, origin }],
      ]);
      try {
        assert.ok(ctx.chat.child);
        assert.equal(await chat(port, "one"), "acp:one");
        // A page load in between does not start a new ACP session.
        assert.equal((await fetch(`${origin}/`)).status, 200);
        assert.equal(await chat(port, "two"), "acp:two");
        assert.equal(await chat(port, "permission"), "permission:always");
      } finally {
        await stopKernel(ctx);
      }
      },
    );
    const events = records(record);
    const spawned = events.filter((e) => e.event === "spawn");
    assert.equal(spawned.length, 1);
    const spawn = spawned[0] as { argv: string[]; cwd: string; env: Record<string, string | null> };
    assert.deepEqual(spawn.argv, ["acp"]);
    assert.equal(spawn.cwd, appRoot);
    assert.deepEqual(spawn.env, opencodeEnv(modelConfig));
    const sessions = events.filter((e) => e.event === "session/new");
    assert.equal(sessions.length, 1);
    const params = sessions[0]!.params as {
      cwd: string;
      mcpServers: Array<{ name: string; env: Array<{ name: string; value: string }> }>;
    };
    assert.equal(params.cwd, appRoot);
    assert.equal(params.mcpServers.length, 1);
    assert.equal(params.mcpServers[0]!.name, "fregoli");
    assert.ok(params.mcpServers[0]!.env.some((e) => e.name === "FREGOLI_URL" && e.value === origin));
    const prompts = events.filter((e) => e.event === "session/prompt");
    assert.deepEqual(
      prompts.map((p) => [p.text, p.sessionId, p.sessions]),
      [
        ["one", "s1", 1],
        ["two", "s1", 1],
        ["permission", "s1", 1],
      ],
    );
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
});

test("page-bridge MCP tools from session/new work from chat turns", async () => {
  const bin = fakeOpencodeBin();
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  try {
    await withEnv({ ...MODEL_ENV, PATH: `${bin}${delimiter}${process.env.PATH ?? ""}` }, async () => {
      const ctx = await startKernel([
        [webPlugin, { port, host: "127.0.0.1" }],
        loaderPlugin,
        [agentPlugin, { appRoot, origin }],
      ]);
      try {
        const list = await chat(port, "mcp tools/list");
        const names = (JSON.parse(list.slice(4)) as { tools: Array<{ name: string }> }).tools.map((t) => t.name);
        for (const name of [
          "observe_page",
          "highlight",
          "wait_click",
          "load_plugin",
          "unload_plugin",
          "reload_page",
          "list_plugins",
        ]) {
          assert.ok(names.includes(name), name);
        }
        const loaded = await chat(port, `mcp load_plugin ${JSON.stringify({ file: drawPlugin })}`);
        assert.match(loaded, /\\"ok\\":true/);
        assert.match(await chat(port, "mcp list_plugins {}"), /draw/);
        await fetch(`${origin}/bridge`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            tabId: "t1",
            html: "<html id=live>",
            url: `${origin}/`,
            viewport: { width: 1, height: 1 },
            focused: null,
          }),
        });
        const reload = await chat(port, "mcp reload_page {}");
        assert.match(reload, /reload held/);
        const observed = await chat(port, "mcp observe_page {}");
        assert.match(observed, /hello-canvas/);
        const lit = await chat(port, `mcp highlight ${JSON.stringify({ selector: "#drawn" })}`);
        assert.match(lit, /ok/);
        const unloaded = await chat(port, `mcp unload_plugin ${JSON.stringify({ name: "draw" })}`);
        assert.doesNotMatch(unloaded, /error/);
        const after = await chat(port, "mcp observe_page {}");
        assert.doesNotMatch(after, /hello-canvas/);
      } finally {
        await stopKernel(ctx);
      }
    });
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
});
