import { spawn, type ChildProcess } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import type { Context } from "cordis";
import { FREGOLI_RULES } from "./acp.ts";

/** Name of the OpenCode agent that Fregoli's in-app session runs as. */
export const OPENCODE_AGENT = "fregoli";

/** Default ACP child: `opencode acp` speaks ACP over stdio. */
export const OPENCODE_ARGS = ["acp"];

/** First executable `name` on `pathEnv` (default `PATH`), or null. */
export function findOnPath(name: string, pathEnv = process.env.PATH ?? ""): string | null {
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    const file = join(dir, name);
    try {
      accessSync(file, constants.X_OK);
      return file;
    } catch {
      /* not here */
    }
  }
  return null;
}

export function whichOpencode(pathEnv?: string): string | null {
  return findOnPath("opencode", pathEnv);
}

/**
 * Slim profile for the in-app session (#36, #53): Fregoli's own system prompt as the
 * primary agent, and no skill catalog. Passed inline through `OPENCODE_CONFIG_CONTENT`.
 */
export function opencodeConfig(): Record<string, unknown> {
  return {
    $schema: "https://opencode.ai/config.json",
    default_agent: OPENCODE_AGENT,
    agent: {
      [OPENCODE_AGENT]: {
        mode: "primary",
        description: "Fregoli in-app agent: changes the running app through the page-bridge MCP tools.",
        prompt: FREGOLI_RULES,
        permission: { skill: { "*": "deny" } },
      },
    },
  };
}

/**
 * Environment for the OpenCode child. One `OPENCODE_CONFIG_CONTENT` carries the slim profile
 * and, when the operator named an endpoint, the model provider (`openCodeModelConfig` in
 * `model.ts`): `{ ...opencodeConfig(), ...model }`. The two share no top-level key except
 * `$schema`. `OPENCODE_DISABLE_PROJECT_CONFIG` keeps the app root's `AGENTS.md` and project
 * `opencode.json` out of the in-app session.
 */
export function opencodeEnv(model: Record<string, unknown> = {}): Record<string, string> {
  return {
    OPENCODE_CONFIG_CONTENT: JSON.stringify({ ...opencodeConfig(), ...model }),
    OPENCODE_DISABLE_PROJECT_CONFIG: "1",
  };
}

export function spawnAcpAgent(
  ctx: Context,
  opts: {
    cwd: string;
    command?: string;
    args?: string[];
    env?: NodeJS.ProcessEnv;
    /** Model part of the OpenCode config (`openCodeModelConfig`), merged into the slim profile. */
    model?: Record<string, unknown>;
  },
): ChildProcess | null {
  const command = opts.command ?? whichOpencode();
  if (!command) return null;
  const args = opts.args ?? OPENCODE_ARGS;
  const child = spawn(command, args, {
    cwd: opts.cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...opts.env, ...opencodeEnv(opts.model) },
  });
  child.stderr?.resume();
  ctx.effect(() => {
    return () => {
      if (!child.killed) child.kill("SIGTERM");
    };
  }, "opencode.acp");
  return child;
}
