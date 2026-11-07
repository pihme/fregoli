import { readFileSync, writeFileSync } from "node:fs";
import type { ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
};

export type McpServerSpec = {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

export const FREGOLI_RULES = `You are the Fregoli in-app agent. The canvas is the product. This chat is only the assistant.
Do not read the fregoli-app skill, AGENTS.md, memory, src/, or tests/. Do not call search_tool. Do not browse, click, or screenshot. The tool names and arguments below are complete.
The canvas is one HTML string. setCanvas replaces that whole string. When the user adds or changes a piece, keep what is already on the canvas. Call observe_page once, copy nextCanvas into the plugin, and change only the part they named. If a runtime plugin already draws that canvas, edit that file, then unload_plugin its name and load_plugin the same file. Do not design a new page. Replace the canvas only when the user asks for a new scene, a different mockup, or to clear or start over.
Plugin file plugins/runtime/<name>.ts: import type { Context } from "cordis"; export const plugin = { name: "<name>", inject: ["ui"], apply(ctx: Context) { ctx.effect(() => { ctx.ui.setCanvas("...html..."); return () => ctx.ui.setCanvas(""); }); } };
Mount with load_plugin { "file": "plugins/runtime/<name>.ts" }. Call reload_page {} once. The tab stays until the reply finishes, then turns away and reloads once. Judge from nextCanvas only. html is the tab still on screen. Do not reload again. Reply in one sentence only if nextCanvas shows the change. If the user points at an element, that element is the one they mean. Do not highlight the assistant. Do not unload web or agent. Do not mount a half-written file.`;

export class AcpClient {
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private sessionId: string | null = null;
  private chunks: string[] = [];
  private closed = false;
  private activity: ((line: string) => void) | null = null;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private child: ChildProcess) {
    const rl = createInterface({ input: child.stdout! });
    rl.on("line", (line) => this.onLine(line));
    child.on("exit", () => {
      this.closed = true;
      for (const p of this.pending.values()) {
        p.reject(new Error("ACP agent exited"));
      }
      this.pending.clear();
    });
  }

  private onLine(line: string): void {
    if (!line.trim()) return;
    let msg: {
      id?: number;
      method?: string;
      params?: Record<string, unknown>;
      result?: unknown;
      error?: { message?: string };
    };
    try {
      msg = JSON.parse(line) as typeof msg;
    } catch {
      return;
    }
    if (msg.method === "session/update" || msg.method === "x.ai/session/update") {
      this.onUpdate(msg.params ?? {});
      return;
    }
    if (msg.method && msg.id != null && msg.result == null && !msg.error) {
      this.reply(msg.id, this.clientResult(msg.method, msg.params ?? {}));
      return;
    }
    if (msg.id == null) return;
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error.message ?? "ACP error"));
    else p.resolve(msg.result);
  }

  private clientResult(method: string, params: Record<string, unknown>): unknown {
    if (method.includes("requestPermission") || method.endsWith("/request_permission")) {
      return { outcome: { outcome: "selected", optionId: "allow-always" } };
    }
    if (method.includes("read_text_file") || method.endsWith("readTextFile")) {
      const path = String(params.path ?? "");
      try {
        return { content: readFileSync(path, "utf8") };
      } catch (err) {
        return { content: "", error: String(err) };
      }
    }
    if (method.includes("write_text_file") || method.endsWith("writeTextFile")) {
      const path = String(params.path ?? "");
      writeFileSync(path, String(params.content ?? ""));
      return {};
    }
    return {};
  }

  private onUpdate(params: Record<string, unknown>): void {
    const update = (params.update ?? params) as Record<string, unknown>;
    const kind = String(update.sessionUpdate ?? update.type ?? "");
    const content = update.content as { type?: string; text?: string } | undefined;
    if (kind === "tool_call") {
      const title = String(update.title ?? update.name ?? "").trim();
      if (title) this.activity?.(title);
    }
    if (kind.includes("agent_message") || kind === "agent_message_chunk") {
      if (content?.text) this.chunks.push(content.text);
    }
    if (typeof update.text === "string" && kind !== "tool_call") this.chunks.push(update.text);
  }

  private send(method: string, params: unknown, timeoutMs = 15_000): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error("ACP closed"));
    const id = this.nextId++;
    this.child.stdin!.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("ACP timeout " + method));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(t);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(t);
          reject(e);
        },
      });
    });
  }

  private reply(id: number, result: unknown): void {
    this.child.stdin!.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
  }

  async start(opts: { cwd: string; mcpServers?: McpServerSpec[] }): Promise<void> {
    await this.send("initialize", {
      protocolVersion: 1,
      clientCapabilities: {},
      clientInfo: { name: "fregoli", version: "0.0.0" },
    });
    const mcpServers = (opts.mcpServers ?? []).map((s) => ({
      name: s.name,
      command: s.command,
      args: s.args ?? [],
      env: Object.entries(s.env ?? {}).map(([name, value]) => ({ name, value })),
    }));
    const result = (await this.send("session/new", {
      cwd: opts.cwd,
      mcpServers,
      _meta: { yoloMode: true, systemPromptOverride: FREGOLI_RULES },
    })) as { sessionId?: string };
    this.sessionId = result.sessionId ?? "default";
  }

  private async stopTurn(): Promise<void> {
    try {
      if (this.sessionId && !this.closed) {
        await this.send("session/cancel", { sessionId: this.sessionId }, 1_000);
      }
    } catch {
      /* the running turn did not stop */
    }
    if (!this.child.killed) this.child.kill("SIGTERM");
  }

  private async promptOnce(text: string, timeoutMs: number): Promise<string> {
    if (!this.sessionId) throw new Error("no ACP session");
    this.chunks = [];
    await this.send(
      "session/prompt",
      {
        sessionId: this.sessionId,
        prompt: [{ type: "text", text }],
      },
      timeoutMs,
    );
    const out = this.chunks.join("");
    return out || "(no reply)";
  }

  async prompt(
    text: string,
    timeoutMs = 300_000,
    onActivity?: (line: string) => void,
  ): Promise<string> {
    const run = this.chain.then(async () => {
      this.activity = onActivity ?? null;
      try {
        return await this.promptOnce(text, timeoutMs);
      } catch (err) {
        if (String(err).includes("ACP timeout")) await this.stopTurn();
        throw err;
      } finally {
        this.activity = null;
      }
    });
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return await run;
  }
}
