// The files domain's contract: a shared folder on the Pi. The files
// container (Python) speaks snake_case; infrastructure/files.client.ts maps
// it onto these classes. The bytes themselves go through core's passthrough:
// GET /svc/files/raw/<path> downloads, PUT uploads (X-Pi-Monitor: 1).
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class FilesStatus {
  /** bytes in the shared folder */
  usedBytes!: number;
  files!: number;
  folders!: number;
  /** bytes free on its disk, null when unknown */
  freeBytes!: number | null;
  /** largest file one upload may be (FILES_MAX_UPLOAD_MB) */
  maxUploadBytes!: number;
  /** uploads that would leave less than this free are refused (FILES_MIN_FREE_MB) */
  minFreeBytes!: number;
}

export class FileEntry {
  name!: string;
  /** relative to the shared folder, "/"-separated, e.g. "Photos/house.jpg" */
  path!: string;
  kind!: 'file' | 'folder';
  /** bytes; null for folders */
  size!: number | null;
  /** unix seconds */
  modified!: number;
  /** guessed from the name, null when unknown or a folder */
  mime!: string | null;
  /** folders: entries directly inside */
  items!: number | null;
  /** the passthrough URL of a file's bytes (null for folders) */
  url!: string | null;
}

export class FolderListing {
  /** the folder, "" for the top */
  path!: string;
  entries!: FileEntry[];
}

const PATH = /^[^\\\0]+$/;

export class CreateFolderRequest {
  /** the new folder, e.g. "Photos/2026" */
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  @Matches(PATH, { message: 'path may not contain backslashes' })
  path!: string;
}

export class MoveRequest {
  /** file or folder to move or rename */
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  @Matches(PATH, { message: 'from may not contain backslashes' })
  from!: string;

  /** its new path */
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  @Matches(PATH, { message: 'to may not contain backslashes' })
  to!: string;
}
