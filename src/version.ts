import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

function fromStamp(): string | undefined {
  try {
    const text = readFileSync(new URL("./RELEASE_VERSION", import.meta.url), "utf8").trim();
    return text || undefined;
  } catch {
    return undefined;
  }
}

function fromGit(): string | undefined {
  try {
    const out = execFileSync(
      "git",
      ["describe", "--tags", "--match", "fregoli/v*", "--dirty"],
      { cwd: packageRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

/** Env override, else the release stamp, else `git describe` when this checkout has a fregoli tag, else `dev`. */
export function versionFrom(
  envValue: string | undefined,
  stamp: string | undefined,
  git: string | undefined,
): string {
  return envValue?.trim() || stamp?.trim() || git?.trim() || "dev";
}

export const version = versionFrom(process.env.FREGOLI_VERSION, fromStamp(), fromGit());
