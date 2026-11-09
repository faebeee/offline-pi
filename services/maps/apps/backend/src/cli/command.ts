import type { Args } from "../common/terminal.ts";

/** A CLI command resolved out of the Nest application context. */
export abstract class Command {
  abstract run(args: Args): Promise<void>;
}
