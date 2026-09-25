import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Context, Plugin } from "cordis";
import { loadConfig, shippedPluginsDir } from "./config.ts";
import { startKernel } from "./kernel.ts";
import { loaderPlugin, mountPlugin } from "./loader.ts";
import { agentPlugin } from "./plugins/agent/index.ts";
import { assistantPlugin } from "./plugins/assistant/index.ts";
import { webPlugin } from "./plugins/web/index.ts";

export interface BootOptions {
  appRoot?: string;
  port?: number;
  host?: string;
  forceAssistant?: boolean;
  acp?: boolean;
}

export async function boot(options: BootOptions = {}): Promise<Context> {
  const appRoot = options.appRoot ?? process.cwd();
  const cfg = loadConfig(appRoot);
  const plugins: Array<Plugin | [Plugin, unknown]> = [
    [webPlugin, { port: options.port ?? 8080, host: options.host ?? "127.0.0.1" }],
    loaderPlugin,
    [
      agentPlugin,
      {
        appRoot,
        origin: `http://${options.host ?? "127.0.0.1"}:${options.port ?? 8080}`,
        acp: options.acp,
      },
    ],
  ];
  const wantAssistant = options.forceAssistant || cfg.assistant;
  if (wantAssistant) plugins.push(assistantPlugin);
  const ctx = await startKernel(plugins);
  for (const file of listShippedPlugins(appRoot)) {
    await mountPlugin(ctx, file);
  }
  for (const file of cfg.plugins) {
    await mountPlugin(ctx, resolve(appRoot, file));
  }
  return ctx;
}

export function listShippedPlugins(appRoot: string): string[] {
  const dir = join(appRoot, shippedPluginsDir);
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith(".ts"))
      .sort()
      .map((name) => join(dir, name));
  } catch {
    return [];
  }
}
