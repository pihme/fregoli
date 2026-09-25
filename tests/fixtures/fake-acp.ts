import { createInterface } from "node:readline";

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg: { id?: number; method?: string; params?: { prompt?: Array<{ text?: string }> } };
  try {
    msg = JSON.parse(line) as typeof msg;
  } catch {
    return;
  }
  if (msg.method === "initialize") {
    process.stdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: msg.id,
        result: { protocolVersion: 1, agentCapabilities: {} },
      }) + "\n",
    );
    return;
  }
  if (msg.method === "session/new") {
    process.stdout.write(
      JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { sessionId: "s1" } }) + "\n",
    );
    return;
  }
  if (msg.method === "session/prompt") {
    const text = msg.params?.prompt?.[0]?.text ?? "";
    process.stdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "s1",
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "acp:" + text },
          },
        },
      }) + "\n",
    );
    process.stdout.write(
      JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { stopReason: "end_turn" } }) + "\n",
    );
  }
});
