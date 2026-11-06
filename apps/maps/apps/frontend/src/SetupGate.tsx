import { useState } from "react";
import { startSetup, type Job, type Status } from "./api";
import { JobView } from "./JobView";

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
    { done: status.pmtiles.installed, label: "pmtiles extraction tool" },
    { done: status.assets.fonts && status.assets.sprites, label: "map fonts and sprites" },
    { done: status.catalog.ready, label: "region catalog" },
  ];

  return (
    <div className="empty">
      <div className="empty-card">
        <h1>One-time setup</h1>
        <p>
          Offline Maps needs a few things on disk before it can download regions. This runs once
          and needs an internet connection.
        </p>

        <ul className="checklist">
          {todo.map((item) => (
            <li key={item.label} className={item.done ? "done" : undefined}>
              <span aria-hidden="true">{item.done ? "✓" : "•"}</span> {item.label}
            </li>
          ))}
        </ul>

        {running || job?.type === "setup" ? <JobView job={job} /> : null}
        {job?.state === "failed" && <p className="error small">{job.error}</p>}
        {error && <p className="error small">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="primary" onClick={start} disabled={busy || running}>
            {running ? "Setting up…" : job?.state === "failed" ? "Try again" : "Run setup"}
          </button>
        </div>
      </div>
    </div>
  );
}
