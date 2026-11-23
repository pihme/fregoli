import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

type McpSpec = { name: string; command: string; args?: string[]; env?: Array<{ name: string; value: string }> };

/** With FAKE_ACP_RECORD set, each event is appended there as one JSON line. */
function record(event: Record<string, unknown>) {
  const file = process.env.FAKE_ACP_RECORD;
  if (file) appendFileSync(file, JSON.stringify(event) + "\n");
}

record({
  event: "spawn",
  argv: process.argv.slice(2),
  cwd: process.cwd(),
  env: {
    OPENCODE_CONFIG_CONTENT: process.env.OPENCODE_CONFIG_CONTENT ?? null,
    OPENCODE_DISABLE_PROJECT_CONFIG: process.env.OPENCODE_DISABLE_PROJECT_CONFIG ?? null,
  },
});

let sessions = 0;
let mcpSpecs: McpSpec[] = [];
let mcp: { child: ChildProcess; call: (method: string, params?: unknown) => Promise<unknown> } | null = null;

/** Start the first MCP server from session/new, as an ACP agent would, and talk MCP to it. */
async function mcpClient() {
  if (mcp) return mcp;
  const spec = mcpSpecs[0];
  if (!spec) throw new Error("no MCP server in session/new");
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const e of spec.env ?? []) env[e.name] = e.value;
  const child = spawn(spec.command, spec.args ?? [], { env, stdio: ["pipe", "pipe", "inherit"] });
  process.on("exit", () => child.kill("SIGTERM"));
  let next = 1;
  const pending = new Map<number, (v: unknown) => void>();
  createInterface({ input: child.stdout! }).on("line", (line) => {
    const m = JSON.parse(line) as { id?: number; result?: unknown; error?: { message?: string } };
    if (m.id == null || !pending.has(m.id)) return;
    pending.get(m.id)!(m.error ? { error: m.error.message } : m.result);
    pending.delete(m.id);
  });
  const call = (method: string, params?: unknown) =>
    new Promise<unknown>((resolve) => {
      const id = next++;
      pending.set(id, resolve);
      child.stdin!.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  await call("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "fake-acp", version: "0" } });
  mcp = { child, call };
  return mcp;
}
let permissionId = 1000;
const waiting = new Map<number, (result: unknown) => void>();
let hangNext = process.env.FAKE_ACP_HANG === "1";
const rl = createInterface({ input: process.stdin });

function ok(id: number | undefined, result: unknown) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function chunk(text: string) {
  process.stdout.write(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text },
        },
      },
    }) + "\n",
  );
}

function tool(title: string) {
  process.stdout.write(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: { sessionUpdate: "tool_call", title, toolCallId: "t1", status: "pending" },
      },
    }) + "\n",
  );
}

rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg: {
    id?: number;
    method?: string;
    params?: { prompt?: Array<{ text?: string }>; sessionId?: string };
    result?: unknown;
  };
  try {
    msg = JSON.parse(line) as typeof msg;
  } catch {
    return;
  }
  if (!msg.method && msg.id != null && waiting.has(msg.id)) {
    waiting.get(msg.id)!(msg.result);
    waiting.delete(msg.id);
    return;
  }
  if (msg.method === "initialize") {
    ok(msg.id, { protocolVersion: 1, agentCapabilities: {} });
    return;
  }
  if (msg.method === "session/new" || msg.method === "session/load") {
    sessions += 1;
    mcpSpecs = ((msg.params as { mcpServers?: McpSpec[] } | undefined)?.mcpServers ?? []) as McpSpec[];
    record({ event: msg.method, params: msg.params });
    ok(msg.id, { sessionId: "s1" });
    return;
  }
  if (msg.method === "session/cancel") {
    hangNext = false;
    ok(msg.id, {});
    return;
  }
  if (msg.method === "session/prompt") {
    const text = msg.params?.prompt?.[0]?.text ?? "";
    record({ event: "session/prompt", sessionId: msg.params?.sessionId, text, sessions });
    if (text.startsWith("mcp ")) {
      // "mcp <tool> <json args>" calls that page-bridge tool; "mcp tools/list" lists them.
      const [, name, ...rest] = text.split(" ");
      void (async () => {
        const client = await mcpClient();
        const result =
          name === "tools/list"
            ? await client.call("tools/list")
            : await client.call("tools/call", { name, arguments: rest.length ? JSON.parse(rest.join(" ")) : {} });
        tool(name);
        chunk("mcp:" + JSON.stringify(result));
        ok(msg.id, { stopReason: "end_turn" });
      })();
      return;
    }
    if (text === "permission") {
      // Ask like OpenCode does and answer with the option the client selected.
      const id = permissionId++;
      waiting.set(id, (result) => {
        const picked = (result as { outcome?: { optionId?: string } })?.outcome?.optionId;
        chunk("permission:" + picked);
        ok(msg.id, { stopReason: "end_turn" });
      });
      process.stdout.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id,
          method: "session/request_permission",
          params: {
            sessionId: "s1",
            toolCall: { toolCallId: "t2", title: "bash", kind: "execute", status: "pending" },
            options: [
              { optionId: "once", kind: "allow_once", name: "Allow once" },
              { optionId: "always", kind: "allow_always", name: "Always allow" },
              { optionId: "reject", kind: "reject_once", name: "Reject" },
            ],
          },
        }) + "\n",
      );
      return;
    }
    if (hangNext) {
      hangNext = false;
      return;
    }
    const pause = Number(process.env.FAKE_ACP_PAUSE_MS ?? "0");
    const finish = () => {
      chunk("acp:" + text);
      ok(msg.id, { stopReason: "end_turn" });
    };
    if (pause > 0) {
      tool("read_file");
      setTimeout(finish, pause);
      return;
    }
    finish();
  }
});
