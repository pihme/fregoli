import { Context, type Plugin } from "cordis";

export async function startKernel(
  plugins: Array<Plugin | [Plugin, unknown]> = [],
): Promise<Context> {
  const ctx = new Context();
  for (const item of plugins) {
    if (Array.isArray(item)) {
      await ctx.plugin(item[0], item[1]);
    } else {
      await ctx.plugin(item);
    }
  }
  return ctx;
}

export async function stopKernel(ctx: Context): Promise<void> {
  await ctx.fiber.dispose();
}
