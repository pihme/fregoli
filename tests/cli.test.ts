import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { startKernel, stopKernel } from "../src/kernel.ts";
import { helpText, parseArgs } from "../src/cli.ts";
import { version } from "../src/version.ts";

const root = fileURLToPath(new URL("..", import.meta.url));

function runCli(args: string[]): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["tsx", "src/cli.ts", ...args], {
      cwd: root,
      encoding: "utf8",
    });
    let stdout = "";
    child.stdout?.on("data", (c) => {
      stdout += String(c);
    });
    child.stderr?.on("data", (c) => {
      stdout += String(c);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout }));
  });
}

test("parseArgs", () => {
  assert.equal(parseArgs(["--help"]).help, true);
  assert.equal(parseArgs(["-h"]).help, true);
  assert.equal(parseArgs(["--version"]).version, true);
  assert.equal(parseArgs([]).assistant, false);
});

test("help and version via CLI", async () => {
  const help = await runCli(["--help"]);
  assert.equal(help.code, 0);
  assert.equal(help.stdout, helpText());
  const ver = await runCli(["--version"]);
  assert.equal(ver.code, 0);
  assert.equal(ver.stdout.trim(), version);
});

test("kernel constructs and disposes", async () => {
  const ctx = await startKernel();
  assert.ok(ctx);
  await stopKernel(ctx);
});
