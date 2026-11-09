import { mapsJob, mapsJobs, type Job } from "@offline-pi/api-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSocket, useSocketEvent } from "../../app/realtime";
import { isJobFinished } from "./lib";

/**
 * Follows one maps job (download or setup) over core's /maps socket. Returns
 * the latest snapshot and `track` to switch to another job. A job survives a
 * page reload, so on load it reattaches to whatever still runs.
 */
export function useJob(enabled: boolean, onFinished?: (job: Job) => void) {
  const [job, setJob] = useState<Job | null>(null);
  const current = useRef<Job | null>(null);
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;
  const { socket, connected } = useSocket("/maps");

  /** Takes a snapshot of the tracked job, ignoring stale or foreign ones. */
  const apply = useCallback((next: Job) => {
    const prev = current.current;
    if (!prev || prev.id !== next.id) return;
    if (next.updatedAt < prev.updatedAt) return;
    current.current = next;
    setJob(next);
    if (!isJobFinished(prev) && isJobFinished(next)) finishedRef.current?.(next);
  }, []);

  const track = useCallback((next: Job | null) => {
    current.current = next;
    setJob(next);
  }, []);

  useSocketEvent("/maps", "job", apply);

  // Watch while the job runs; again after a reconnect (core forgets the room).
  const watchId = job && !isJobFinished(job) ? job.id : null;
  useEffect(() => {
    if (!socket || !connected || !watchId) return;
    socket.emit("watchJob", watchId);
    // core only forwards changes: catch up on what happened meanwhile
    mapsJob(watchId).then(apply, () => undefined);
    return () => {
      if (socket.connected) socket.emit("unwatchJob", watchId);
    };
  }, [socket, connected, watchId, apply]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    mapsJobs()
      .then(({ jobs }) => {
        const running = jobs.find((j) => !isJobFinished(j));
        if (running && !cancelled && !current.current) track(running);
      })
      .catch(() => {
        // the screen surfaces connection errors
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, track]);

  return { job, track };
}
