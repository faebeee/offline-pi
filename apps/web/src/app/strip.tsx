import { useSystemSnapshot } from "@outpost/api-client";
import { statusStrip, type Strip } from "@outpost/ui/outpost.js";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { hostItems } from "../features/system/hostItems";

const POLL_MS = 5000;

/**
 * The status strip: the same on every screen and mounted across routes (one
 * clock). The LED is the link to core (`CORE · LIVE / CONNECTING /
 * OFFLINE`), then the host vitals (TEMP, VOLT, CPU, MEM, DISK) and the UTC
 * time. Screens don't add to it; their own state goes in their context line
 * or banners. Polls core's latest system snapshot over REST (the /system
 * socket's init history belongs to the System screen); paused in hidden tabs.
 */
export function StripProvider({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [strip, setStrip] = useState<Strip | null>(null);
  const bound = useRef(false);
  useEffect(() => {
    if (!ref.current || bound.current) return;
    bound.current = true;
    setStrip(statusStrip(ref.current));
  }, []);

  const { data, isError } = useSystemSnapshot({ query: { refetchInterval: POLL_MS, staleTime: POLL_MS / 2 } });
  const live = !!data && !isError;
  useEffect(() => {
    if (!strip) return;
    if (isError) strip.setLink("crit", "CORE · OFFLINE");
    else strip.setLink(data ? "ok" : "cau", data ? "CORE · LIVE" : "CORE · CONNECTING");
    // values only while core answers: nothing old, nothing invented
    strip.setHost(live ? hostItems(data) : []);
  }, [strip, data, isError, live]);

  return (
    <>
      <div ref={ref} />
      {children}
    </>
  );
}
