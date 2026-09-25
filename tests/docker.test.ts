import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("Dockerfile exists for inhabitant image", () => {
  assert.equal(existsSync(join(root, "Dockerfile")), true);
});

test("docker build inhabitant image", (t) => {
  const info = spawnSync("docker", ["info"], { encoding: "utf8" });
  if (info.status !== 0) {
    t.skip("docker not available");
    return;
  }
  const r = spawnSync("docker", ["build", "-t", "fregoli:local", "."], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr + r.stdout);
});
