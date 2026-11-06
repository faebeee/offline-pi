import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { CliModule, COMMANDS, type CommandName } from "./cli.module.ts";
import type { Command } from "./command.ts";
import { c, CommandError, log, parseArgs } from "../common/terminal.ts";

const names = Object.keys(COMMANDS) as CommandName[];

function isCommand(value: string | undefined): value is CommandName {
  return !!value && names.includes(value as CommandName);
}

/**
 * CLI entrypoint: boots the Nest container without the HTTP server, resolves
 * the requested command and runs it.
 */
async function main(): Promise<void> {
  const [name, ...rest] = process.argv.slice(2);
  if (!isCommand(name)) {
    log(`usage: offline-maps <command> [options]\n\ncommands:\n${names.map((n) => `  ${n}`).join("\n")}`);
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(CliModule, { logger: false });
  try {
    const command = app.get<Command>(COMMANDS[name]);
    await command.run(parseArgs(rest));
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  if (!(err instanceof CommandError)) process.stderr.write(`${(err as Error).stack ?? ""}\n`);
  process.stderr.write(`${c.red("error")} ${message}\n`);
  process.exitCode = 1;
});
