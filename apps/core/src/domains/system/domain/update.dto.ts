// The update check's contract: whether a newer release of outpost exists
// (application/update.service.ts asks GitHub's /releases/latest).

export class UpdateStatus {
  /** the installed version (root package.json), e.g. "0.1.0"; null if unknown */
  installed!: string | null;
  /** the newest release, e.g. "0.2.0"; null before the first successful check or without releases */
  latest!: string | null;
  /** a release newer than the installed version exists */
  available!: boolean;
  /** when that release was published (ms since epoch) */
  releasedAt!: number | null;
  /** its notes (Markdown): the version's changelog section */
  notes!: string | null;
  /** its page on GitHub */
  url!: string | null;
  /** the notes ask the person running outpost to do something (a line starting with "Action needed:") */
  actionNeeded!: boolean;
  /** the last check that reached GitHub (ms since epoch) */
  checkedAt!: number | null;
  /** the last attempt, successful or not (ms since epoch) */
  attemptedAt!: number | null;
  /** why the last attempt failed; null when it worked */
  error!: string | null;
  /** false when CORE_UPDATE_CHECK=false */
  enabled!: boolean;
  /** a check is running now */
  checking!: boolean;
}
