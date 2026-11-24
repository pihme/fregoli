import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import type { Context } from "cordis";

/** The ACP child that Fregoli drives. OpenCode replaced Grok CLI (#53). */
export const agentCommand = "opencode";

export function whichOpenCode(): string | null {
  const r = spawnSync("which", [agentCommand], { encoding: "utf8" });
  const path = r.stdout.trim();
  return r.status === 0 && path ? path : null;
}

/**
 * The model endpoint the in-app agent talks to (#54). There is no vendor
 * default: the operator names the base URL and the model, and the key comes
 * from the environment. Without all three the agent plugin keeps its stub.
 */
export type ModelEndpoint = {
  /** OpenAI-compatible base URL, e.g. http://model.hermetarium.test/v1 */
  baseURL: string;
  /** Model id sent to the endpoint, e.g. gpt-6.2-sol */
  model: string;
  /** The key itself. Read from the environment, never from a config file. */
  apiKey: string;
};

export const modelEnv = {
  baseURL: "FREGOLI_MODEL_BASE_URL",
  model: "FREGOLI_MODEL",
  apiKey: "FREGOLI_MODEL_API_KEY",
} as const;

/** Read the endpoint from the environment, or null when any part is missing. */
export function modelEndpointFromEnv(env: NodeJS.ProcessEnv = process.env): ModelEndpoint | null {
  const baseURL = env[modelEnv.baseURL]?.trim();
  const model = env[modelEnv.model]?.trim();
  const apiKey = env[modelEnv.apiKey]?.trim();
  if (!baseURL || !model || !apiKey) return null;
  return { baseURL, model, apiKey };
}

/** Provider id OpenCode uses for our endpoint in its config. */
export const providerId = "fregoli";

/**
 * The OpenCode config that gives the in-app session its slim profile (#36).
 * A custom provider under `body.provider` keeps the key out of the config file
 * and sends it per request as a bearer token.
 */
export function openCodeModelConfig(endpoint: ModelEndpoint): Record<string, unknown> {
  return {
    $schema: "https://opencode.ai/config.json",
    // No unrelated skill catalog in an in-app session.
    permissions: [{ action: "skill", resource: "*", effect: "deny" }],
    providers: {
      [providerId]: {
        name: "Fregoli model",
        package: "@opencode/ai/providers/openai-compatible",
        settings: { baseURL: endpoint.baseURL, apiKey: endpoint.apiKey },
        models: { [endpoint.model]: { name: endpoint.model } },
      },
    },
    model: `${providerId}/${endpoint.model}`,
  };
}

/**
 * Environment for the OpenCode child: Fregoli's own rules as the system
 * prompt, no project AGENTS.md, and the model endpoint when one is configured.
 */
export function openCodeEnv(rules: string, endpoint: ModelEndpoint | null, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    // Keep the app root's AGENTS.md out of the in-app session (#53).
    OPENCODE_DISABLE_PROJECT_CONFIG: "1",
    OPENCODE_CONFIG_CONTENT: JSON.stringify({
      ...(endpoint ? openCodeModelConfig(endpoint) : {}),
      prompt: { system: rules },
    }),
    ...extra,
  };
  return env;
}

export function spawnAcpAgent(
  ctx: Context,
  opts: { cwd: string; command?: string; args?: string[]; env?: NodeJS.ProcessEnv },
): ChildProcess | null {
  const command = opts.command ?? whichOpenCode();
  if (!command) return null;
  const args = opts.args ?? ["acp"];
  const child = spawn(command, args, {
    cwd: opts.cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
  });
  ctx.effect(() => {
    return () => {
      if (!child.killed) child.kill("SIGTERM");
    };
  }, "opencode.cli");
  return child;
}