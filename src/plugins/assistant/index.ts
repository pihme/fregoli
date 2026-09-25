import type { Context } from "cordis";

export const assistantPlugin = {
  name: "assistant",
  inject: ["ui"],
  provide: ["assistantUi"],
  apply(ctx: Context): void {
    ctx.ui.setAssistant(`<style>
#assistant-control{
  position:fixed;right:1.5rem;bottom:1.5rem;z-index:30;
  width:3.25rem;height:3.25rem;border:0;border-radius:999px;
  background:#111;color:#fff;font:600 13px/1 system-ui,sans-serif;
  cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.25);
}
#assistant-panel{
  display:none;position:fixed;right:0;bottom:0;z-index:25;
  width:min(50vw,32rem);height:50vh;min-width:20rem;
  background:#fff;color:#111;
  box-shadow:-12px -12px 48px rgba(0,0,0,.18);
  flex-direction:column;
}
body.assistant-open #assistant-panel{display:flex}
#assistant-header{
  display:flex;align-items:center;justify-content:space-between;
  padding:.75rem 1rem;border-bottom:1px solid #eee;font-weight:600;
}
#assistant-thread{
  flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:.65rem;
  padding:1rem;background:#fafafa;
}
.msg{max-width:80%;padding:.65rem .9rem;border-radius:1.1rem;white-space:pre-wrap;word-break:break-word;line-height:1.4}
.msg-user{align-self:flex-end;background:#0d6efd;color:#fff;border-bottom-right-radius:.3rem}
.msg-agent{align-self:flex-start;background:#fff;border:1px solid #e6e6e6;border-bottom-left-radius:.3rem}
.msg-status{align-self:flex-start;color:#666;font-style:italic;background:transparent;padding:.25rem .5rem}
#assistant-form{display:flex;gap:.5rem;padding:.75rem;border-top:1px solid #eee;background:#fff}
#assistant-input{flex:1;border:1px solid #ddd;border-radius:.75rem;padding:.55rem .75rem;font:inherit}
#assistant-form button{border:0;border-radius:.75rem;background:#111;color:#fff;padding:.55rem .9rem;cursor:pointer}
#assistant-form button:disabled{opacity:.5;cursor:wait}
</style>
<button type="button" id="assistant-control" aria-expanded="false" aria-controls="assistant-panel" title="Assistant">AI</button>
<div id="assistant-panel" role="dialog" aria-label="Fregoli assistant">
  <div id="assistant-header">
    <span>Assistant</span>
    <button type="button" id="assistant-close" aria-label="Close">×</button>
  </div>
  <div id="assistant-thread"></div>
  <form id="assistant-form">
    <input id="assistant-input" name="message" autocomplete="off" placeholder="Message">
    <button type="submit" id="assistant-send">Send</button>
  </form>
</div>
<script>
(() => {
  const btn = document.getElementById('assistant-control');
  const panel = document.getElementById('assistant-panel');
  const close = document.getElementById('assistant-close');
  const thread = document.getElementById('assistant-thread');
  const form = document.getElementById('assistant-form');
  const input = document.getElementById('assistant-input');
  const send = document.getElementById('assistant-send');
  const KEY = 'fregoli-assistant';
  const setOpen = (open) => {
    document.body.classList.toggle('assistant-open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.hidden = open;
    save();
    if (open) input.focus();
  };
  function save() {
    const messages = [...thread.querySelectorAll('.msg-user,.msg-agent')].map((el) => ({
      role: el.classList.contains('msg-user') ? 'user' : 'agent',
      text: el.textContent,
    }));
    sessionStorage.setItem(KEY, JSON.stringify({
      open: document.body.classList.contains('assistant-open'),
      messages,
    }));
  }
  btn.addEventListener('click', () => setOpen(true));
  close.addEventListener('click', () => setOpen(false));
  function bubble(role, text) {
    const el = document.createElement('div');
    el.className = 'msg msg-' + role;
    el.textContent = text;
    thread.appendChild(el);
    thread.scrollTop = thread.scrollHeight;
    if (role === 'user' || role === 'agent') save();
    return el;
  }
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (saved && Array.isArray(saved.messages)) {
      for (const m of saved.messages) bubble(m.role, m.text);
      if (saved.open) setOpen(true);
    }
  } catch (e) {}
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || send.disabled) return;
    input.value = '';
    bubble('user', text);
    send.disabled = true;
    const started = Date.now();
    const status = bubble('status', 'Working… talking to Grok (can take a minute)');
    const tick = setInterval(() => {
      const s = Math.round((Date.now() - started) / 1000);
      status.textContent = 'Working… ' + s + 's (Grok is running; wait for a reply)';
    }, 1000);
    try {
      const res = await fetch('/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({ text: '' }));
      status.remove();
      const reply = data.text || '(no reply)';
      bubble('agent', reply);
    } catch (err) {
      status.remove();
      bubble('status', 'Request failed: ' + err);
    } finally {
      clearInterval(tick);
      send.disabled = false;
      input.focus();
    }
  });
})();
</script>`);
  },
};
