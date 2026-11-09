import { useState } from "react";
import { startSetup, type Job, type Status } from "./api";
import { JobView } from "./JobView";
import { Badge, Banner } from "./ui";

type Props = {
  status: Status;
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
      onJobStarted(await startSetup());
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
          {job.error} Check the internet connection and retry.
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
