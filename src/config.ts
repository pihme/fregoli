import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export const configFileName = "fregoli.json";

export const shippedPluginsDir = "plugins/shipped";
export const runtimePluginsDir = "plugins/runtime";

export interface AppConfig {
  assistant: boolean;
  /** Extra plugin files (usually under plugins/runtime/), relative to app root. */
  plugins: string[];
}

export const defaultConfig: AppConfig = {
  assistant: true,
  plugins: [],
};

/** Path stored in fregoli.json: relative to the app root when the file lives there. */
export function configPath(appRoot: string, file: string): string {
  const rel = relative(resolve(appRoot), resolve(file));
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return resolve(file);
  return rel.split(sep).join("/");
}

export function isShippedPlugin(appRoot: string, file: string): boolean {
  const rel = relative(resolve(appRoot, shippedPluginsDir), resolve(file));
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

export function saveConfig(appRoot: string, cfg: AppConfig): void {
  const body = JSON.stringify({ assistant: cfg.assistant, plugins: cfg.plugins }, null, 2);
  writeFileSync(join(appRoot, configFileName), body + "\n");
}

export function loadConfig(appRoot: string): AppConfig {
  try {
    const raw = readFileSync(join(appRoot, configFileName), "utf8");
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    return {
      assistant: parsed.assistant ?? true,
      plugins: parsed.plugins ?? [],
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ...defaultConfig };
    throw err;
  }
}
