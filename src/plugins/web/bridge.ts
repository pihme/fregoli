import { Context, Service } from "cordis";

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
};

type Tab = { snapshot: Snapshot; focusedAt: number };

export class PageBridge extends Service {
  private tabs = new Map<string, Tab>();
  pendingHighlight: string | null = null;
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
  async function poll() {
    try {
      const r = await fetch('/bridge/commands');
      const j = await r.json();
      if (j.highlight) {
        const node = document.querySelector(j.highlight);
        if (node) node.style.outline = '2px solid #c00';
      }
    } catch (e) {}
    setTimeout(poll, 500);
  }
  poll();
  document.addEventListener('click', (ev) => {
    const t = ev.target;
    if (!(t instanceof Element)) return;
    const selector = t.id ? '#' + t.id : t.tagName.toLowerCase();
    fetch('/bridge/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'click', selector }),
    });
  }, true);
})();
</script>
`;
