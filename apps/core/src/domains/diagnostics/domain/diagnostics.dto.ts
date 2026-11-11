// Classes, not interfaces: the @nestjs/swagger CLI plugin reads them into
// the OpenAPI document (AGENTS.md "Core: domains").

export class DiagCheck {
  /** stable id, e.g. module:maps or dir:MAPS_DATA_DIR */
  id!: string;
  group!: 'setup' | 'modules' | 'storage' | 'host';
  title!: string;
  /** ok = fine, info = worth knowing, warn = will cause trouble, fail = broken now */
  status!: 'ok' | 'info' | 'warn' | 'fail';
  /** one line: what was found */
  summary!: string;
  /** the findings behind it (one per line), or null */
  details!: string[];
  /** what to do about it, or null when nothing is needed */
  fix!: string | null;
  /** module id the check is about, or null */
  module!: string | null;
}

export class DiagCounts {
  ok!: number;
  info!: number;
  warn!: number;
  fail!: number;
}

export class DiagnosticsReport {
  /** ISO time the checks ran */
  checkedAt!: string;
  durationMs!: number;
  version!: string | null;
  hostname!: string | null;
  counts!: DiagCounts;
  checks!: DiagCheck[];
}
