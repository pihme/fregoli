import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Context, Plugin } from "cordis";
import { loadConfig, shippedPluginsDir } from "./config.ts";
import { startKernel } from "./kernel.ts";
import { LoaderApi, loaderPlugin, mountPlugin } from "./loader.ts";
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
  const port = options.port ?? 8080;
  const fromEnv = process.env.FREGOLI_HOST?.trim();
  const host = options.host ?? (fromEnv || "127.0.0.1");
  const plugins: Array<Plugin | [Plugin, unknown]> = [
    [webPlugin, { port, host }],
    [loaderPlugin, { appRoot }],
    [
      agentPlugin,
      {
        appRoot,
        // The MCP server always dials loopback, including when HTTP listens on 0.0.0.0.
        origin: `http://127.0.0.1:${port}`,
        acp: options.acp,
      },
    ],
  ];
  const wantAssistant = options.forceAssistant || cfg.assistant;
  if (wantAssistant) plugins.push(assistantPlugin);
  const ctx = await startKernel(plugins);
  const api = ctx.get("loaderApi") as LoaderApi | undefined;
  for (const file of listShippedPlugins(appRoot)) {
    await mountPlugin(ctx, file);
  }
  for (const file of cfg.plugins) {
    const resolved = resolve(appRoot, file);
    const fiber = await mountPlugin(ctx, resolved);
    api?.track(fiber.name || resolved, resolved);
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
