import { bytes } from "@offline-pi/ui/outpost.js";
import type { Job } from "./api";
import { Progress } from "./ui";

/** Progress bar + live log, shared by the download and setup flows. */
export function JobView({ job }: { job: Job }) {
  const p = job.progress;
  const percent = p?.percent ?? 0;
  const tail = job.log.slice(-4);

  let readout = "";
  if (p && p.total > 0) readout = `${Math.round(percent)}% · ${amount(p.bytes, p.total)}`;
  else if (p) readout = `${Math.round(percent)}%`;

  return (
    <div className="job">
      <div className="progress-head">
        <span className="label">{job.stage}</span>
        {readout && <span className="data body-sm">{readout}</span>}
      </div>
      <Progress ratio={percent / 100} />
      {tail.length > 0 && <pre className="job-log">{tail.map(stripAnsi).join("\n")}</pre>}
    </div>
  );
}

/** "1.4 / 2.3 GB": the unit once when both sides share it. */
function amount(done: number, total: number): string {
  const a = bytes(done);
  const b = bytes(total);
  const unitA = a.split(" ")[1];
  const unitB = b.split(" ")[1];
  return unitA === unitB ? `${a.split(" ")[0]} / ${b}` : `${a} / ${b}`;
}

/** Service logs are written for a terminal; drop the colour codes. */
function stripAnsi(line: string): string {
  // eslint-disable-next-line no-control-regex
  return line.replace(/\x1b\[[0-9;]*m/g, "");
}
