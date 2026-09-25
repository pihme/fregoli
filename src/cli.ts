#!/usr/bin/env tsx
import { boot } from "./boot.ts";
import { version } from "./version.ts";

export function parseArgs(argv: string[]): {
  help: boolean;
  version: boolean;
  assistant: boolean;
} {
  return {
    help: argv.includes("--help") || argv.includes("-h"),
    version: argv.includes("--version"),
    assistant: argv.includes("--assistant"),
  };
}

export function helpText(): string {
  return `usage: fregoli [--help] [--version] [--assistant]
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
  const ctx = await boot({ forceAssistant: args.assistant });
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
