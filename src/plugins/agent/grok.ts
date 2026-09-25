import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import type { Context } from "cordis";

export function whichGrok(): string | null {
  const r = spawnSync("which", ["grok"], { encoding: "utf8" });
  const path = r.stdout.trim();
  return r.status === 0 && path ? path : null;
}

export function spawnAcpAgent(
  ctx: Context,
  opts: { cwd: string; command?: string; args?: string[]; env?: NodeJS.ProcessEnv },
): ChildProcess | null {
  const command = opts.command ?? whichGrok();
  if (!command) return null;
  const args = opts.args ?? ["agent", "--always-approve", "stdio"];
  const child = spawn(command, args, {
    cwd: opts.cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
  });
  ctx.effect(() => {
    return () => {
      if (!child.killed) child.kill("SIGTERM");
    };
  }, "grok.cli");
  return child;
}
