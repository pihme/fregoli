import { pathToFileURL } from "node:url";
import type { Context, Plugin } from "cordis";
import { FiberState } from "cordis";

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
