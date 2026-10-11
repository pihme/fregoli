#!/usr/bin/env tsx
import { boot } from "./boot.ts";
import { version } from "./version.ts";

export function parseArgs(argv: string[]): {
  help: boolean;
  version: boolean;
  assistant: boolean;
  host?: string;
} {
  let host: string | undefined;
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === "--host" || arg.startsWith("--host=")) {
      const value = arg === "--host" ? argv[++i] : arg.slice("--host=".length);
      if (value) host = value;
      continue;
    }
    rest.push(arg);
  }
  return {
    help: rest.includes("--help") || rest.includes("-h"),
    version: rest.includes("--version"),
    assistant: rest.includes("--assistant"),
    host,
  };
}

export function helpText(): string {
  return `usage: fregoli [--help] [--version] [--assistant] [--host <addr>]

  --assistant   force the stock assistant UI for this start
  --host        listen address (default 127.0.0.1, or FREGOLI_HOST)
  --version     print version
`;
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(helpText());
    return 0;
  }
  if (args.version) {
    process.stdout.write(version + "\n");
    return 0;
  }
  const ctx = await boot({ forceAssistant: args.assistant, host: args.host });
  await new Promise<void>((resolve) => {
    const stop = () => {
      ctx.fiber.dispose().finally(() => resolve());
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
  return 0;
}

const isEntry =
  process.argv[1] &&
  (process.argv[1].endsWith("cli.ts") || process.argv[1].endsWith("fregoli"));

if (isEntry) {
  main().then(
    (code) => {
      if (code !== 0) process.exit(code);
    },
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
