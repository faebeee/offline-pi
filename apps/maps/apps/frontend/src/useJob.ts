import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJobs, isJobFinished, subscribeToJob, type Job } from "./api";

/**
 * Follows one job over SSE. Returns the latest snapshot and a `track` function
 * to switch to another job.
 */
export function useJob(onFinished?: (job: Job) => void) {
  const [job, setJob] = useState<Job | null>(null);
  const unsubscribe = useRef<(() => void) | undefined>(undefined);
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;

  const track = useCallback((next: Job | null) => {
    unsubscribe.current?.();
    unsubscribe.current = undefined;
    setJob(next);
    if (!next || isJobFinished(next)) return;

    unsubscribe.current = subscribeToJob(next.id, (update) => {
      setJob(update);
      if (isJobFinished(update)) finishedRef.current?.(update);
    });
  }, []);

  // A download survives a page reload, so reattach to whatever is still running.
  useEffect(() => {
    let cancelled = false;
    fetchJobs()
      .then((jobs) => {
        const running = jobs.find((j) => !isJobFinished(j));
        if (running && !cancelled) track(running);
      })
      .catch(() => {
        // no backend yet; the rest of the app surfaces that
      });
    return () => {
      cancelled = true;
    };
  }, [track]);

  useEffect(() => () => unsubscribe.current?.(), []);

  return { job, track };
}
