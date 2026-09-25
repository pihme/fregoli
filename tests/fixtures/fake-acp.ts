import { createInterface } from "node:readline";

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

rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg: {
    id?: number;
    method?: string;
    params?: { prompt?: Array<{ text?: string }>; sessionId?: string };
  };
  try {
    msg = JSON.parse(line) as typeof msg;
  } catch {
    return;
  }
  if (msg.method === "initialize") {
    ok(msg.id, { protocolVersion: 1, agentCapabilities: {} });
    return;
  }
  if (msg.method === "session/new" || msg.method === "session/load") {
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
    if (hangNext) {
      hangNext = false;
      return;
    }
    chunk("acp:" + text);
    ok(msg.id, { stopReason: "end_turn" });
  }
});
