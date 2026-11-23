// A fake ACP child that answers every prompt with the model environment it was started with.
import { createInterface } from "node:readline";

const rl = createInterface({ input: process.stdin });

function ok(id: number | undefined, result: unknown) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

rl.on("line", (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line) as { id?: number; method?: string };
  if (msg.method === "initialize") return ok(msg.id, { protocolVersion: 1, agentCapabilities: {} });
  if (msg.method === "session/new") return ok(msg.id, { sessionId: "s1" });
  if (msg.method === "session/prompt") {
    const text = JSON.stringify({
      config: process.env.OPENCODE_CONFIG_CONTENT ?? null,
      key: process.env.FREGOLI_MODEL_API_KEY ?? null,
    });
    process.stdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "s1",
          update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } },
        },
      }) + "\n",
    );
    ok(msg.id, { stopReason: "end_turn" });
  }
});
