import type { Context } from "cordis";

export const plugin = {
  name: "draw",
  inject: ["ui"],
  apply(ctx: Context) {
    ctx.ui.setCanvas('<p id="drawn">hello-canvas</p>');
  },
};
