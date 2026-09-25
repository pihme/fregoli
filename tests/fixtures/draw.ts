import type { Context } from "cordis";

export const plugin = {
  name: "draw",
  inject: ["ui"],
  apply(ctx: Context) {
    ctx.effect(() => {
      ctx.ui.setCanvas('<p id="drawn">hello-canvas</p>');
      return () => ctx.ui.setCanvas("");
    });
  },
};
