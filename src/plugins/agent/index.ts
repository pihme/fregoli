import type { Context } from "cordis";
import { Service } from "cordis";

declare module "cordis" {
  interface Context {
    chat: Chat;
  }
}

export class Chat extends Service {
  constructor(ctx: Context) {
    super(ctx, "chat");
  }

  async reply(text: string): Promise<string> {
    return `stub: ${text}`;
  }
}

export const agentPlugin = {
  name: "agent",
  provide: ["chat"],
  async apply(ctx: Context): Promise<void> {
    await ctx.plugin(Chat);
  },
};
