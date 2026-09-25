import { readFileSync } from "node:fs";
import { join } from "node:path";

export const configFileName = "fregoli.json";

export interface AppConfig {
  assistant: boolean;
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
