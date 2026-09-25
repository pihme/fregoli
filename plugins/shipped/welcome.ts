import type { Context } from "cordis";

const welcomeHtml = `<main id="welcome">
  <p id="welcome-kicker">Fregoli</p>
  <h1 id="welcome-title">Welcome</h1>
  <p id="welcome-lead">The show is already running. What you see on this canvas changes as plugins load and unload, without restarting the process.</p>
</main>
<style>
#welcome{box-sizing:border-box;height:100%;margin:0;display:flex;flex-direction:column;justify-content:center;padding:4rem 6vw 8rem;background:#f4f0e6;color:#1c1915}
#welcome-kicker{margin:0 0 .75rem;letter-spacing:.18em;text-transform:uppercase;font-size:.75rem;color:#8a3a2a}
#welcome-title{margin:0;font-size:clamp(3rem,8vw,6rem);font-weight:560;letter-spacing:-.03em;line-height:.95}
#welcome-lead{margin:1.25rem 0 0;max-width:36rem;font-size:1.25rem;line-height:1.45;color:#3f3a34}
</style>`;

export const plugin = {
  name: "welcome",
  inject: ["ui"],
  apply(ctx: Context) {
    ctx.effect(() => {
      ctx.ui.setCanvas(welcomeHtml);
      return () => {
        ctx.ui.setCanvas("");
      };
    });
  },
};
