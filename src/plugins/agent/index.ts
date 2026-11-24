import { fileURLToPath } from "node:url";
import type { ChildProcess } from "node:child_process";
import type { Context } from "cordis";
import { Service } from "cordis";
import { version } from "../../version.ts";
import { AcpClient, FREGOLI_RULES, type McpServerSpec } from "./acp.ts";
import {
  agentLaunch,
  makeOpenCodeHome,
  missingModelEndpoint,
  modelEndpointFromEnv,
  openCodeChildEnv,
  removeOpenCodeHome,
  spawnAcpAgent,
  whichOpenCode,
  type ModelEndpoint,
} from "./opencode.ts";

declare module "cordis" {
  interface Context {
    chat: Chat;
  }
}

export type ChatLive = {
  id: number;
  lines: string[];
  text: string | null;
  done: boolean;
};

export class Chat extends Service {
  child: ChildProcess | null = null;
  /** Set when OpenCode is installed but the model endpoint is not configured. */
  blocked: string | null = null;
  acp: AcpClient | null = null;
  promptTimeoutMs = 300_000;
  restart: (() => Promise<void>) | null = null;
  private turnId = 0;
  private lines: string[] = [];
  private text: string | null = null;
  private done = true;
  private recording = false;

  constructor(ctx: Context) {
    super(ctx, "chat");
  }

  live(): ChatLive {
    return {
      id: this.turnId,
      lines: this.lines.slice(),
      text: this.text,
      done: this.done,
    };
  }

  private note(line: string): void {
    if (!this.recording || !line) return;
    this.lines.push(line);
  }

  private canvasHtml(): string {
    const ui = this.ctx.get("ui", true) as { canvasInner?: string } | undefined;
    return ui?.canvasInner ?? "";
  }

  /** A canvas edit during this reply becomes one reload when the reply finishes. */
  private holdCanvasReload(before: string): void {
    if (this.canvasHtml() === before) return;
    const bridge = this.ctx.get("pageBridge", true) as { requestReload?: () => void } | undefined;
    bridge?.requestReload?.();
  }

  async reply(text: string): Promise<string> {
    const before = this.canvasHtml();
    this.turnId += 1;
    this.lines = [];
    this.text = null;
    this.done = false;
    this.recording = true;
    try {
      const out = this.blocked
        ? this.blocked
        : this.acp
          ? await this.acp.prompt(text, this.promptTimeoutMs, (line) => this.note(line))
          : `stub: ${text}`;
      this.recording = false;
      this.holdCanvasReload(before);
      this.text = out;
      this.done = true;
      return out;
    } catch (err) {
      this.recording = false;
      if (String(err).includes("ACP timeout") && this.restart) {
        try {
          await this.restart();
        } catch {
          /* the next message starts a fresh agent */
        }
      }
      const message = `agent error: ${String(err)}`;
      this.holdCanvasReload(before);
      this.text = message;
      this.done = true;
      return message;
    }
  }
}

export type AgentConfig = {
  appRoot?: string;
  origin?: string;
  acp?: boolean;
  acpCommand?: string;
  acpArgs?: string[];
  promptTimeoutMs?: number;
  acpHang?: boolean;
  acpPauseMs?: number;
  /** Model endpoint. `null` forces the missing-endpoint reply. Omit to read the environment. */
  model?: ModelEndpoint | null;
  /** System prompt for the in-app session. Defaults to FREGOLI_RULES. */
  rules?: string;
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
    const spawnEnv: NodeJS.ProcessEnv = {};
    if (config.acpHang) spawnEnv.FAKE_ACP_HANG = "1";
    if (config.acpPauseMs) spawnEnv.FAKE_ACP_PAUSE_MS = String(config.acpPauseMs);
    const mcpPath = fileURLToPath(new URL("../../mcp.ts", import.meta.url));
    const mcpServers: McpServerSpec[] = config.origin
      ? [
          {
            name: "fregoli",
            command: process.execPath,
            args: ["--import", "tsx", mcpPath],
            env: { FREGOLI_URL: config.origin, FREGOLI_VERSION: version },
          },
        ]
      : [];
    if (config.promptTimeoutMs) chat.promptTimeoutMs = config.promptTimeoutMs;
    const endpoint = config.model !== undefined ? config.model : modelEndpointFromEnv();
    const launch = agentLaunch(config.acpCommand, whichOpenCode(), endpoint);
    if (launch === "stub") return;
    if (launch === "blocked") {
      chat.blocked = missingModelEndpoint;
      return;
    }

    // A stand-in command (the tests) does not get OpenCode's config. The real
    // child gets an isolated OpenCode 2 home so the operator's global config,
    // skills, and AGENTS.md are not part of the in-app session.
    let env: NodeJS.ProcessEnv | undefined;
    if (config.acpCommand || !endpoint) {
      if (Object.keys(spawnEnv).length) env = { ...process.env, ...spawnEnv };
    } else {
      const home = makeOpenCodeHome();
      env = openCodeChildEnv(config.rules ?? FREGOLI_RULES, endpoint, home, spawnEnv);
      ctx.effect(() => () => removeOpenCodeHome(home), "opencode.home");
    }
    const spawnOpts = {
      cwd: appRoot,
      command: config.acpCommand,
      args: config.acpArgs,
      env,
    };

    const connect = async (child: ChildProcess): Promise<void> => {
      chat.child = child;
      const acp = new AcpClient(child);
      await acp.start({ cwd: appRoot, mcpServers });
      chat.acp = acp;
    };

    chat.restart = async () => {
      chat.acp = null;
      const child = spawnAcpAgent(ctx, spawnOpts);
      chat.child = child;
      if (!child) return;
      await connect(child);
    };

    const child = spawnAcpAgent(ctx, spawnOpts);
    if (!child) return;
    await connect(child);
  },
};

export { whichOpenCode, modelEndpointFromEnv };

