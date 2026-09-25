import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Context, Plugin } from "cordis";
import { FiberState, Service } from "cordis";
import { runtimePluginsDir } from "./config.ts";

declare module "cordis" {
  interface Context {
    loaderApi: LoaderApi;
  }
}

export class LoaderApi extends Service {
  private files = new Map<string, string>();

  constructor(ctx: Context) {
    super(ctx, "loaderApi");
  }

  async mount(file: string) {
    const resolved = resolvePluginPath(file);
    const fiber = await mountPlugin(this.ctx, resolved);
    const name = fiber.name || file;
    this.files.set(name, resolved);
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
          await fiber.dispose();
          this.files.delete(name);
          return { ok: true, name };
        }
      }
    }
    throw new Error("no plugin named " + name);
  }
}

export const loaderPlugin = {
  name: "loaderApi",
  provide: ["loaderApi"],
  async apply(ctx: Context) {
    await ctx.plugin(LoaderApi);
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
