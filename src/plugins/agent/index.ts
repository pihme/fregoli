import type { ChildProcess } from "node:child_process";
import type { Context } from "cordis";
import { Service } from "cordis";
import { spawnGrok, whichGrok } from "./grok.ts";

declare module "cordis" {
  interface Context {
    chat: Chat;
  }
}

export class Chat extends Service {
  grok: ChildProcess | null = null;

  constructor(ctx: Context) {
    super(ctx, "chat");
  }

  async reply(text: string): Promise<string> {
    // ACP prompt session is not wired yet; spawn is for lifecycle (step 6).
    return `stub: ${text}`;
  }
}

export const agentPlugin = {
  name: "agent",
  provide: ["chat"],
  async apply(ctx: Context, config: { appRoot?: string } = {}): Promise<void> {
    await ctx.plugin(Chat);
    const chat = ctx.get("chat", true) as Chat | undefined;
    const child = spawnGrok(ctx, config.appRoot ?? process.cwd());
    if (child && chat) chat.grok = child;
  },
};

export { whichGrok };

