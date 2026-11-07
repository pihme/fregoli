import { Context, Service } from "cordis";
import { pointClientSource } from "./point.ts";

export type Snapshot = {
  tabId: string;
  html: string;
  url: string;
  viewport: { width: number; height: number };
  focused: string | null;
  at: number;
};

export type UserAction = {
  type: "click" | "type";
  selector: string;
  value?: string;
  name?: string;
  role?: string;
  text?: string;
  context?: string;
};

type Tab = { snapshot: Snapshot; focusedAt: number };

export class PageBridge extends Service {
  private tabs = new Map<string, Tab>();
  pendingHighlight: string | null = null;
  pendingReload = false;
  private waiters: Array<(a: UserAction) => void> = [];

  constructor(ctx: Context) {
    super(ctx, "pageBridge");
  }

  connect(snapshot: Snapshot): void {
    const prev = this.tabs.get(snapshot.tabId);
    this.tabs.set(snapshot.tabId, {
      snapshot,
      focusedAt: prev?.focusedAt ?? snapshot.at,
    });
  }

  focus(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (tab) tab.focusedAt = Date.now();
  }

  disconnect(tabId: string): void {
    this.tabs.delete(tabId);
  }

  observe(): Snapshot {
    let best: Tab | undefined;
    for (const tab of this.tabs.values()) {
      if (!best || tab.focusedAt > best.focusedAt) best = tab;
    }
    if (!best) {
      throw new Error("no browser connected");
    }
    return best.snapshot;
  }

  highlight(selector: string): void {
    this.pendingHighlight = selector;
  }

  waitForAction(): Promise<UserAction> {
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  reportAction(action: UserAction): void {
    this.pendingHighlight = null;
    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) w(action);
  }

  requestReload(): void {
    this.pendingReload = true;
  }

  takeCommands(holdReload = false, seenCanvas?: number): { highlight: string | null; reload: boolean; canvas: number } {
    const ui = this.ctx.get("ui", true) as { canvasRev?: number } | undefined;
    const canvas = ui?.canvasRev ?? 0;
    const knows = typeof seenCanvas === "number" && Number.isFinite(seenCanvas);
    if (knows && seenCanvas === canvas) this.pendingReload = false;
    if (holdReload) return { highlight: this.pendingHighlight, reload: false, canvas };
    const stale = knows && seenCanvas !== canvas;
    return { highlight: this.pendingHighlight, reload: stale || this.pendingReload, canvas };
  }
}

export const bridgeClientScript = `
<script>
(() => {
  const tabId = (crypto.randomUUID && crypto.randomUUID()) || String(Math.random());
  function snapshot() {
    const el = document.activeElement;
    return {
      tabId,
      html: document.documentElement.outerHTML,
      url: location.href,
      viewport: { width: innerWidth, height: innerHeight },
      focused: el && el.id ? el.id : null,
    };
  }
  async function send() {
    try {
      await fetch('/bridge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(snapshot()),
      });
    } catch (e) {}
  }
  send();
  setInterval(send, 2000);
  addEventListener('focus', send);
  ${pointClientSource()}
  const CONTROL = 'button, a, input, textarea, select, label, summary, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="switch"], [role="radio"]';
  function nameOf(el) {
    const labelled = el.getAttribute('aria-labelledby');
    if (labelled) {
      const text = labelled.split(' ').map((id) => {
        const node = document.getElementById(id);
        return node ? (node.innerText || node.textContent || '') : '';
      }).join(' ');
      const clipped = clipText(text);
      if (clipped) return clipped;
    }
    const aria = el.getAttribute('aria-label');
    if (aria) return clipText(aria);
    if (el.alt) return clipText(el.alt);
    if (el.labels && el.labels.length) return clipText(el.labels[0].innerText || el.labels[0].textContent || '');
    if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.getAttribute('placeholder')) {
      return clipText(el.getAttribute('placeholder'));
    }
    return clipText(el.innerText || el.textContent || '');
  }
  function headingOf(el) {
    const kids = el.children || [];
    for (let i = 0; i < kids.length; i++) {
      const tag = kids[i].tagName;
      if (tag === 'H1' || tag === 'H2' || tag === 'H3') return clipText(kids[i].innerText || kids[i].textContent || '');
    }
    return '';
  }
  function nthOf(el) {
    const parent = el.parentElement;
    if (!parent) return 0;
    let count = 0;
    let index = 0;
    for (const child of parent.children) {
      if (child.tagName !== el.tagName) continue;
      count += 1;
      if (child === el) index = count;
    }
    return count > 1 ? index : 0;
  }
  function adaptOne(el) {
    const tag = el.tagName.toLowerCase();
    const heading = headingOf(el);
    const aria = clipText(el.getAttribute('aria-label') || '');
    let label = aria;
    if (!label && tag !== 'div' && tag !== 'section' && tag !== 'article' && tag !== 'main') label = nameOf(el);
    if (!label) label = heading;
    return {
      tag,
      id: el.id || '',
      role: el.getAttribute('role') || '',
      label: label || '',
      heading,
      nth: nthOf(el),
      inAssistant: Boolean(el.closest && el.closest('#assistant-slot')),
      parent: null,
    };
  }
  function adaptChain(el) {
    const nodes = [];
    const els = [];
    let current = el;
    while (current && current.nodeType === 1 && current.tagName !== 'HTML') {
      nodes.push(adaptOne(current));
      els.push(current);
      current = current.parentElement;
    }
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].parent = nodes[i + 1];
    return { nodes, els };
  }
  function boxOf(el) {
    const decorative = { SPAN: 1, I: 1, B: 1, EM: 1, STRONG: 1, SMALL: 1, SVG: 1, PATH: 1, CIRCLE: 1, RECT: 1, ELLIPSE: 1, LINE: 1, POLYLINE: 1, POLYGON: 1, G: 1, USE: 1 };
    let box = el;
    while (box.parentElement && box.parentElement.id !== 'canvas' && decorative[box.tagName] && !nameOf(box)) {
      box = box.parentElement;
    }
    return box;
  }
  function inspectElement(el) {
    if (!el || !el.closest || el.closest('#assistant-slot') || el.id === 'canvas') return null;
    const chain = adaptChain(el);
    let sole = null;
    let soleElement = null;
    const ancestor = el.closest(CONTROL);
    if (!ancestor) {
      const box = boxOf(el);
      const controls = box.querySelectorAll ? box.querySelectorAll(CONTROL) : [];
      const usable = [];
      for (const node of controls) {
        if (!node.closest('#assistant-slot')) usable.push(node);
      }
      if (usable.length === 1) {
        soleElement = usable[0];
        sole = adaptChain(soleElement).nodes[0];
      }
    }
    const chosen = chooseTarget(chain.nodes[0], sole);
    if (!chosen) return null;
    let element = sole && chosen === sole ? soleElement : null;
    if (!element) {
      const index = chain.nodes.indexOf(chosen);
      element = index >= 0 ? chain.els[index] : el;
    }
    return { element, point: describeTarget(chosen) };
  }
  function showMark(el, label) {
    if (!el || (el.closest && el.closest('#assistant-slot'))) {
      clearMark();
      return;
    }
    const rect = el.getBoundingClientRect();
    let box = document.getElementById('fregoli-mark');
    if (!box) {
      box = document.createElement('div');
      box.id = 'fregoli-mark';
      document.body.appendChild(box);
    }
    const radius = getComputedStyle(el).borderRadius || '0';
    box.style.cssText = 'position:fixed;z-index:1;pointer-events:none;background:rgba(255,176,0,.5);box-shadow:0 0 0 3px #c2410c;left:' + rect.left + 'px;top:' + rect.top + 'px;width:' + rect.width + 'px;height:' + rect.height + 'px;border-radius:' + radius;
    let tag = document.getElementById('fregoli-mark-label');
    if (!tag) {
      tag = document.createElement('div');
      tag.id = 'fregoli-mark-label';
      document.body.appendChild(tag);
    }
    tag.textContent = label || '';
    tag.style.cssText = 'position:fixed;z-index:1;pointer-events:none;background:#c2410c;color:#fff;font:600 14px/1.2 system-ui,sans-serif;padding:6px 8px;border-radius:6px;left:' + Math.max(8, rect.left) + 'px;top:' + Math.max(8, rect.top - 32) + 'px';
  }
  function clearMark() {
    const box = document.getElementById('fregoli-mark');
    const tag = document.getElementById('fregoli-mark-label');
    if (box) box.remove();
    if (tag) tag.remove();
  }
  window.fregoliInspect = inspectElement;
  window.fregoliShowMark = showMark;
  window.fregoliClearMark = clearMark;
  function hitAt(x, y) {
    const stack = document.elementsFromPoint(x, y);
    for (const node of stack) {
      if (!node || node.id === 'fregoli-pick' || node.id === 'fregoli-mark' || node.id === 'fregoli-mark-label') continue;
      if (node.closest && node.closest('#assistant-slot')) continue;
      if (node.id === 'canvas' || node === document.body || node === document.documentElement) return null;
      return node;
    }
    return null;
  }
  window.fregoliHit = hitAt;
  async function poll() {
    try {
      const r = await fetch('/bridge/commands?canvas=' + encodeURIComponent(window.FREGOLI_CANVAS ?? ''));
      const j = await r.json();
      const local = Number(window.FREGOLI_CANVAS ?? 0);
      const stale = Boolean(j.reload) && Number(j.canvas) !== local;
      if (stale) {
        if (typeof window.fregoliDeferReload === 'function') window.fregoliDeferReload(j.canvas);
        else location.replace('/?c=' + encodeURIComponent(j.canvas));
      } else if (!document.body.classList.contains('fregoli-picking')) {
        if (j.highlight) {
          const node = document.querySelector(j.highlight);
          if (node && !(node.closest && node.closest('#assistant-slot'))) {
            const found = inspectElement(node) || { element: node, point: { role: 'element', name: '', text: '', context: '', selector: j.highlight } };
            showMark(found.element, markLabel(found.point));
          } else clearMark();
        } else clearMark();
      }
    } catch (e) {}
    setTimeout(poll, 500);
  }
  poll();
  document.addEventListener('click', (ev) => {
    if (document.body.classList.contains('fregoli-picking')) return;
    const t = ev.target;
    if (!(t instanceof Element) || (t.closest && t.closest('#assistant-slot'))) return;
    const found = inspectElement(t);
    if (!found) return;
    fetch('/bridge/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.assign({ type: 'click' }, found.point)),
    });
  }, true);
})();
</script>
`;
