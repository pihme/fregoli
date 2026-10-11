import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("Dockerfile exists for inhabitant image", () => {
  assert.equal(existsSync(join(root, "Dockerfile")), true);
});

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close();
        reject(new Error("no port"));
        return;
      }
      const port = addr.port;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

test("docker build inhabitant image", async (t) => {
  const info = spawnSync("docker", ["info"], { encoding: "utf8" });
  if (info.status !== 0) {
    t.skip("docker not available");
    return;
  }
  const r = spawnSync(
    "docker",
    ["build", "-t", "fregoli:local", "--build-arg", "FREGOLI_VERSION=fregoli/v9.9.9", "."],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr + r.stdout);

  const version = spawnSync(
    "docker",
    ["run", "--rm", "--entrypoint", "npx", "fregoli:local", "tsx", "src/cli.ts", "--version"],
    { encoding: "utf8" },
  );
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout.trim(), "fregoli/v9.9.9");

  const files = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "--entrypoint",
      "sh",
      "fregoli:local",
      "-c",
      "test -f plugins/shipped/welcome.ts && test -f fregoli.json && test -f .grok/skills/fregoli-app/SKILL.md && test -f LICENSE && test -f THIRD_PARTY_NOTICES.md && test -f src/plugins/assistant/vendor/helferlein.min.js && test -d plugins/runtime && apk info -e iproute2 && apk info -e iptables && ip -V",
    ],
    { encoding: "utf8" },
  );
  assert.equal(files.status, 0, files.stderr + files.stdout);
  assert.match(files.stdout + files.stderr, /iproute2/);

  const port = await freePort();
  const name = "fregoli-test-" + process.pid;
  const up = spawnSync(
    "docker",
    ["run", "-d", "--name", name, "-p", `${port}:8080`, "fregoli:local"],
    { encoding: "utf8" },
  );
  assert.equal(up.status, 0, up.stderr + up.stdout);
  try {
    let body = "";
    for (let i = 0; i < 40; i++) {
      const page = spawnSync("curl", ["-sf", `http://127.0.0.1:${port}/`], { encoding: "utf8" });
      if (page.status === 0) {
        body = page.stdout;
        break;
      }
      spawnSync("sleep", ["0.5"]);
    }
    assert.match(body, /welcome-title/);
    assert.match(body, /helferlein\.min\.js/);
  } finally {
    spawnSync("docker", ["rm", "-f", name], { encoding: "utf8" });
  }
});
