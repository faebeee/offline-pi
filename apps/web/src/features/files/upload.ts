import { useCallback, useRef, useState } from "react";

/** Where a file's bytes live: core's passthrough to the files container. */
export const RAW_ROOT = "/svc/files/raw/";

/** "Photos/a b.jpg" -> "/svc/files/raw/Photos/a%20b.jpg" */
export function rawUrl(path: string): string {
  return RAW_ROOT + path.split("/").map(encodeURIComponent).join("/");
}

export function joinPath(folder: string, name: string): string {
  return folder ? `${folder}/${name}` : name;
}

export type Upload = {
  id: number;
  name: string;
  /** target path in the shared folder */
  path: string;
  size: number;
  sent: number;
  state: "queued" | "sending" | "done" | "failed" | "exists" | "cancelled";
  error?: string;
  /** replace a file of the same name */
  overwrite?: boolean;
  file: File;
};

let nextId = 1;

/**
 * Uploads to the shared folder, one at a time, with progress. A PUT of the
 * raw bytes through the passthrough (XMLHttpRequest, because fetch() can't
 * report upload progress); X-Pi-Monitor is the CSRF guard core asks for.
 */
export function useUploads(onDone: () => void) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const running = useRef<{ id: number; xhr: XMLHttpRequest } | null>(null);
  const queue = useRef<Upload[]>([]);
  const done = useRef(onDone);
  done.current = onDone;

  const patch = (id: number, p: Partial<Upload>) => setUploads((all) => all.map((u) => (u.id === id ? { ...u, ...p } : u)));

  const pump = useCallback(() => {
    if (running.current) return;
    const next = queue.current.shift();
    if (!next) return;
    const xhr = new XMLHttpRequest();
    running.current = { id: next.id, xhr };
    xhr.open("PUT", rawUrl(next.path) + (next.overwrite ? "?overwrite=true" : ""));
    xhr.setRequestHeader("X-Pi-Monitor", "1");
    xhr.upload.onprogress = (e) => patch(next.id, { sent: e.loaded });
    const finish = (p: Partial<Upload>) => {
      running.current = null;
      patch(next.id, p);
      done.current();
      pump();
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return finish({ state: "done", sent: next.size, error: undefined });
      let message = `HTTP ${xhr.status}`;
      try {
        const body = JSON.parse(xhr.responseText) as { detail?: unknown; message?: unknown };
        const m = body.detail ?? body.message;
        if (typeof m === "string") message = m;
      } catch {
        // not JSON
      }
      finish({ state: xhr.status === 409 ? "exists" : "failed", error: message });
    };
    xhr.onerror = () => finish({ state: "failed", error: "The connection to the Pi was lost." });
    xhr.onabort = () => finish({ state: "cancelled", error: undefined });
    patch(next.id, { state: "sending", sent: 0 });
    xhr.send(next.file);
  }, []);

  const add = useCallback(
    (files: File[], folder: string) => {
      const items: Upload[] = files.map((file) => ({
        id: nextId++,
        name: file.name,
        path: joinPath(folder, file.name),
        size: file.size,
        sent: 0,
        state: "queued",
        file,
      }));
      queue.current.push(...items);
      setUploads((all) => [...all.filter((u) => u.state !== "done"), ...items]);
      pump();
    },
    [pump],
  );

  /** Upload again, replacing the file that is there (after a 409). */
  const overwrite = useCallback(
    (u: Upload) => {
      const again: Upload = { ...u, state: "queued", sent: 0, error: undefined, overwrite: true };
      queue.current.push(again);
      setUploads((all) => all.map((x) => (x.id === u.id ? again : x)));
      pump();
    },
    [pump],
  );

  const cancel = useCallback((id: number) => {
    if (running.current?.id === id) {
      running.current.xhr.abort();
      return;
    }
    queue.current = queue.current.filter((u) => u.id !== id);
    patch(id, { state: "cancelled" });
  }, []);

  const clear = useCallback(() => setUploads((all) => all.filter((u) => u.state === "queued" || u.state === "sending")), []);

  return { uploads, add, overwrite, cancel, clear };
}
