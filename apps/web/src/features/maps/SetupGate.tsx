import { mapsSetup, type Job, type MapsStatus } from "@outpost/api-client";
import { useState } from "react";
import { Badge, Banner } from "../../ui/outpost";
import { JobView } from "./JobView";

type Props = {
  status: MapsStatus;
  job: Job | null;
  onJobStarted: (job: Job) => void;
};

/**
 * Shown until the backend can actually serve a map: the pmtiles binary has to
 * be installed and the fonts and sprites vendored. Replaces `npm run setup`.
 */
export function SetupGate({ status, job, onJobStarted }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const running = job?.type === "setup" && job.state === "running";

  async function start() {
    setBusy(true);
    setError(null);
    try {
      onJobStarted(await mapsSetup());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const todo = [
    { done: status.pmtiles.installed, label: "Extraction tool", meta: "PMTILES CLI" },
    {
      done: status.assets.fonts && status.assets.sprites,
      label: "Map fonts and sprites",
      meta: "GLYPHS · ICONS",
    },
    { done: status.catalog.ready, label: "Region catalog", meta: "GEOFABRIK INDEX" },
  ];

  const failed = job?.type === "setup" && job.state === "failed";

  return (
    <section className="setup card brackets" aria-labelledby="setup-title">
      <div className="card-head">
        <h2 id="setup-title" className="h2">
          One-time setup
        </h2>
        <Badge state="cau">Needs internet</Badge>
      </div>
      <p className="fg2">
        Offline maps needs a few files on disk before it can download regions. This runs once and
        needs an internet connection. After that, everything works offline.
      </p>

      <ul className="list">
        {todo.map((item) => (
          <li key={item.label}>
            <div className="row">
              <span className={`led ${item.done ? "led-ok" : "led-off"}`} aria-hidden="true" />
              <span className="row-main">
                <span className="row-title">{item.label}</span>
                <span className="row-meta">{item.meta}</span>
              </span>
              {item.done ? <Badge state="ok">Ready</Badge> : <Badge state="off">To do</Badge>}
            </div>
          </li>
        ))}
      </ul>

      {job?.type === "setup" && <JobView job={job} />}

      {failed && (
        <Banner tone="crit" title="Setup failed">
          {job.error} {setupHint(job.error)}
        </Banner>
      )}
      {error && (
        <Banner tone="crit" title="Could not start setup">
          {error}
        </Banner>
      )}

      <button
        type="button"
        className="btn btn-primary btn-block"
        onClick={start}
        disabled={busy || running}
      >
        {running ? "Setting up" : failed ? "Retry setup" : "Run setup"}
      </button>
    </section>
  );
}

/** What to try after a failed setup: the internet only when the error is about the network. */
function setupHint(error: string | null | undefined): string {
  const network = /fetch failed|ENOTFOUND|EAI_AGAIN|ECONN|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|socket|TLS|certificate|timed? ?out|HTTP 5\d\d|stream error/i;
  if (!error || network.test(error)) return "Check the internet connection and retry.";
  if (/ENOSPC/.test(error)) return "The drive is full: free space or move the map folders with ./install.sh, then retry.";
  if (/EACCES|EPERM|EROFS|ENOTEMPTY|EIO/.test(error)) {
    return "This is a problem with the map folders' drive, not the internet: open Diagnostics, then retry.";
  }
  return "See the maps log on the Logs screen, then retry.";
}
