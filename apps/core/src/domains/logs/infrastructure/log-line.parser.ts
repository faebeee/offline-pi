import { LogEntry, LogLevelName, LOG_LEVELS } from '../domain/logs.dto';

/** Longest message kept per line; the rest is cut (a runaway line can't flood the Pi). */
const MAX_MESSAGE = 8 * 1024;

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

/** podman's `timestamps=true` prefix: RFC 3339 with nanoseconds. */
const PODMAN_TS = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(\.\d+)?(Z|[+-]\d\d:\d\d) /;

/** Nest's ConsoleLogger: `[Nest] 1  - 11/09/2026, 10:00:00 AM     LOG [Ctx] message +3ms` */
const NEST = /^\[Nest\]\s+\d+\s+-\s+.*?\s+(LOG|ERROR|WARN|DEBUG|VERBOSE|FATAL)\s+(?:\[([^\]]*)\]\s?)?(.*?)(?:\s\+\d+ms)?$/;

/** Python logging (mesh): `2026-11-09 10:00:00,123 INFO mesh: message` */
const PYTHON = /^\d{4}-\d\d-\d\d[ T][\d:.,]+\s+(DEBUG|INFO|WARNING|WARN|ERROR|CRITICAL)\s+([^:\s]+):\s?(.*)$/;

/** uvicorn and other `LEVEL: message` lines */
const LEVEL_PREFIX = /^(DEBUG|INFO|WARNING|WARN|ERROR|CRITICAL|FATAL):\s+(.*)$/;

const LEVEL_MAP: Record<string, LogLevelName> = {
  fatal: 'fatal',
  critical: 'fatal',
  error: 'error',
  err: 'error',
  warn: 'warn',
  warning: 'warn',
  log: 'log',
  info: 'log',
  notice: 'log',
  debug: 'debug',
  verbose: 'verbose',
  trace: 'verbose',
};

export function toLevel(value: unknown): LogLevelName {
  const key = String(value ?? '').toLowerCase();
  return LEVEL_MAP[key] ?? ((LOG_LEVELS as readonly string[]).includes(key) ? (key as LogLevelName) : 'log');
}

function cut(message: string): string {
  return message.length > MAX_MESSAGE ? `${message.slice(0, MAX_MESSAGE)} …[cut]` : message;
}

function parseTs(line: string): { ts: number | null; rest: string } {
  const m = PODMAN_TS.exec(line);
  if (!m) return { ts: null, rest: line };
  // Date.parse wants at most milliseconds
  const ms = m[2] ? m[2].slice(0, 4) : '';
  const ts = Date.parse(`${m[1]}${ms}${m[3]}`);
  return { ts: Number.isNaN(ts) ? null : ts, rest: line.slice(m[0].length) };
}

/** Nest's JSON logger (`json: true`) and other JSON-lines loggers. */
function parseJson(text: string): Pick<LogEntry, 'level' | 'context' | 'message'> | null {
  if (!text.startsWith('{')) return null;
  try {
    const obj = JSON.parse(text) as Record<string, unknown>;
    const message = obj.message ?? obj.msg;
    if (message === undefined) return null;
    const stack = typeof obj.stack === 'string' ? `\n${obj.stack}` : '';
    return {
      level: toLevel(obj.level ?? obj.severity),
      context: typeof obj.context === 'string' ? obj.context : typeof obj.name === 'string' ? obj.name : null,
      message: (typeof message === 'string' ? message : JSON.stringify(message)) + stack,
    };
  } catch {
    return null;
  }
}

/**
 * Turns raw container log lines into LogEntry. Understands Nest's console
 * and JSON output (core, maps), Python logging (mesh) and `LEVEL:` prefixes;
 * anything else is level "log". Continuation lines (stack traces, indented
 * output, or any unparsed line right after an error, like the stack Nest
 * prints below an ERROR line) take the level and context of the line before
 * them, per stream, so filtering by level keeps a stack trace with its error.
 */
export function createLineParser() {
  const last: Record<string, Pick<LogEntry, 'level' | 'context' | 'ts'>> = {};

  return (raw: string, stream: 'stdout' | 'stderr'): LogEntry => {
    const { ts, rest } = parseTs(raw);
    const text = rest.replace(ANSI, '').replace(/\r$/, '');
    let parsed: Pick<LogEntry, 'level' | 'context' | 'message'> | null = parseJson(text);

    if (!parsed) {
      let m = NEST.exec(text);
      if (m) parsed = { level: toLevel(m[1]), context: m[2] || null, message: m[3] };
      else if ((m = PYTHON.exec(text))) parsed = { level: toLevel(m[1]), context: m[2], message: m[3] };
      else if ((m = LEVEL_PREFIX.exec(text))) parsed = { level: toLevel(m[1]), context: null, message: m[2] };
    }

    if (!parsed) {
      const prev = last[stream];
      const indented = /^(\s|at\s|Traceback|Caused by|During handling)/.test(text);
      const afterError =
        !!prev && (prev.level === 'error' || prev.level === 'fatal') && ts !== null && prev.ts !== null && ts - prev.ts <= 100;
      const continuation = !!prev && (indented || afterError);
      parsed = { level: continuation ? prev.level : 'log', context: continuation ? prev.context : null, message: text };
      last[stream] = continuation ? { ...prev, ts: ts ?? prev.ts } : { level: 'log', context: null, ts };
    } else {
      last[stream] = { level: parsed.level, context: parsed.context, ts };
    }

    return { ts, level: parsed.level, context: parsed.context, message: cut(parsed.message), stream };
  };
}
