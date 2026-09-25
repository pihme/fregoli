import { readFileSync } from "node:fs";
import { join } from "node:path";

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
