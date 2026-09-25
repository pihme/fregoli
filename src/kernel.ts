import { Context, type Plugin } from "cordis";

export async function startKernel(plugins: Plugin[] = []): Promise<Context> {
  const ctx = new Context();
  for (const plugin of plugins) {
    await ctx.plugin(plugin);
  }
  return ctx;
}

export async function stopKernel(ctx: Context): Promise<void> {
  await ctx.fiber.dispose();
}
