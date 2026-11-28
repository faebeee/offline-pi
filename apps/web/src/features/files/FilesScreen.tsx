import {
  filesCreateFolder,
  filesMove,
  filesRemove,
  getFilesListQueryKey,
  getFilesStatusQueryKey,
  useFilesList,
  useFilesStatus,
  type FileEntry,
} from "@outpost/api-client";
import { ago, bytes, toast } from "@outpost/ui/outpost.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useRef, useState, type DragEvent } from "react";
import { PromptDialog } from "../../app/Dialog";
import { Screen } from "../../app/Screen";
import { Badge, Banner, Icon, Illustration, Progress } from "../../ui/outpost";
import { ModuleGate } from "../modules/ModuleGate";
import { isRunning, useModule } from "../modules/useModules";
import { joinPath, useUploads, type Upload } from "./upload";
import "./files.css";

/** Files: a shared folder on the Pi for everyone on its network. */
export function FilesScreen({ path }: { path: string }) {
  const running = isRunning(useModule("files"));
  const status = useFilesStatus({ query: { enabled: running, refetchInterval: 30_000 } }).data;
  const context = status
    ? [
        `${status.files} ${status.files === 1 ? "file" : "files"}`,
        bytes(status.usedBytes),
        status.freeBytes != null ? `${bytes(status.freeBytes)} free` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : undefined;

  return (
    <Screen module="files" title="Shared files" context={running ? context : undefined}>
      <ModuleGate id="files">
        <Folder path={path} maxUpload={status?.maxUploadBytes ?? null} />
      </ModuleGate>
    </Screen>
  );
}

type Dialog = { kind: "folder" } | { kind: "rename"; entry: FileEntry } | null;

function Folder({ path, maxUpload }: { path: string; maxUpload: number | null }) {
  const qc = useQueryClient();
  const listing = useFilesList({ path: path || undefined }, { query: { refetchInterval: 15_000 } });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: getFilesListQueryKey() });
    void qc.invalidateQueries({ queryKey: getFilesStatusQueryKey() });
  };
  const { uploads, add, overwrite, cancel, clear } = useUploads(refresh);
  const input = useRef<HTMLInputElement>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dragging, setDragging] = useState(false);

  const change = useMutation({
    mutationFn: async (v: { kind: "folder"; name: string } | { kind: "rename"; entry: FileEntry; name: string }) => {
      if (v.kind === "folder") return filesCreateFolder({ path: joinPath(path, v.name) });
      const parent = v.entry.path.includes("/") ? v.entry.path.slice(0, v.entry.path.lastIndexOf("/")) : "";
      return filesMove({ from: v.entry.path, to: joinPath(parent, v.name) });
    },
    onSuccess: () => {
      setDialog(null);
      refresh();
    },
  });

  const remove = useMutation({
    mutationFn: (e: FileEntry) => filesRemove({ path: e.path }),
    onSuccess: (_, e) => toast(`${e.name} deleted.`),
    onSettled: refresh,
  });

  const pick = (files: FileList | null) => {
    if (!files?.length) return;
    const list = [...files];
    const big = maxUpload ? list.filter((f) => f.size > maxUpload) : [];
    if (big.length) toast(`${big.map((f) => f.name).join(", ")}: larger than the limit of ${bytes(maxUpload)}.`);
    add(
      list.filter((f) => !big.includes(f)),
      path,
    );
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files);
  };

  const confirmDelete = (e: FileEntry) => {
    const what =
      e.kind === "folder"
        ? `Delete the folder "${e.name}"${e.items ? ` and the ${e.items} ${e.items === 1 ? "item" : "items"} in it` : ""}? This can't be undone.`
        : `Delete "${e.name}"? This can't be undone.`;
    if (window.confirm(what)) remove.mutate(e);
  };

  const entries = listing.data?.entries ?? [];

  return (
    <div
      className={`files vstack${dragging ? " is-dragging" : ""}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <div className="files-bar">
        <Crumbs path={path} />
        <div className="files-buttons">
          <button type="button" className="btn" onClick={() => setDialog({ kind: "folder" })}>
            <Icon name="plus" />
            Folder
          </button>
          <button type="button" className="btn btn-primary" onClick={() => input.current?.click()}>
            <Icon name="download" className="i-up" />
            Upload
          </button>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              pick(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <Uploads uploads={uploads} onOverwrite={overwrite} onCancel={cancel} onClear={clear} />

      {listing.error && (
        <Banner
          tone={listing.error.status === 404 ? "info" : "crit"}
          title={listing.error.status === 404 ? "This folder is gone" : "Could not read the folder"}
          action={
            <Link to="/files" className="btn">
              Top folder
            </Link>
          }
        >
          {listing.error.message}
        </Banner>
      )}
      {remove.error && (
        <Banner tone="crit" title="Could not delete">
          {remove.error.message}
        </Banner>
      )}

      {listing.isSuccess && entries.length === 0 ? (
        <div className="empty">
          {path ? <Icon name="folder" /> : <Illustration name="files" />}
          <p className="empty-title">{path ? "This folder is empty" : "Nothing shared yet"}</p>
          <p>
            Upload photos, documents or scans here. Everyone on the Pi's network can open and download them, with no
            internet. Drop files on this page or press UPLOAD.
          </p>
        </div>
      ) : (
        <ul className="list files-list" aria-busy={listing.isFetching}>
          {entries.map((e) => (
            <li key={e.path}>
              <div className="row-actions">
                <EntryLink e={e} />
                {e.url && (
                  <a className="btn btn-icon" href={`${e.url}?download=true`} download={e.name} aria-label={`Download ${e.name}`} title="Download">
                    <Icon name="download" />
                  </a>
                )}
                <button
                  type="button"
                  className="btn btn-icon"
                  aria-label={`Rename ${e.name}`}
                  title="Rename"
                  onClick={() => setDialog({ kind: "rename", entry: e })}
                >
                  <Icon name="edit" />
                </button>
                <button
                  type="button"
                  className="btn btn-icon"
                  aria-label={`Delete ${e.name}`}
                  title="Delete"
                  disabled={remove.isPending}
                  onClick={() => confirmDelete(e)}
                >
                  <Icon name="trash" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {dragging && (
        <div className="files-drop" aria-hidden="true">
          <Icon name="download" className="i-up" />
          <span>Drop to upload to {path ? `"${path.split("/").pop()}"` : "the top folder"}</span>
        </div>
      )}

      {dialog?.kind === "folder" && (
        <PromptDialog
          title="New folder"
          label="Name"
          confirm="Create"
          maxLength={255}
          busy={change.isPending}
          error={change.error?.message}
          onDone={(name) => (name ? change.mutate({ kind: "folder", name }) : (setDialog(null), change.reset()))}
        />
      )}
      {dialog?.kind === "rename" && (
        <PromptDialog
          title={`Rename ${dialog.entry.kind}`}
          label="New name"
          initial={dialog.entry.name}
          confirm="Rename"
          maxLength={255}
          busy={change.isPending}
          error={change.error?.message}
          onDone={(name) =>
            name ? change.mutate({ kind: "rename", entry: dialog.entry, name }) : (setDialog(null), change.reset())
          }
        />
      )}
    </div>
  );
}

/** Top › Photos › 2026, each a link up. */
function Crumbs({ path }: { path: string }) {
  const parts = path ? path.split("/") : [];
  return (
    <nav className="files-crumbs" aria-label="Folder">
      <Link to="/files" className="btn btn-sm btn-ghost" aria-current={parts.length ? undefined : "page"}>
        <Icon name="folder" />
        Shared
      </Link>
      {parts.map((p, i) => {
        const to = parts.slice(0, i + 1).join("/");
        const last = i === parts.length - 1;
        return (
          <span key={to} className="files-crumb">
            <Icon name="chevron" />
            <Link to="/files" search={{ path: to }} className="btn btn-sm btn-ghost" aria-current={last ? "page" : undefined}>
              {p}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}

const KIND_MONO: [RegExp, string][] = [
  [/^image\//, "IMG"],
  [/^video\//, "VID"],
  [/^audio\//, "AUD"],
  [/pdf$/, "PDF"],
  [/^text\//, "TXT"],
  [/(zip|tar|gzip|7z|rar)/, "ZIP"],
];

function monogram(e: FileEntry): string {
  const ext = e.name.includes(".") ? e.name.split(".").pop()!.slice(0, 3).toUpperCase() : "";
  return KIND_MONO.find(([re]) => e.mime && re.test(e.mime))?.[1] ?? (ext || "FILE");
}

function EntryLink({ e }: { e: FileEntry }) {
  const meta =
    e.kind === "folder"
      ? [e.items == null ? null : `${e.items} ${e.items === 1 ? "item" : "items"}`, ago(e.modified)]
      : [bytes(e.size), ago(e.modified)];
  const body = (
    <>
      <span className="monogram" aria-hidden="true">
        {e.kind === "folder" ? <Icon name="folder" /> : monogram(e)}
      </span>
      <span className="row-main">
        <span className="row-title files-name">{e.name}</span>
        <span className="row-meta">{meta.filter(Boolean).join(" · ")}</span>
      </span>
    </>
  );
  if (e.kind === "folder") {
    return (
      <Link to="/files" search={{ path: e.path }} className="row has-mono">
        {body}
        <Icon name="chevron" />
      </Link>
    );
  }
  return (
    <a href={e.url ?? undefined} target="_blank" rel="noopener" className="row has-mono" title={`Open ${e.name}`}>
      {body}
    </a>
  );
}

function Uploads({
  uploads,
  onOverwrite,
  onCancel,
  onClear,
}: {
  uploads: Upload[];
  onOverwrite: (u: Upload) => void;
  onCancel: (id: number) => void;
  onClear: () => void;
}) {
  if (!uploads.length) return null;
  const active = uploads.filter((u) => u.state === "queued" || u.state === "sending").length;
  return (
    <section className="card files-uploads" aria-label="Uploads" aria-live="polite">
      <div className="card-head">
        <span className="label">{active ? `Uploading · ${active} left` : "Uploads"}</span>
        {!active && (
          <button type="button" className="btn btn-sm" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
      <ul className="files-upload-list">
        {uploads.map((u) => (
          <li key={u.id} className="files-upload">
            <div className="files-upload-head">
              <span className="files-name">{u.name}</span>
              <UploadBadge u={u} />
            </div>
            {u.state === "sending" && <Progress ratio={u.size ? u.sent / u.size : 0} />}
            <div className="files-upload-meta body-sm fg2">
              <span>{u.state === "sending" ? `${bytes(u.sent)} of ${bytes(u.size)}` : bytes(u.size)}</span>
              {u.error && <span>{u.error}</span>}
              <span className="files-upload-actions">
                {u.state === "exists" && (
                  <button type="button" className="btn btn-sm" onClick={() => onOverwrite(u)}>
                    Replace it
                  </button>
                )}
                {(u.state === "queued" || u.state === "sending") && (
                  <button type="button" className="btn btn-sm" onClick={() => onCancel(u.id)}>
                    Cancel
                  </button>
                )}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function UploadBadge({ u }: { u: Upload }) {
  switch (u.state) {
    case "queued":
      return <Badge state="info" className="badge-sm">Queued</Badge>;
    case "sending":
      return <Badge state="info" className="badge-sm is-busy">Uploading</Badge>;
    case "done":
      return <Badge state="ok" className="badge-sm">Done</Badge>;
    case "exists":
      return <Badge state="cau" className="badge-sm">Exists</Badge>;
    case "cancelled":
      return <Badge state="off" className="badge-sm">Cancelled</Badge>;
    default:
      return <Badge state="crit" className="badge-sm">Failed</Badge>;
  }
}
