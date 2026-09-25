import type { Context } from "cordis";

export const assistantPlugin = {
  name: "assistant",
  inject: ["ui"],
  provide: ["assistantUi"],
  apply(ctx: Context): void {
  ctx.ui.setAssistant(`<button type="button" id="assistant-control" aria-expanded="false" aria-controls="assistant-panel">Assistant</button>
<div id="assistant-panel" hidden>
  <div id="assistant-log"></div>
  <form id="assistant-form">
    <input id="assistant-input" name="message" autocomplete="off">
    <button type="submit">Send</button>
  </form>
</div>
<script>
(() => {
  const btn = document.getElementById('assistant-control');
  const panel = document.getElementById('assistant-panel');
  btn.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  });
  document.getElementById('assistant-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('assistant-input');
    const text = input.value;
    input.value = '';
    const log = document.getElementById('assistant-log');
    log.textContent += 'you: ' + text + '\\n';
    const res = await fetch('/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
    const data = await res.json().catch(() => ({ text: '' }));
    log.textContent += 'agent: ' + (data.text || '(no reply)') + '\\n';
  });
})();
</script>`);
  },
};
