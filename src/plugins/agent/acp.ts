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

export const FREGOLI_RULES = `This process is a Cordis graph. Boot plugins are web, agent, and assistant. The assistant UI is replaceable and may be removed. Change the app by writing Cordis plugins, Grok skills, and MCP servers, then load/unload via Fregoli tools (load_plugin, observe_page). The canvas is what users see. Half-written modules must not be mounted. You may install and run ordinary tools. If this is a sealed habitat, that is extra context.`;

export class AcpClient {
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private sessionId: string | null = null;
  private chunks: string[] = [];
  private closed = false;

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
      this.reply(msg.id, this.clientResult(msg.method));
      return;
    }
    if (msg.id == null) return;
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error.message ?? "ACP error"));
    else p.resolve(msg.result);
  }

  private clientResult(method: string): unknown {
    if (method.includes("requestPermission") || method.endsWith("/request_permission")) {
      return { outcome: { outcome: "selected", optionId: "allow-always" } };
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
    await this.send("initialize", {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
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

  async prompt(text: string): Promise<string> {
    if (!this.sessionId) throw new Error("no ACP session");
    this.chunks = [];
    await this.send(
      "session/prompt",
      {
        sessionId: this.sessionId,
        prompt: [{ type: "text", text }],
      },
      120_000,
    );
    const out = this.chunks.join("");
    return out || "(no reply)";
  }
}
