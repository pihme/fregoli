#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));

let tsxCli;
try {
  const pkgJson = require.resolve("tsx/package.json");
  const pkg = require(pkgJson);
  const rel = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.tsx;
  if (!rel) throw new Error("tsx package has no bin");
  tsxCli = join(dirname(pkgJson), rel);
} catch {
  console.error("fregoli: tsx is not installed. From the checkout run npm ci.");
  process.exit(1);
}

const child = spawn(process.execPath, [tsxCli, join(root, "src/cli.ts"), ...process.argv.slice(2)], {
  stdio: "inherit",
});
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
