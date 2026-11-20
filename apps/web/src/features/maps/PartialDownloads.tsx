import {
  mapsDiscardDownload,
  mapsResumeDownload,
  type Job,
  type PartialDownload,
} from "@outpost/api-client";
import { bytes } from "@outpost/ui/outpost.js";
import { useState } from "react";
import { Badge, Banner, HoldButton, Icon } from "../../ui/outpost";
import { amount } from "./JobView";

const REASON: Record<PartialDownload["reason"], string> = {
  paused: "Paused",
  failed: "Failed",
  interrupted: "Interrupted",
};

/**
 * Region downloads that did not finish (paused, failed, cut off by a
 * restart). What they fetched is kept: RESUME goes on from there, the
 * trash button deletes it.
 */
export function PartialDownloads({
  downloads,
  busy,
  onResumed,
  onChanged,
}: {
  downloads: PartialDownload[];
  /** another download runs: only one at a time */
  busy: boolean;
  onResumed: (job: Job) => void;
  onChanged: () => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (downloads.length === 0) return null;

  async function run(name: string, fn: () => Promise<void>) {
    setPending(name);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(null);
      onChanged();
    }
  }

  const resume = (d: PartialDownload) =>
    run(d.name, async () => {
      onResumed(await mapsResumeDownload(d.name));
    });

  const discard = (d: PartialDownload) =>
    run(d.name, async () => {
      setConfirming(null);
      await mapsDiscardDownload(d.name);
    });

  return (
    <>
      <p className="label">Unfinished downloads · {downloads.length}</p>
      {error && (
        <Banner tone="crit" title="Request failed">
          {error}
        </Banner>
      )}
      <ul className="list">
        {downloads.map((d) => (
          <li key={d.name}>
            <div className="row-actions">
              <div className="row">
                <span className="row-main">
                  <span className="row-title">{d.label}</span>
                  <span className="row-meta">
                    Z{d.minzoom}–{d.maxzoom} · {amount(d.downloadedBytes, d.estimate.transferBytes)}
                  </span>
                </span>
                <Badge state={d.reason === "failed" ? "crit" : "cau"}>{REASON[d.reason]}</Badge>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => void resume(d)}
                disabled={busy || pending === d.name}
                title={busy ? "Another download is running" : undefined}
              >
                Resume
              </button>
              <button
                type="button"
                className="btn btn-icon"
                aria-label={confirming === d.name ? `Keep ${d.label}` : `Cancel the download of ${d.label}`}
                aria-expanded={confirming === d.name}
                onClick={() => setConfirming(confirming === d.name ? null : d.name)}
              >
                <Icon name={confirming === d.name ? "close" : "trash"} />
              </button>
            </div>
            {d.error && <p className="help">{d.error}</p>}
            {confirming === d.name && (
              <div className="region-confirm">
                <p className="help">
                  Deletes the {bytes(d.downloadedBytes)} downloaded so far. Starting again downloads everything anew.
                </p>
                <HoldButton label={`Cancel ${d.label}`} onConfirm={() => void discard(d)} className="btn-block" />
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
