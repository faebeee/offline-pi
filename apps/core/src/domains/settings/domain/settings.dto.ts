// Classes, not interfaces: the @nestjs/swagger CLI plugin (nest-cli.json)
// reads them into the OpenAPI document, so the web app gets the same types.

/** One variable of .env, with what .env.example says about it. */
export class SettingVar {
  key!: string;
  /** the value in effect; null when unset or secret (see `secret`) */
  value!: string | null;
  /** true when the value is non-empty */
  isSet!: boolean;
  /** a PIN, password, token or URL with credentials: the value is never sent */
  secret!: boolean;
  /** the value in .env.example; null when the variable isn't documented there */
  defaultValue!: string | null;
  /** the comment above it in .env.example, '' if none */
  description!: string;
  /** true when the value differs from .env.example's */
  changed!: boolean;
}

/** One block of .env.example ("core", "maps", ...), or "other" for the rest. */
export class SettingSection {
  /** the block's name in .env.example, e.g. "maps"; "other" for variables only in .env */
  id!: string;
  /** the module's label when the block belongs to a module, else the id */
  title!: string;
  /** module id when the block belongs to a module, else null */
  module!: string | null;
  /** false for an optional module not in MODULES */
  installed!: boolean;
  vars!: SettingVar[];
}

/** One *_DIR variable: where the data is and what drive it is on. */
export class SettingPath {
  key!: string;
  /** module id from its section, null for core-wide dirs */
  module!: string | null;
  /** false when its module is not installed */
  installed!: boolean;
  /** first sentence of its .env.example comment */
  description!: string;
  /** the value as written in .env (may be relative to the project folder) */
  value!: string;
  /** absolute path on the Pi; null when it can't be resolved */
  hostPath!: string | null;
  /** the directory exists (false: drive not mounted, or never created) */
  exists!: boolean;
  /** block device of the filesystem it is on, e.g. /dev/sda1 */
  device!: string | null;
  fsType!: string | null;
  /** where that filesystem is mounted, e.g. /media/Data */
  mountPoint!: string | null;
  /** size of that filesystem in bytes */
  totalBytes!: number | null;
  /** free space on it for unprivileged users, in bytes */
  freeBytes!: number | null;
}

export class SettingsOverview {
  /** the project folder (git checkout) on the Pi; null when unknown */
  project!: string | null;
  /** where the values come from: the .env file itself or core's environment */
  source!: 'env-file' | 'environment';
  /** path of the .env file on the Pi; null when it couldn't be read */
  envFile!: string | null;
  /** the app's version (root package.json); null if unknown */
  version!: string | null;
  sections!: SettingSection[];
  paths!: SettingPath[];
}

/** Disk usage of one *_DIR. */
export class SettingPathSize {
  key!: string;
  /** bytes used on disk (like du); null when the directory can't be read */
  bytes!: number | null;
  /** files counted */
  files!: number;
  /** false when the walk stopped at its time or file limit (bytes is then a lower bound) */
  complete!: boolean;
  /** when it was measured (ISO 8601) */
  measuredAt!: string;
}

export class SettingsSizes {
  sizes!: SettingPathSize[];
}
