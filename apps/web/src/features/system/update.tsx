import { getSystemUpdateQueryKey, useSystemCheckUpdate, useSystemUpdate, type UpdateStatus } from "@outpost/api-client";
import { ago, utcDate } from "@outpost/ui/outpost.js";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Dialog } from "../../app/Dialog";
import { useSocketEvent } from "../../app/realtime";
import { Markdown } from "../info/Markdown";
import { Banner, Icon } from "../../ui/outpost";
import { Kv } from "./parts";
import "./update.css";

/**
 * The update check's result (core asks GitHub once a day), kept current by
 * the /system event "update". Admins only: the system namespace and
 * /api/system/update refuse everyone else, so render its users only for
 * admins.
 */
export function useUpdateStatus() {
  const qc = useQueryClient();
  const query = useSystemUpdate({ query: { staleTime: 5 * 60_000, refetchOnWindowFocus: false } });
  useSocketEvent("/system", "update", (status) => qc.setQueryData(getSystemUpdateQueryKey(), status));
  return query;
}

/** "Later" hides the banner for one version, per browser. */
const DISMISS_KEY = "outpost-update-dismissed";
function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

const UPDATE_COMMAND = "./update.sh";

/** The release's notes, rendered like a docs page (its links stay text). */
function NotesDialog({ status, onClose }: { status: UpdateStatus; onClose: () => void }) {
  return (
    <Dialog title={`What's new in ${status.latest}`} onClose={onClose} scroll>
      {status.notes ? (
        <Markdown markdown={status.notes} file="07-changelog.md" entries={[]} />
      ) : (
        <p className="label">This release has no notes.</p>
      )}
      <p className="label">
        Install it on the Pi with <code>{UPDATE_COMMAND}</code> in the outpost folder.
      </p>
    </Dialog>
  );
}

/** Home: an info banner (caution when the release needs action) while a newer release exists. Admins only. */
export function UpdateBanner() {
  const { data } = useUpdateStatus();
  const [dismissed, setDismissed] = useState(readDismissed);
  const [notes, setNotes] = useState(false);
  if (!data?.available || !data.latest || dismissed === data.latest) return null;

  const later = () => {
    try {
      localStorage.setItem(DISMISS_KEY, data.latest!);
    } catch {
      /* storage unavailable: hidden until the next page load */
    }
    setDismissed(data.latest);
  };

  return (
    <>
      <Banner
        tone={data.actionNeeded ? "cau" : "info"}
        title={`outpost ${data.latest} is available`}
        action={
          <div className="update-actions">
            <button type="button" className="btn" onClick={() => setNotes(true)}>
              What's new
            </button>
            <button type="button" className="btn" onClick={later}>
              Later
            </button>
          </div>
        }
      >
        Installed: {data.installed ?? "unknown"}
        {data.releasedAt ? `. Released ${utcDate(data.releasedAt)}` : ""}
        {data.actionNeeded ? ". This release asks you to do something: read what's new first" : ""}. On the Pi, run{" "}
        <code>{UPDATE_COMMAND}</code>.
      </Banner>
      {notes && <NotesDialog status={data} onClose={() => setNotes(false)} />}
    </>
  );
}

/** System: the installed version, the newest release and "Check now". */
export function UpdateCard() {
  const qc = useQueryClient();
  const { data, error } = useUpdateStatus();
  const check = useSystemCheckUpdate({
    mutation: { onSuccess: (status) => qc.setQueryData(getSystemUpdateQueryKey(), status) },
  });
  const [notes, setNotes] = useState(false);
  const busy = check.isPending || !!data?.checking;

  let line: string;
  if (!data) line = error ? error.message : "Loading";
  else if (!data.enabled) line = "The update check is off (CORE_UPDATE_CHECK=false).";
  else if (data.available) line = `outpost ${data.latest} is available. On the Pi, run ${UPDATE_COMMAND}.`;
  else if (data.checkedAt && !data.latest) line = "No release published yet.";
  else if (data.checkedAt) line = "Up to date.";
  else line = "Not checked yet: it runs once a day while the Pi is online.";

  return (
    <article className="card">
      <div className="card-head">
        <h2 className="h2">Version</h2>
      </div>
      <p className="label">{line}</p>
      {data && (
        <Kv
          rows={[
            ["Installed", data.installed ?? "unknown"],
            ["Newest release", data.latest ? `${data.latest}${data.releasedAt ? ` (${utcDate(data.releasedAt)})` : ""}` : null],
            ["Last checked", data.enabled ? (data.checkedAt ? ago(data.checkedAt / 1000) : "never") : null],
            ["Last error", data.error],
          ]}
        />
      )}
      {check.error && <Banner tone="crit" title="Not checked">{check.error.message}</Banner>}
      <div className="update-actions">
        {data?.enabled && (
          <button type="button" className="btn" onClick={() => check.mutate()} disabled={busy}>
            <Icon name="refresh" />
            {busy ? "Checking" : "Check now"}
          </button>
        )}
        {data?.latest && data.notes && (
          <button type="button" className="btn" onClick={() => setNotes(true)}>
            {data.available ? "What's new" : "Release notes"}
          </button>
        )}
      </div>
      {notes && data && <NotesDialog status={data} onClose={() => setNotes(false)} />}
    </article>
  );
}
