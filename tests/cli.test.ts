import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { startKernel, stopKernel } from "../src/kernel.ts";
import { helpText, parseArgs } from "../src/cli.ts";
import { version, versionFrom } from "../src/version.ts";

const root = fileURLToPath(new URL("..", import.meta.url));

function runCli(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  command: string[] = ["npx", "tsx", "src/cli.ts"],
): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve, reject) => {
    const [bin, ...binArgs] = command;
    const child = spawn(bin!, [...binArgs, ...args], {
      cwd: root,
      env,
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
  assert.equal(parseArgs(["--host", "0.0.0.0"]).host, "0.0.0.0");
  assert.equal(parseArgs(["--host=127.0.0.1"]).host, "127.0.0.1");
  assert.equal(parseArgs(["--version"]).host, undefined);
});

test("version string prefers the env, then the release stamp, then git", () => {
  assert.equal(versionFrom(" fregoli/v9.9.9 ", "fregoli/v1.2.3", "fregoli/v0.1.0"), "fregoli/v9.9.9");
  assert.equal(versionFrom("  ", "fregoli/v1.2.3", "fregoli/v0.1.0"), "fregoli/v1.2.3");
  assert.equal(versionFrom(undefined, undefined, "fregoli/v0.3.2-dirty"), "fregoli/v0.3.2-dirty");
  assert.equal(versionFrom(undefined, undefined, undefined), "dev");
  const script = readFileSync(fileURLToPath(new URL("../.github/scripts/release.py", import.meta.url)), "utf8");
  assert.match(script, /src\/RELEASE_VERSION/);
});

test("--version follows FREGOLI_VERSION and git describe", async () => {
  const overridden = await runCli(["--version"], { ...process.env, FREGOLI_VERSION: "fregoli/v9.9.9" });
  assert.equal(overridden.code, 0);
  assert.equal(overridden.stdout.trim(), "fregoli/v9.9.9");

  const env = { ...process.env };
  delete env.FREGOLI_VERSION;
  let described = "";
  try {
    described = execFileSync("git", ["describe", "--tags", "--match", "fregoli/v*", "--dirty"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  } catch {
    described = "";
  }
  if (!described) return;
  const fromGit = await runCli(["--version"], env);
  assert.equal(fromGit.code, 0);
  assert.equal(fromGit.stdout.trim(), described);
});

test("bin launcher prints the version without tsx on PATH", async () => {
  const env = { ...process.env, PATH: "/usr/bin:/bin", FREGOLI_VERSION: "fregoli/v9.9.9" };
  const launched = await runCli(["--version"], env, [process.execPath, "bin/fregoli.js"]);
  assert.equal(launched.code, 0);
  assert.equal(launched.stdout.trim(), "fregoli/v9.9.9");
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
