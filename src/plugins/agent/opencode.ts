import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import type { Context } from "cordis";

/** The ACP child that Fregoli drives. OpenCode 2 replaced Grok CLI. */
export const agentCommand = "opencode";

/** ACP args for OpenCode 2. The v1 TUI command is not used. */
export const agentArgs = ["acp"] as const;

export function whichOpenCode(): string | null {
  const r = spawnSync("which", [agentCommand], { encoding: "utf8" });
  const path = r.stdout.trim();
  return r.status === 0 && path ? path : null;
}

/**
 * The model endpoint the in-app agent talks to. There is no vendor default:
 * the operator names the base URL and the model, and the key comes from the
 * environment. Without all three the agent does not start a child.
 */
export type ModelEndpoint = {
  /** OpenAI-compatible base URL, for example http://model.hermetarium.test/v1 */
  baseURL: string;
  /** Model id the endpoint expects. A slash is allowed; OpenCode keeps it after the provider id. */
  model: string;
  /** The key itself. Read from the environment, never from a committed file. */
  apiKey: string;
};

export const modelEnv = {
  baseURL: "FREGOLI_MODEL_BASE_URL",
  model: "FREGOLI_MODEL",
  apiKey: "FREGOLI_MODEL_API_KEY",
} as const;

export const missingModelEndpoint =
  "Set FREGOLI_MODEL_BASE_URL, FREGOLI_MODEL, and FREGOLI_MODEL_API_KEY.";

/** Read the endpoint from the environment, or null when any part is missing. */
export function modelEndpointFromEnv(env: NodeJS.ProcessEnv = process.env): ModelEndpoint | null {
  const baseURL = env[modelEnv.baseURL]?.trim();
  const model = env[modelEnv.model]?.trim();
  const apiKey = env[modelEnv.apiKey]?.trim();
  if (!baseURL || !model || !apiKey) return null;
  return { baseURL, model, apiKey };
}

/** Provider id and primary agent id inside the OpenCode 2 config. */
export const providerId = "fregoli";
export const agentId = "fregoli";

export type AgentLaunch = "spawn" | "stub" | "blocked";

/**
 * `command` is a test stand-in. Otherwise a missing binary is the stub, and a
 * missing endpoint is a clear refusal rather than a vendor default.
 */
export function agentLaunch(
  command: string | undefined,
  binary: string | null,
  endpoint: ModelEndpoint | null,
): AgentLaunch {
  if (command) return "spawn";
  if (!binary) return "stub";
  if (!endpoint) return "blocked";
  return "spawn";
}

/**
 * OpenCode 2 config for the in-app session.
 * `agents.<id>.system` replaces the harness prompt. The v1 `prompt` field does not.
 * `skill.use` denied for `*` drops the skill catalog. Other providers are denied
 * so a key already in the environment cannot select a vendor.
 */
export function openCodeConfig(rules: string, endpoint: ModelEndpoint): Record<string, unknown> {
  return {
    $schema: "https://opencode.ai/config.json",
    model: `${providerId}/${endpoint.model}`,
    default_agent: agentId,
    agents: {
      [agentId]: {
        mode: "primary",
        description: "Fregoli in-app agent",
        system: rules,
      },
    },
    permissions: [{ action: "skill", resource: "*", effect: "deny" }],
    policies: [
      { action: "provider.use", resource: "*", effect: "deny" },
      { action: "provider.use", resource: providerId, effect: "allow" },
      { action: "skill.use", resource: "*", effect: "deny" },
    ],
    providers: {
      [providerId]: {
        name: "Fregoli",
        env: [modelEnv.apiKey],
        package: "@opencode/ai/providers/openai-compatible",
        settings: {
          baseURL: endpoint.baseURL,
          apiKey: `{env:${modelEnv.apiKey}}`,
        },
        models: { [endpoint.model]: { name: endpoint.model } },
      },
    },
  };
}

/** Empty config dirs for one process. OpenCode 2 reads global config from XDG, not only from the project. */
export function makeOpenCodeHome(): string {
  const home = mkdtempSync(join(tmpdir(), "fregoli-opencode-"));
  for (const name of ["config", "data", "cache", "state"]) {
    mkdirSync(join(home, name), { recursive: true });
  }
  return home;
}

export function removeOpenCodeHome(home: string): void {
  rmSync(home, { recursive: true, force: true });
}

/**
 * Environment for one OpenCode 2 child.
 * Project AGENTS.md is skipped (`OPENCODE_DISABLE_PROJECT_CONFIG`), and the
 * operator's global OpenCode config is not visible because XDG points at `home`.
 * The API key stays in the environment; the config only names that variable.
 */
export function openCodeChildEnv(
  rules: string,
  endpoint: ModelEndpoint,
  home: string,
  extra: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  delete env.OPENCODE_CONFIG;
  delete env.OPENCODE_CONFIG_DIR;
  delete env.OPENCODE_CONFIG_CONTENT;
  env.OPENCODE_DISABLE_PROJECT_CONFIG = "1";
  env.OPENCODE_DISABLE_CLAUDE_CODE = "1";
  env.OPENCODE_DISABLE_AUTOUPDATE = "1";
  env.OPENCODE_DISABLE_MODELS_FETCH = "1";
  env.XDG_CONFIG_HOME = join(home, "config");
  env.XDG_DATA_HOME = join(home, "data");
  env.XDG_CACHE_HOME = join(home, "cache");
  env.XDG_STATE_HOME = join(home, "state");
  env.OPENCODE_CONFIG_CONTENT = JSON.stringify(openCodeConfig(rules, endpoint));
  env[modelEnv.apiKey] = endpoint.apiKey;
  return env;
}

export function spawnAcpAgent(
  ctx: Context,
  opts: { cwd: string; command?: string; args?: string[]; env?: NodeJS.ProcessEnv },
): ChildProcess | null {
  const command = opts.command ?? whichOpenCode();
  if (!command) return null;
  const args = opts.args ?? [...agentArgs];
  const child = spawn(command, args, {
    cwd: opts.cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: opts.env ?? process.env,
  });
  ctx.effect(() => {
    return () => {
      if (!child.killed) child.kill("SIGTERM");
    };
  }, "opencode.cli");
  return child;
}
