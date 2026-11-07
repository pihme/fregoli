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
.assistant-tools{display:flex; align-items:center; gap:.4rem}
#assistant-point{
  border:1px solid #ccc; border-radius:.6rem; background:#fff; color:#111;
  font:600 .85rem/1 system-ui,sans-serif; padding:.45rem .7rem; cursor:pointer;
}
body.fregoli-picking #assistant-point{background:#c2410c; color:#fff; border-color:#c2410c}
#assistant-pointed{
  flex:1 0 100%; display:flex; align-items:center; justify-content:space-between; gap:.5rem;
  background:#fff4e5; color:#7c2d12; border-radius:.6rem; padding:.4rem .65rem;
  font:600 .85rem/1.3 system-ui,sans-serif;
}
#assistant-pointed[hidden]{display:none}

#assistant-thread{
  flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:.65rem;
  padding:1rem; background:#fafafa;
}
.msg{max-width:80%; padding:.65rem .9rem; border-radius:1.1rem; white-space:pre-wrap; word-break:break-word; line-height:1.4}
.msg-user{align-self:flex-end; background:#0d6efd; color:#fff; border-bottom-right-radius:.3rem}
.msg-agent{align-self:flex-start; background:#fff; border:1px solid #e6e6e6; border-bottom-left-radius:.3rem}
.msg-status{align-self:flex-start; color:#666; font-style:italic; background:transparent; padding:.25rem .5rem}
#assistant-form{display:flex; flex-wrap:wrap; gap:.5rem; padding:.75rem; border-top:1px solid #eee; background:#fff}
#assistant-input{flex:1; border:1px solid #ddd; border-radius:.75rem; padding:.55rem .75rem; font:inherit}
#assistant-form button{border:0; border-radius:.75rem; background:#111; color:#fff; padding:.55rem .9rem; cursor:pointer}
#assistant-form button:disabled{opacity:.5; cursor:wait}
#assistant-pointed button{background:transparent; color:#7c2d12; border:0; padding:.1rem .35rem; font:1rem/1 system-ui,sans-serif; cursor:pointer}
#assistant-close{border:0; background:transparent; color:#111; font:1.4rem/1 system-ui,sans-serif; cursor:pointer}
</style>
<script src="/helferlein.min.js"></script>
<div id="assistant-control" class="assistant-hit" role="button" tabindex="0" aria-expanded="false" aria-controls="assistant-panel" aria-label="Assistant" title="Assistant">
  <span class="assistant-fallback">AI</span>
</div>
<div id="assistant-panel" role="dialog" aria-label="Fregoli assistant">
  <div id="assistant-header">
    <span>Assistant</span>
    <div class="assistant-tools">
      <button type="button" id="assistant-point" aria-pressed="false" aria-label="Point at an element on the page">Point</button>
      <button type="button" id="assistant-close" aria-label="Close">×</button>
    </div>
  </div>
  <div id="assistant-thread"></div>
  <form id="assistant-form">
    <p id="assistant-pointed" hidden><span id="assistant-pointed-text"></span><button type="button" id="assistant-pointed-clear" aria-label="Clear pointed element">×</button></p>
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
  const pointBtn = document.getElementById('assistant-point');
  const pointed = document.getElementById('assistant-pointed');
  const pointedText = document.getElementById('assistant-pointed-text');
  const pointedClear = document.getElementById('assistant-pointed-clear');
  let point = null;
  let picking = false;
  let pickOverlay = null;
  const KEY = 'fregoli-assistant';
  const BLOB_KEY = 'fregoli-helferlein';
  const TURN_KEY = 'fregoli-assistant-turn';
  const RETURN_KEY = 'fregoli-helferlein-return';
  let figure = null;
  let pluginsSeen = '';
  let working = false;
  let turnId = 0;
  let pollTimer = 0;
  let playedReturn = false;
  let ready = false;
  let statusEl = null;
  let restoring = false;
  let reloadStarted = false;
  let reloadAt = 0;
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
    if (!ready || !thread) return;
    const messages = [].slice.call(thread.querySelectorAll('.msg-user,.msg-agent')).map((el) => ({
      role: el.classList.contains('msg-user') ? 'user' : 'agent',
      text: el.textContent,
    }));
    let prev = null;
    try { prev = JSON.parse(sessionStorage.getItem(KEY) || 'null'); }
    catch (e) {}
    if (!messages.length && prev && Array.isArray(prev.messages) && prev.messages.length) return;
    try {
      sessionStorage.setItem(KEY, JSON.stringify({
        boot: window.FREGOLI_BOOT,
        open: document.body.classList.contains('assistant-open'),
        messages,
      }));
      sessionStorage.setItem(TURN_KEY, JSON.stringify({ boot: window.FREGOLI_BOOT, id: turnId }));
    } catch (e) {}
  }
  window.addEventListener('pagehide', () => save());
  function setOpen(open) {
    document.body.classList.toggle('assistant-open', open);
    stage.setAttribute('aria-expanded', String(open));
    if (open) {
      stage.removeAttribute('role');
      stage.tabIndex = -1;
      if (figure) figure.summon();
      input.focus();
      revealThread();
    } else {
      if (picking) stopPicking();
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
  function scrollThread() {
    thread.scrollTop = thread.scrollHeight;
  }
  function revealThread() {
    requestAnimationFrame(() => {
      scrollThread();
      requestAnimationFrame(scrollThread);
    });
  }
  function bubble(role, text) {
    const el = document.createElement('div');
    el.className = 'msg msg-' + role;
    el.textContent = text;
    thread.appendChild(el);
    scrollThread();
    if (!restoring && (role === 'user' || role === 'agent')) save();
    return el;
  }
  function pluginStamp() {
    return fetch('/plugins').then((res) => res.text()).catch(() => '');
  }
  pluginStamp().then((text) => { pluginsSeen = text; });
  function stopPoll() {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = 0;
  }
  function toolLabel(raw) {
    return String(raw || '').trim().replace(/_/g, ' ').replace(/\\s+/g, ' ').toLowerCase();
  }
  function workingText(lines) {
    const list = Array.isArray(lines) ? lines : [];
    let label = '';
    let count = 0;
    for (let i = 0; i < list.length; i++) {
      const next = toolLabel(list[i]);
      if (!next) continue;
      if (next === label) count += 1;
      else { label = next; count = 1; }
    }
    if (!label) return 'Working…';
    return count > 1 ? 'Working (' + label + ' ' + count + 'x)' : 'Working (' + label + ')';
  }
  function showWorking(lines) {
    const text = workingText(lines);
    if (!statusEl || !statusEl.isConnected) statusEl = bubble('status', text);
    else statusEl.textContent = text;
    scrollThread();
  }
  function clearWorking() {
    if (statusEl && statusEl.parentNode) statusEl.remove();
    statusEl = null;
  }
  function hasReply(reply) {
    const agents = thread.querySelectorAll('.msg-agent');
    return agents.length > 0 && agents[agents.length - 1].textContent === reply;
  }
  async function finishTurn(live) {
    stopPoll();
    clearWorking();
    const reply = live.text || '(no reply)';
    if (!hasReply(reply)) bubble('agent', reply);
    let reload = false;
    try {
      const cmds = await (await fetch('/bridge/commands?canvas=' + encodeURIComponent(window.FREGOLI_CANVAS ?? ''))).json();
      reload = Boolean(cmds && cmds.reload && Number(cmds.canvas) !== Number(window.FREGOLI_CANVAS ?? 0));
      if (reload) window.fregoliDeferReload(cmds.canvas);
    } catch (e) {}
    if (reload || reloadStarted) return;
    working = false;
    send.disabled = false;
    playedReturn = false;
    const next = await pluginStamp();
    if (figure && next !== pluginsSeen) {
      pluginsSeen = next;
      await figure.applied();
      saveBlob();
    } else if (figure) {
      figure.idle();
    }
    input.focus();
  }
  function follow(id) {
    turnId = id;
    save();
    const step = async () => {
      let live;
      try {
        live = await (await fetch('/chat/live')).json();
      } catch (e) {
        pollTimer = setTimeout(step, 500);
        return;
      }
      if (!live || live.id !== id) {
        pollTimer = setTimeout(step, 300);
        return;
      }
      showWorking(live.lines);
      if (!live.done) {
        pollTimer = setTimeout(step, 400);
        return;
      }
      finishTurn(live);
    };
    step();
  }
  window.fregoliDeferReload = function (rev) {
    const target = Number(rev);
    const jump = () => {
      const next = Number.isFinite(target) ? String(target) : String(Date.now());
      location.replace('/?c=' + next);
    };
    if (reloadStarted) {
      if (Date.now() >= reloadAt) jump();
      return;
    }
    reloadStarted = true;
    reloadAt = Date.now() + 2500;
    save();
    if (!figure || !working || !window.Helferlein || !window.Helferlein.rollFrom) {
      jump();
      return;
    }
    let next;
    try {
      const blob = figure.getBlob();
      next = window.Helferlein.rollFrom(blob.look, blob.memory);
    } catch (e) {
      jump();
      return;
    }
    let left = false;
    const go = () => {
      if (left) return;
      left = true;
      try { localStorage.setItem(BLOB_KEY, JSON.stringify({ look: next.look, memory: next.memory })); }
      catch (e) {}
      try { sessionStorage.setItem(RETURN_KEY, window.FREGOLI_BOOT || ''); }
      catch (e) {}
      save();
      jump();
    };
    try { figure.watchReveal(go); }
    catch (e) { go(); return; }
    try { figure.applied({ look: next.look, memory: next.memory }); }
    catch (e) { go(); return; }
    setTimeout(go, 2000);
  };
  const back = sessionStorage.getItem(RETURN_KEY);
  sessionStorage.removeItem(RETURN_KEY);
  playedReturn = Boolean(back && figure);
  restoring = true;
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (saved && Array.isArray(saved.messages)) {
      for (const m of saved.messages) {
        if (m && (m.role === 'user' || m.role === 'agent') && m.text) bubble(m.role, m.text);
      }
      if (saved.open && !playedReturn) setOpen(true);
    }
  } catch (e) {}
  restoring = false;
  if (playedReturn) {
    document.body.classList.add('assistant-open');
    stage.setAttribute('aria-expanded', 'true');
    stage.removeAttribute('role');
    stage.tabIndex = -1;
    Promise.resolve(figure.returnFromBack()).catch(() => {});
  }
  revealThread();
  ready = true;
  save();
  fetch('/chat/live').then((res) => res.json()).then((live) => {
    if (!live || !live.id) return;
    if (!live.done) {
      working = true;
      send.disabled = true;
      if (figure && !playedReturn) figure.working();
      showWorking(live.lines);
      follow(live.id);
      return;
    }
    if (live.text && !hasReply(live.text)) bubble('agent', live.text);
  }).catch(() => {});
  function stopPicking() {
    picking = false;
    document.body.classList.remove('fregoli-picking');
    pointBtn.setAttribute('aria-pressed', 'false');
    if (pickOverlay) pickOverlay.remove();
    pickOverlay = null;
    if (window.fregoliClearMark) window.fregoliClearMark();
  }
  function showPoint(next) {
    point = next;
    const role = next.role ? next.role.charAt(0).toUpperCase() + next.role.slice(1) : 'Element';
    pointedText.textContent = next.name && next.name.toLowerCase() !== next.role ? role + ' · ' + next.name : role;
    pointed.hidden = false;
    input.focus();
  }
  function clearPoint() {
    point = null;
    pointed.hidden = true;
    pointedText.textContent = '';
  }
  pointBtn.addEventListener('click', () => {
    if (picking) {
      stopPicking();
      return;
    }
    picking = true;
    document.body.classList.add('fregoli-picking');
    pointBtn.setAttribute('aria-pressed', 'true');
    pickOverlay = document.createElement('div');
    pickOverlay.id = 'fregoli-pick';
    pickOverlay.style.cssText = 'position:fixed;inset:0;z-index:1;cursor:crosshair;background:transparent';
    document.body.appendChild(pickOverlay);
    const hover = (ev) => {
      if (!window.fregoliHit || !window.fregoliInspect || !window.fregoliShowMark) return;
      const node = window.fregoliHit(ev.clientX, ev.clientY);
      if (!node) {
        if (window.fregoliClearMark) window.fregoliClearMark();
        return;
      }
      const found = window.fregoliInspect(node);
      if (!found) {
        if (window.fregoliClearMark) window.fregoliClearMark();
        return;
      }
      const role = found.point.role ? found.point.role.charAt(0).toUpperCase() + found.point.role.slice(1) : 'Element';
      const label = found.point.name && found.point.name.toLowerCase() !== found.point.role ? role + ' · ' + found.point.name : role;
      window.fregoliShowMark(found.element, label);
    };
    pickOverlay.addEventListener('mousemove', hover);
    pickOverlay.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const node = window.fregoliHit ? window.fregoliHit(ev.clientX, ev.clientY) : null;
      const found = node && window.fregoliInspect ? window.fregoliInspect(node) : null;
      stopPicking();
      if (found) showPoint(found.point);
    });
  });
  pointedClear.addEventListener('click', clearPoint);
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && picking) stopPicking();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if ((!text && !point) || send.disabled) return;
    input.value = '';
    const sent = point;
    const role = sent && sent.role ? sent.role.charAt(0).toUpperCase() + sent.role.slice(1) : '';
    const pointedLine = sent ? 'Pointed at ' + role + (sent.name ? ' “' + sent.name + '”' : '') : '';
    bubble('user', text && pointedLine ? pointedLine + '\\n' + text : (pointedLine || text));
    clearPoint();
    stopPicking();
    send.disabled = true;
    working = true;
    if (figure) figure.working();
    showWorking([]);
    let before = { id: 0 };
    try { before = await (await fetch('/chat/live')).json(); }
    catch (err) {}
    const body = { text };
    if (sent) body.point = sent;
    let abandoned = false;
    fetch('/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch((err) => {
      abandoned = true;
      stopPoll();
      clearWorking();
      bubble('status', 'Request failed: ' + err);
      working = false;
      send.disabled = false;
      if (figure) figure.idle();
      input.focus();
    });
    const watch = async () => {
      if (abandoned) return;
      let live;
      try { live = await (await fetch('/chat/live')).json(); }
      catch (err) {
        if (abandoned) return;
        pollTimer = setTimeout(watch, 400);
        return;
      }
      if (abandoned) return;
      if (!live || live.id <= (before.id || 0)) {
        pollTimer = setTimeout(watch, 200);
        return;
      }
      follow(live.id);
    };
    watch();
  });
})();
</script>`);
  },
};
