import { getLogsEntriesQueryKey, useLogsEntries, type LogBatch, type LogEntry, type LogPage } from "@outpost/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSocket, useSocketEvent } from "../../app/realtime";

/** Lines kept in the browser per source; older ones drop off the top. */
export const MAX_LINES = 5000;

export type FollowState = "connecting" | "live" | "paused" | "ended";

/**
 * One source's log: the last `tail` lines from core's API, then every new
 * line over the /logs socket (`follow`), appended to the same Query cache
 * entry. After a reconnect or a resume it reloads, so nothing is missed.
 */
export function useLogs(source: string, tail: number, paused: boolean) {
  const qc = useQueryClient();
  const params = { tail };
  const key = getLogsEntriesQueryKey(source, params);
  const query = useLogsEntries(source, params, { query: { staleTime: Infinity, refetchOnWindowFocus: false } });
  const { socket, connected } = useSocket("/logs");
  const [ended, setEnded] = useState<{ source: string; message: string } | null>(null);
  const [epoch, setEpoch] = useState(0);

  useSocketEvent("/logs", "entries", (batch: LogBatch) => {
    if (batch.source !== source) return;
    qc.setQueryData<LogPage>(key, (prev) =>
      prev ? { ...prev, entries: [...prev.entries, ...batch.entries].slice(-MAX_LINES) } : prev,
    );
  });
  useSocketEvent("/logs", "followError", (err) => {
    if (err.source === source) setEnded(err);
  });

  const { refetch } = query;
  const canFollow = query.data?.available === true;
  useEffect(() => {
    if (!socket || !connected || paused || !canFollow) return;
    setEnded(null);
    socket.emit("follow", source);
    return () => {
      if (socket.connected) socket.emit("unfollow", source);
    };
  }, [socket, connected, paused, canFollow, source, epoch]);

  // reconnected or resumed: catch up on lines missed meanwhile (not on the first connect)
  const active = connected && !paused;
  const wasActive = useRef<boolean | null>(null);
  useEffect(() => {
    if (active && wasActive.current === false) void refetch();
    if (active || wasActive.current !== null) wasActive.current = active;
  }, [active, refetch]);

  /** Follow again after the stream ended (e.g. the container was restarted). */
  const resume = useCallback(() => {
    setEnded(null);
    void refetch().then(() => setEpoch((n) => n + 1));
  }, [refetch]);

  const endedHere = ended?.source === source ? ended.message : null;
  const state: FollowState = paused
    ? "paused"
    : endedHere
      ? "ended"
      : connected && canFollow
        ? "live"
        : "connecting";

  return {
    page: query.data,
    entries: (query.data?.entries ?? []) as LogEntry[],
    isLoading: query.isLoading,
    error: query.error as Error | null,
    state,
    endedMessage: endedHere,
    refetch,
    resume,
  };
}
