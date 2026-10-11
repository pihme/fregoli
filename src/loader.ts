import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Context, Plugin } from "cordis";
import { FiberState, Service } from "cordis";
import {
  configPath,
  isShippedPlugin,
  loadConfig,
  runtimePluginsDir,
  saveConfig,
} from "./config.ts";

declare module "cordis" {
  interface Context {
    loaderApi: LoaderApi;
  }
}

export class LoaderApi extends Service {
  appRoot: string | null = null;
  private files = new Map<string, string>();

  constructor(ctx: Context) {
    super(ctx, "loaderApi");
  }

  /** Remember a plugin mounted at boot so a later unload is written to fregoli.json. */
  track(name: string, file: string): void {
    this.files.set(name, file);
  }

  async mount(file: string) {
    const resolved = resolvePluginPath(file, this.appRoot ?? process.cwd());
    const fiber = await mountPlugin(this.ctx, resolved);
    const name = fiber.name || file;
    this.files.set(name, resolved);
    if (isActive(fiber)) this.persistAdd(resolved);
    return { name, state: fiber.state, file: resolved };
  }

  list() {
    const out: Array<{ name: string; state: number; file?: string }> = [];
    for (const rt of this.ctx.registry.values()) {
      for (const fiber of rt.fibers) {
        out.push({
          name: fiber.name,
          state: fiber.state,
          file: this.files.get(fiber.name),
        });
      }
    }
    return out;
  }

  async unload(name: string) {
    for (const rt of this.ctx.registry.values()) {
      for (const fiber of rt.fibers) {
        if (fiber.name === name) {
          const file = this.files.get(name);
          await fiber.dispose();
          this.files.delete(name);
          this.persistRemove(name, file);
          return { ok: true, name };
        }
      }
    }
    throw new Error("no plugin named " + name);
  }

  private persistAdd(file: string): void {
    if (!this.appRoot || isShippedPlugin(this.appRoot, file)) return;
    const key = configPath(this.appRoot, file);
    const cfg = loadConfig(this.appRoot);
    if (cfg.plugins.includes(key)) return;
    cfg.plugins.push(key);
    saveConfig(this.appRoot, cfg);
  }

  private persistRemove(name: string, file?: string): void {
    if (!this.appRoot) return;
    const cfg = loadConfig(this.appRoot);
    let changed = false;
    if (name === "assistant" && cfg.assistant) {
      cfg.assistant = false;
      changed = true;
    }
    if (file && !isShippedPlugin(this.appRoot, file)) {
      const key = configPath(this.appRoot, file);
      const next = cfg.plugins.filter((entry) => entry !== key && entry !== file);
      if (next.length !== cfg.plugins.length) {
        cfg.plugins = next;
        changed = true;
      }
    }
    if (changed) saveConfig(this.appRoot, cfg);
  }
}

export const loaderPlugin = {
  name: "loaderApi",
  provide: ["loaderApi"],
  async apply(ctx: Context, config: { appRoot?: string } = {}) {
    await ctx.plugin(LoaderApi);
    const api = ctx.get("loaderApi") as LoaderApi | undefined;
    if (api && config.appRoot) api.appRoot = config.appRoot;
  },
};

export function resolvePluginPath(file: string, appRoot = process.cwd()): string {
  if (isAbsolute(file)) return file;
  if (file.startsWith("plugins/")) return join(appRoot, file);
  return join(appRoot, runtimePluginsDir, file);
}

export async function importPlugin(file: string): Promise<Plugin> {
  const url = pathToFileURL(file).href + `?t=${Date.now()}`;
  const mod = (await import(url)) as Record<string, unknown>;
  const plugin = (mod.plugin ?? mod.default ?? mod) as Plugin;
  return plugin;
}

export async function mountPlugin(ctx: Context, file: string) {
  const plugin = await importPlugin(file);
  const fiber = await ctx.plugin(plugin);
  await fiber.await();
  return fiber;
}

export function isActive(fiber: { state: FiberState }): boolean {
  return fiber.state === FiberState.ACTIVE;
}
