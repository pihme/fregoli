import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import type { Context } from "cordis";

export function whichGrok(): string | null {
  const r = spawnSync("which", ["grok"], { encoding: "utf8" });
  const path = r.stdout.trim();
  return r.status === 0 && path ? path : null;
}

export function spawnGrok(ctx: Context, cwd: string): ChildProcess | null {
  const bin = whichGrok();
  if (!bin) return null;
  const child = spawn(
    bin,
    ["agent", "--always-approve", "stdio"],
    { cwd, stdio: ["pipe", "pipe", "pipe"] },
  );
  ctx.effect(() => {
    return () => {
      if (!child.killed) child.kill("SIGTERM");
    };
  }, "grok.cli");
  return child;
}
