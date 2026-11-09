import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import { inspect } from 'node:util';
import { coreLogBuffer, LogBuffer } from './log-buffer';

/** Most verbose first, as Nest orders them. */
const LEVELS: LogLevel[] = ['verbose', 'debug', 'log', 'warn', 'error', 'fatal'];

/**
 * CORE_LOG_LEVEL (verbose, debug, log, warn, error, fatal): the least severe
 * level core logs. Default "log", as before.
 */
export function coreLogLevels(value = process.env.CORE_LOG_LEVEL): LogLevel[] {
  const min = LEVELS.indexOf((value ?? '').trim().toLowerCase() as LogLevel);
  return LEVELS.slice(min < 0 ? LEVELS.indexOf('log') : min);
}

function text(message: unknown): string {
  if (typeof message === 'string') return message;
  if (message instanceof Error) return message.stack ?? message.message;
  return inspect(message, { depth: 4, breakLength: Infinity, compact: true });
}

/**
 * Nest's ConsoleLogger (same console output, so `podman logs` and
 * `./manage.sh logs core` stay as they were) that also records every line it
 * prints into a LogBuffer, for the logs screen. Set as the app logger in
 * main.ts, so every `new Logger(Context)` in core goes through it.
 */
export class CoreLogger extends ConsoleLogger {
  constructor(private readonly buffer: LogBuffer = coreLogBuffer) {
    super({ logLevels: coreLogLevels() });
  }

  protected override printMessages(
    messages: unknown[],
    context = '',
    logLevel: LogLevel = 'log',
    writeStreamType?: 'stdout' | 'stderr',
    errorStack?: unknown,
    params?: Record<string, unknown>,
  ): void {
    super.printMessages(messages, context, logLevel, writeStreamType, errorStack, params);
    const ts = Date.now();
    const stack = typeof errorStack === 'string' && errorStack ? `\n${errorStack}` : '';
    messages.forEach((m, i) => {
      this.buffer.push({
        ts,
        level: logLevel,
        context: context || null,
        message: text(m) + (i === messages.length - 1 ? stack : ''),
      });
    });
  }
}
