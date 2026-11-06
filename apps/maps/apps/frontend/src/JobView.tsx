import { formatBytes, type Job } from "./api";

/** Progress bar + live log, shared by the download and setup flows. */
export function JobView({ job }: { job: Job }) {
  const percent = job.progress?.percent ?? 0;
  const tail = job.log.slice(-4);

  return (
    <div className="job">
      <div className="job-head">
        <span>{job.stage}</span>
        {job.progress && job.progress.total > 0 && (
          <span className="muted small tabular">
            {formatBytes(job.progress.bytes)} / {formatBytes(job.progress.total)}
          </span>
        )}
      </div>

      <div className="bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={job.progress ? "bar-fill" : "bar-fill indeterminate"}
          style={job.progress ? { width: `${percent}%` } : undefined}
        />
      </div>

      {tail.length > 0 && (
        <pre className="job-log">{tail.map(stripAnsi).join("\n")}</pre>
      )}
    </div>
  );
}

/** Service logs are written for a terminal; drop the colour codes. */
function stripAnsi(line: string): string {
  // eslint-disable-next-line no-control-regex
  return line.replace(/\x1b\[[0-9;]*m/g, "");
}
