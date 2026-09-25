import type { Context } from "cordis";

const colors = ["#ffe08a", "#ff7a59", "#f4efe6", "#7dcea0", "#f2c14e", "#e85d4c", "#9ad1d4"];

const bits = Array.from({ length: 64 }, (_, i) => {
  const left = (i * 13.7) % 100;
  const delay = ((i * 0.19) % 4.5).toFixed(2);
  const dur = (3.1 + (i % 6) * 0.38).toFixed(2);
  const w = 7 + (i % 4) * 3;
  const h = i % 3 === 0 ? w : 12 + (i % 5) * 4;
  const color = colors[i % colors.length];
  const radius = i % 4 === 0 ? "50%" : "2px";
  const drift = ((i % 2 === 0 ? 1 : -1) * (16 + (i % 8) * 8)).toFixed(0);
  return `<i style="left:${left.toFixed(2)}%;animation-delay:-${delay}s;animation-duration:${dur}s;width:${w}px;height:${h}px;background:${color};border-radius:${radius};--drift:${drift}px"></i>`;
}).join("");

const html = `<main id="hello">
  <div class="confetti" aria-hidden="true">${bits}</div>
  <p id="hello-line">hello world</p>
  <h1 id="heureka">Heureka</h1>
</main>
<style>
#hello{position:relative;box-sizing:border-box;height:100%;margin:0;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.35rem;padding:8vh 8vw 22vh;background:radial-gradient(ellipse at 50% 42%,#3c2618 0%,#16110e 62%);color:#f4efe6;text-align:center}
#hello-line{position:relative;z-index:1;margin:0;font-size:clamp(3.2rem,9vw,7.5rem);font-weight:760;letter-spacing:-.045em;line-height:.9}
#heureka{position:relative;z-index:1;margin:0;font-family:Georgia,"Iowan Old Style",Palatino,serif;font-style:italic;font-weight:560;font-size:clamp(4.2rem,14vw,11rem);letter-spacing:-.03em;line-height:.88;background:linear-gradient(100deg,#ffe08a 0%,#ff7a59 58%,#fff6d8 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.confetti{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.confetti i{position:absolute;top:-8%;display:block;animation-name:fall;animation-timing-function:linear;animation-iteration-count:infinite}
@keyframes fall{0%{transform:translate3d(0,-12vh,0) rotate(0deg)}100%{transform:translate3d(var(--drift),118vh,0) rotate(520deg)}}
@media (prefers-reduced-motion:reduce){.confetti{display:none}}
@media (max-width:720px){#hello{padding:10vh 1.25rem 38vh}#hello-line{font-size:clamp(2.6rem,14vw,4rem)}#heureka{font-size:clamp(3.4rem,18vw,5.5rem)}}
</style>`;

export const plugin = {
  name: "heureka",
  inject: ["ui"],
  apply(ctx: Context) {
    ctx.effect(() => {
      ctx.ui.setCanvas(html);
      return () => ctx.ui.setCanvas("");
    });
  },
};
