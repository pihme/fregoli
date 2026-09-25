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

export const FREGOLI_RULES = `You are the Fregoli in-app agent. Read skill fregoli-app (in .grok/skills/fregoli-app). The canvas is the product UI; this chat is only the assistant. Write new canvas plugins under plugins/runtime/ (not src/plugins or plugins/shipped). Then MCP load_plugin and reload_page. Use list_plugins and unload_plugin. Use observe_page to see what the user sees. Do not unload web or agent. Do not mount half-written files.`;

export class AcpClient {
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private sessionId: string | null = null;
  private chunks: string[] = [];
  private closed = false;
  private startOpts: { cwd: string; mcpServers?: McpServerSpec[] } | null = null;
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
    if (kind.includes("agent_message") || kind.includes("message") || kind === "agent_message_chunk") {
      if (content?.text) this.chunks.push(content.text);
    }
    if (typeof update.text === "string") this.chunks.push(update.text);
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
    this.startOpts = opts;
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

  async recover(): Promise<void> {
    if (!this.sessionId) return;
    try {
      await this.send("session/cancel", { sessionId: this.sessionId }, 5_000);
    } catch {
      /* still wedged; try load */
    }
    try {
      const loaded = (await this.send(
        "session/load",
        { sessionId: this.sessionId, cwd: this.startOpts?.cwd },
        10_000,
      )) as { sessionId?: string };
      if (loaded.sessionId) this.sessionId = loaded.sessionId;
      return;
    } catch {
      /* fall through to a new session */
    }
    if (!this.startOpts) return;
    const mcpServers = (this.startOpts.mcpServers ?? []).map((s) => ({
      name: s.name,
      command: s.command,
      args: s.args ?? [],
      env: Object.entries(s.env ?? {}).map(([name, value]) => ({ name, value })),
    }));
    const created = (await this.send("session/new", {
      cwd: this.startOpts.cwd,
      mcpServers,
      _meta: { yoloMode: true, systemPromptOverride: FREGOLI_RULES },
    })) as { sessionId?: string };
    this.sessionId = created.sessionId ?? this.sessionId;
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

  async prompt(text: string, timeoutMs = 120_000): Promise<string> {
    const run = this.chain.then(async () => {
      try {
        return await this.promptOnce(text, timeoutMs);
      } catch (err) {
        if (!String(err).includes("ACP timeout")) throw err;
        await this.recover();
        return await this.promptOnce(text, timeoutMs);
      }
    });
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return await run;
  }
}
