// Classes, not interfaces: the @nestjs/swagger CLI plugin (nest-cli.json)
// reads them into the OpenAPI document, so the web app gets the same types.
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Nest's log levels; lines of other formats are mapped onto them. */
export const LOG_LEVELS = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'] as const;
export type LogLevelName = (typeof LOG_LEVELS)[number];

/** One log line (or one multi-line message, e.g. core's errors with stack). */
export class LogEntry {
  /** ms since epoch; null when the line carries no time */
  ts!: number | null;
  /** parsed from the line (Nest, JSON, Python logging); "log" when unknown */
  level!: LogLevelName;
  /** Nest context or logger name, e.g. "ModulesService" */
  context!: string | null;
  message!: string;
  /** the container stream it came from (null for core's own buffer) */
  stream!: 'stdout' | 'stderr' | null;
}

/** Something that writes logs: core itself or an installed module's container. */
export class LogSource {
  /** "core" or the module id */
  id!: string;
  label!: string;
  /** core = core's own Nest logger (in memory); container = podman logs */
  kind!: 'core' | 'container';
  /** podman container name */
  container!: string;
  /** container state (running, exited, missing, ...) */
  state!: string;
}

export class LogSources {
  sources!: LogSource[];
  /** why container logs can't be read (no podman socket), else null */
  containerError!: string | null;
}

export class LogPage {
  source!: string;
  /** false when the logs can't be read; see error */
  available!: boolean;
  error!: string | null;
  /** oldest first */
  entries!: LogEntry[];
}

export class LogsQuery {
  /** how many of the last lines (default 500, max 5000) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  tail?: number;
}

/** Socket.IO /logs `entries`: new lines of a followed source. */
export class LogBatch {
  source!: string;
  entries!: LogEntry[];
}

/** Socket.IO /logs `followError`: a followed source's stream failed or ended. */
export class LogFollowError {
  source!: string;
  message!: string;
}
