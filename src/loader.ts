import { pathToFileURL } from "node:url";
import type { Context, Plugin } from "cordis";
import { FiberState, Service } from "cordis";

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
    const fiber = await mountPlugin(this.ctx, file);
    const name = fiber.name || file;
    this.files.set(name, file);
    return { name, state: fiber.state, file };
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
