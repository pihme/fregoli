import assert from "node:assert/strict";
import { createServer } from "node:net";
import { test } from "node:test";
import { startKernel, stopKernel } from "../src/kernel.ts";
import { assistantPlugin } from "../src/plugins/assistant/index.ts";
import { webPlugin } from "../src/plugins/web/index.ts";

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      if (!addr || typeof addr === "string") {
        s.close();
        reject(new Error("no port"));
        return;
      }
      const port = addr.port;
      s.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

class ClassList {
  constructor(private el: FakeEl) {}
  private names(): string[] {
    return this.el.className.split(/\s+/).filter(Boolean);
  }
  add(...xs: string[]): void {
    const set = new Set(this.names());
    for (const x of xs) set.add(x);
    this.el.className = [...set].join(" ");
  }
  remove(...xs: string[]): void {
    const drop = new Set(xs);
    this.el.className = this.names().filter((n) => !drop.has(n)).join(" ");
  }
  toggle(name: string, force?: boolean): boolean {
    const on = force === undefined ? !this.contains(name) : force;
    if (on) this.add(name);
    else this.remove(name);
    return on;
  }
  contains(name: string): boolean {
    return this.names().includes(name);
  }
}

class FakeEl {
  className = "";
  classList = new ClassList(this);
  children: FakeEl[] = [];
  parentNode: FakeEl | null = null;
  attributes: Record<string, string> = {};
  textContent = "";
  value = "";
  hidden = false;
  style: Record<string, string> = {};
  listeners: Record<string, Array<(ev: { preventDefault(): void }) => unknown>> = {};
  scrollTop = 0;
  scrollHeight = 0;
  tabIndex = 0;
  disabled = false;
  constructor(readonly id = "") {}
  setAttribute(k: string, v: string): void {
    this.attributes[k] = String(v);
  }
  removeAttribute(k: string): void {
    delete this.attributes[k];
  }
  addEventListener(type: string, fn: (ev: { preventDefault(): void }) => unknown): void {
    (this.listeners[type] ??= []).push(fn);
  }
  appendChild(child: FakeEl): FakeEl {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  remove(): void {
    this.parentNode?.children.splice(this.parentNode.children.indexOf(this), 1);
    this.parentNode = null;
  }
  querySelectorAll(sel: string): FakeEl[] {
    const parts = sel.split(",").map((s) => s.trim());
    const out: FakeEl[] = [];
    const walk = (n: FakeEl) => {
      if (parts.some((p) => p.startsWith(".") && n.classList.contains(p.slice(1)))) out.push(n);
      for (const c of n.children) walk(c);
    };
    for (const c of this.children) walk(c);
    return out;
  }
  focus(): void {}
  async dispatch(type: string, ev: { preventDefault(): void }): Promise<void> {
    await Promise.all((this.listeners[type] ?? []).map((fn) => Promise.resolve(fn(ev))));
  }
}

function installDom(): {
  form: FakeEl;
  input: FakeEl;
  send: FakeEl;
  thread: FakeEl;
  restore(): void;
} {
  const ids = [
    "assistant-control",
    "assistant-panel",
    "assistant-close",
    "assistant-thread",
    "assistant-form",
    "assistant-input",
    "assistant-send",
    "assistant-point",
    "assistant-pointed",
    "assistant-pointed-text",
    "assistant-pointed-clear",
  ];
  const byId = new Map(ids.map((id) => [id, new FakeEl(id)]));
  const body = new FakeEl();
  const g = globalThis as typeof globalThis & {
    window: typeof globalThis;
    document: {
      body: FakeEl;
      getElementById(id: string): FakeEl | null;
      createElement(): FakeEl;
      addEventListener(): void;
    };
    location: { replace(url: string): void };
    sessionStorage: Storage;
    localStorage: Storage;
    requestAnimationFrame(fn: () => void): number;
  };
  const prev = {
    window: g.window,
    document: g.document,
    location: g.location,
    sessionStorage: g.sessionStorage,
    localStorage: g.localStorage,
    requestAnimationFrame: g.requestAnimationFrame,
    fetch: g.fetch,
    setTimeout: g.setTimeout,
    clearTimeout: g.clearTimeout,
    FREGOLI_BOOT: (g as { FREGOLI_BOOT?: string }).FREGOLI_BOOT,
    FREGOLI_CANVAS: (g as { FREGOLI_CANVAS?: number }).FREGOLI_CANVAS,
  };
  const mem = new Map<string, string>();
  const storage = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => mem.set(k, String(v)),
    removeItem: (k: string) => mem.delete(k),
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  };
  g.window = g;
  (g as { addEventListener?: () => void }).addEventListener = () => {};
  g.document = {
    body,
    getElementById: (id) => byId.get(id) ?? null,
    createElement: () => new FakeEl(),
    addEventListener: () => {},
  };
  g.location = { replace() {} };
  g.sessionStorage = storage;
  g.localStorage = storage;
  g.requestAnimationFrame = (fn) => {
    fn();
    return 1;
  };
  (g as { FREGOLI_BOOT?: string }).FREGOLI_BOOT = "boot";
  (g as { FREGOLI_CANVAS?: number }).FREGOLI_CANVAS = 0;
  const pending: Array<{ id: number; fn: () => void }> = [];
  let seq = 1;
  g.setTimeout = ((fn: TimerHandler) => {
    const id = seq++;
    pending.push({ id, fn: () => (fn as () => void)() });
    return id as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  g.clearTimeout = ((id?: number) => {
    const i = pending.findIndex((t) => t.id === id);
    if (i >= 0) pending.splice(i, 1);
  }) as typeof clearTimeout;
  (g as { __flush?: () => Promise<void> }).__flush = async () => {
    for (let n = 0; n < 30; n++) {
      const batch = pending.splice(0, pending.length);
      for (const t of batch) t.fn();
      await Promise.resolve();
    }
  };
  return {
    form: byId.get("assistant-form")!,
    input: byId.get("assistant-input")!,
    send: byId.get("assistant-send")!,
    thread: byId.get("assistant-thread")!,
    restore() {
      g.window = prev.window;
      g.document = prev.document;
      g.location = prev.location;
      g.sessionStorage = prev.sessionStorage;
      g.localStorage = prev.localStorage;
      g.requestAnimationFrame = prev.requestAnimationFrame;
      delete (g as { addEventListener?: () => void }).addEventListener;
      g.fetch = prev.fetch;
      g.setTimeout = prev.setTimeout;
      g.clearTimeout = prev.clearTimeout;
    },
  };
}

test("a failed POST /chat is shown and Send works again", async () => {
  const port = await freePort();
  const ctx = await startKernel([
    [webPlugin, { port, host: "127.0.0.1" }],
    assistantPlugin,
  ]);
  let posts = 0;
  const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
  const dom = installDom();
  try {
    const script = html
      .split("<script>")
      .map((part) => part.split("</script>")[0])
      .find((part) => part.includes("fregoli-assistant"));
    assert.ok(script, "emitted assistant script");
    const live = { id: 0, lines: [] as string[], text: "", done: true };
    globalThis.fetch = (async (url: string, opts?: { method?: string }) => {
      const path = String(url);
      if (path.includes("/plugins")) return new Response("[]");
      if (path.includes("/bridge/commands")) {
        return Response.json({ highlight: null, reload: false, canvas: 0 });
      }
      if (path.includes("/chat/live")) return Response.json(live);
      if (opts?.method === "POST" && path.includes("/chat")) {
        posts += 1;
        throw new Error("network down");
      }
      return new Response("", { status: 404 });
    }) as typeof fetch;
    eval(script!);
    await Promise.resolve();
    dom.input.value = "hello";
    await dom.form.dispatch("submit", { preventDefault() {} });
    await (globalThis as { __flush?: () => Promise<void> }).__flush?.();
    const status = dom.thread.querySelectorAll(".msg-status").map((el) => el.textContent);
    assert.equal(posts, 1);
    assert.ok(status.some((text) => text.startsWith("Request failed:")));
    assert.equal(dom.send.disabled, false);
    await (globalThis as { __flush?: () => Promise<void> }).__flush?.();
    assert.equal(posts, 1);
  } finally {
    dom.restore();
    await stopKernel(ctx);
  }
});
