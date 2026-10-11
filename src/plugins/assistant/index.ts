import type { Context } from "cordis";

export const assistantPlugin = {
  name: "assistant",
  inject: ["ui"],
  provide: ["assistantUi"],
  apply(ctx: Context): void {
    ctx.ui.setAssistant(`<style>
#assistant-slot{
  --dock:1.25rem;
  --chat-w:min(32rem, calc(100vw - 2 * var(--dock)));
  --chat-h:min(50vh, 440px);
  --mesh-pad:.2;
}
#assistant-control{
  position:fixed; z-index:30; right:var(--dock); bottom:var(--dock);
  width:min(330px, calc(100vw - 2 * var(--dock)));
  height:min(390px, 52vh);
  margin:0; padding:0; border:0; background:transparent; cursor:pointer;
}
#assistant-control .assistant-fallback{
  position:absolute; right:0; bottom:0;
  width:3.25rem; height:3.25rem; border-radius:999px;
  display:grid; place-items:center;
  background:#111; color:#fff; font:600 13px/1 system-ui,sans-serif;
  box-shadow:0 8px 24px rgba(0,0,0,.25);
}
#assistant-control.helferlein-ready .assistant-fallback{display:none}
body.assistant-open #assistant-slot #assistant-control{
  --open-h:calc(100vh - var(--dock) - var(--chat-h) - 16px);
  --fit:.66;
  --mesh-gap:calc(var(--mesh-pad) * var(--fit) * var(--open-h) + 16px);
  --drop:calc(var(--mesh-gap) * .7);
  z-index:20; cursor:default; pointer-events:none;
  top:calc((1 - var(--fit)) * var(--open-h) + var(--drop));
  right:calc(var(--dock) + (1 - var(--fit)) / 2 * var(--chat-w));
  bottom:calc(var(--dock) + var(--chat-h) + 16px - var(--drop));
  left:auto;
  width:calc(var(--chat-w) * var(--fit));
  height:auto;
}
#assistant-panel{
  display:none; position:fixed; right:var(--dock); bottom:var(--dock); z-index:25;
  width:var(--chat-w); height:var(--chat-h); min-width:16rem;
  background:#fff; color:#111; border-radius:22px; overflow:hidden;
  box-shadow:0 18px 50px rgba(20,24,32,.22);
  flex-direction:column;
}
body.assistant-open #assistant-panel{display:flex}
#assistant-header{
  display:flex; align-items:center; justify-content:space-between;
  padding:.75rem 1rem; border-bottom:1px solid #eee; font-weight:600;
}
#assistant-thread{
  flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:.65rem;
  padding:1rem; background:#fafafa;
}
.msg{max-width:80%; padding:.65rem .9rem; border-radius:1.1rem; white-space:pre-wrap; word-break:break-word; line-height:1.4}
.msg-user{align-self:flex-end; background:#0d6efd; color:#fff; border-bottom-right-radius:.3rem}
.msg-agent{align-self:flex-start; background:#fff; border:1px solid #e6e6e6; border-bottom-left-radius:.3rem}
.msg-status{align-self:flex-start; color:#666; font-style:italic; background:transparent; padding:.25rem .5rem}
#assistant-form{display:flex; gap:.5rem; padding:.75rem; border-top:1px solid #eee; background:#fff}
#assistant-input{flex:1; border:1px solid #ddd; border-radius:.75rem; padding:.55rem .75rem; font:inherit}
#assistant-form button{border:0; border-radius:.75rem; background:#111; color:#fff; padding:.55rem .9rem; cursor:pointer}
#assistant-form button:disabled{opacity:.5; cursor:wait}
#assistant-close{border:0; background:transparent; color:#111; font:1.4rem/1 system-ui,sans-serif; cursor:pointer}
</style>
<script src="/helferlein.min.js"></script>
<div id="assistant-control" class="assistant-hit" role="button" tabindex="0" aria-expanded="false" aria-controls="assistant-panel" aria-label="Assistant" title="Assistant">
  <span class="assistant-fallback">AI</span>
</div>
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
  const stage = document.getElementById('assistant-control');
  const panel = document.getElementById('assistant-panel');
  const close = document.getElementById('assistant-close');
  const thread = document.getElementById('assistant-thread');
  const form = document.getElementById('assistant-form');
  const input = document.getElementById('assistant-input');
  const send = document.getElementById('assistant-send');
  const KEY = 'fregoli-assistant';
  const BLOB_KEY = 'fregoli-helferlein';
  const SPIN_KEY = 'fregoli-helferlein-spin';
  let figure = null;
  let pluginsSeen = '';
  let working = false;
  try {
    if (window.Helferlein) {
      figure = window.Helferlein.mount(stage);
      stage.classList.add('helferlein-ready');
      const saved = localStorage.getItem(BLOB_KEY);
      if (saved) {
        try { figure.setBlob(JSON.parse(saved)); }
        catch (e) { localStorage.removeItem(BLOB_KEY); }
      }
    }
  } catch (e) {}
  function saveBlob() {
    if (!figure) return;
    try { localStorage.setItem(BLOB_KEY, JSON.stringify(figure.getBlob())); }
    catch (e) {}
  }
  function save() {
    const messages = [].slice.call(thread.querySelectorAll('.msg-user,.msg-agent')).map((el) => ({
      role: el.classList.contains('msg-user') ? 'user' : 'agent',
      text: el.textContent,
    }));
    sessionStorage.setItem(KEY, JSON.stringify({
      boot: window.FREGOLI_BOOT,
      open: document.body.classList.contains('assistant-open'),
      messages,
    }));
  }
  function setOpen(open) {
    document.body.classList.toggle('assistant-open', open);
    stage.setAttribute('aria-expanded', String(open));
    if (open) {
      stage.removeAttribute('role');
      stage.tabIndex = -1;
      if (figure) figure.summon();
      input.focus();
    } else {
      stage.setAttribute('role', 'button');
      stage.tabIndex = 0;
      if (figure) figure.dismiss();
      saveBlob();
    }
    save();
  }
  stage.addEventListener('click', () => {
    if (!document.body.classList.contains('assistant-open')) setOpen(true);
  });
  stage.addEventListener('keydown', (e) => {
    if (document.body.classList.contains('assistant-open')) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  });
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
  function pluginStamp() {
    return fetch('/plugins').then((res) => res.text()).catch(() => '');
  }
  pluginStamp().then((text) => { pluginsSeen = text; });
  window.addEventListener('beforeunload', () => {
    if (working) sessionStorage.setItem(SPIN_KEY, window.FREGOLI_BOOT || '');
  });
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (saved && saved.boot === window.FREGOLI_BOOT && Array.isArray(saved.messages)) {
      for (const m of saved.messages) bubble(m.role, m.text);
      if (saved.open) setOpen(true);
    } else {
      sessionStorage.removeItem(KEY);
    }
  } catch (e) {}
  const spin = sessionStorage.getItem(SPIN_KEY);
  sessionStorage.removeItem(SPIN_KEY);
  if (spin && spin === window.FREGOLI_BOOT && figure) {
    if (!document.body.classList.contains('assistant-open')) setOpen(true);
    figure.working();
    Promise.resolve(figure.applied()).then(() => {
      saveBlob();
      figure.idle();
    }).catch(() => {});
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || send.disabled) return;
    input.value = '';
    bubble('user', text);
    send.disabled = true;
    working = true;
    if (figure) figure.working();
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
      const next = await pluginStamp();
      if (figure && next !== pluginsSeen) {
        pluginsSeen = next;
        await figure.applied();
        saveBlob();
      } else if (figure) {
        figure.idle();
      }
    } catch (err) {
      status.remove();
      bubble('status', 'Request failed: ' + err);
      if (figure) figure.idle();
    } finally {
      working = false;
      clearInterval(tick);
      send.disabled = false;
      input.focus();
    }
  });
})();
</script>`);
  },
};
