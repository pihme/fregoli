import { fileURLToPath } from "node:url";
import type { ChildProcess } from "node:child_process";
import type { Context } from "cordis";
import { Service } from "cordis";
import { AcpClient, type McpServerSpec } from "./acp.ts";
import { spawnAcpAgent, whichGrok } from "./grok.ts";

declare module "cordis" {
  interface Context {
    chat: Chat;
  }
}

export class Chat extends Service {
  grok: ChildProcess | null = null;
  acp: AcpClient | null = null;

  constructor(ctx: Context) {
    super(ctx, "chat");
  }

  async reply(text: string): Promise<string> {
    if (!this.acp) return `stub: ${text}`;
    try {
      return await this.acp.prompt(text);
    } catch (err) {
      return `agent error: ${String(err)}`;
    }
  }
}

export type AgentConfig = {
  appRoot?: string;
  origin?: string;
  acp?: boolean;
  acpCommand?: string;
  acpArgs?: string[];
};

export const agentPlugin = {
  name: "agent",
  provide: ["chat"],
  async apply(ctx: Context, config: AgentConfig = {}): Promise<void> {
    await ctx.plugin(Chat);
    const chat = ctx.get("chat", true) as Chat | undefined;
    if (!chat) return;
    if (config.acp === false) return;
    const appRoot = config.appRoot ?? process.cwd();
    const child = spawnAcpAgent(ctx, {
      cwd: appRoot,
      command: config.acpCommand,
      args: config.acpArgs,
    });
    if (!child) return;
    chat.grok = child;
    const mcpPath = fileURLToPath(new URL("../../mcp.ts", import.meta.url));
    const mcpServers: McpServerSpec[] = config.origin
      ? [
          {
            name: "fregoli",
            command: process.execPath,
            args: ["--import", "tsx", mcpPath],
            env: { FREGOLI_URL: config.origin },
          },
        ]
      : [];
    const acp = new AcpClient(child);
    await acp.start({ cwd: appRoot, mcpServers });
    chat.acp = acp;
  },
};

export { whichGrok };

