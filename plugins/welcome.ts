import type { Context } from "cordis";

const colors = ["#c4492c", "#e2a322", "#2f6f4e", "#1c4e7a", "#d46a3a", "#8a3a2a", "#f2d48a"];

const bits = Array.from({ length: 72 }, (_, i) => {
  const left = (i * 13.7) % 100;
  const delay = ((i * 0.17) % 4.2).toFixed(2);
  const dur = (3.2 + (i % 6) * 0.35).toFixed(2);
  const w = 7 + (i % 4) * 3;
  const h = i % 3 === 0 ? w : 11 + (i % 5) * 4;
  const color = colors[i % colors.length];
  const radius = i % 4 === 0 ? "50%" : "2px";
  const drift = ((i % 2 === 0 ? 1 : -1) * (14 + (i % 8) * 7)).toFixed(0);
  return `<i style="left:${left.toFixed(2)}%;animation-delay:-${delay}s;animation-duration:${dur}s;width:${w}px;height:${h}px;background:${color};border-radius:${radius};--drift:${drift}px"></i>`;
}).join("");

const welcomeHtml = `<main id="welcome">
  <div class="confetti" aria-hidden="true">${bits}</div>
  <p id="welcome-kicker">Fregoli</p>
  <h1 id="welcome-title">Heureka</h1>
  <p id="welcome-lead">The show is already running. What you see on this canvas changes as plugins load and unload, without restarting the process.</p>
</main>
<style>
#welcome{position:relative;box-sizing:border-box;height:100%;margin:0;overflow:hidden;display:flex;flex-direction:column;justify-content:center;padding:4rem 6vw 8rem;background:#f4f0e6;color:#1c1915}
#welcome-kicker,#welcome-title,#welcome-lead{position:relative;z-index:1}
#welcome-kicker{margin:0 0 .75rem;letter-spacing:.18em;text-transform:uppercase;font-size:.75rem;color:#8a3a2a}
#welcome-title{margin:0;font-size:clamp(3rem,8vw,6rem);font-weight:560;letter-spacing:-.03em;line-height:.95}
#welcome-lead{margin:1.25rem 0 0;max-width:36rem;font-size:1.25rem;line-height:1.45;color:#3f3a34}
.confetti{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.confetti i{position:absolute;top:-8%;display:block;animation-name:fall;animation-timing-function:linear;animation-iteration-count:infinite}
@keyframes fall{0%{transform:translate3d(0,-12vh,0) rotate(0deg)}100%{transform:translate3d(var(--drift),118vh,0) rotate(520deg)}}
@media (prefers-reduced-motion:reduce){.confetti{display:none}}
@media (max-width:720px){#welcome{padding:3rem 1.25rem 38vh}#welcome-title{font-size:clamp(2.6rem,14vw,4rem)}}
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
