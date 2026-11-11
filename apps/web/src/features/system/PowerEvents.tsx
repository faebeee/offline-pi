import type { PowerEvent } from "@outpost/api-client";
import { STATUS, utcDateTime } from "@outpost/ui/outpost.js";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../../ui/outpost";
import { SmBadge } from "./parts";

/** Events shown on the card; the rest are in the dialog. */
const ON_CARD = 5;

const EVENT_TEXT: Record<string, [string, string, "crit" | "cau"]> = {
  "under-voltage": ["Under-voltage", "cleared", "crit"],
  throttled: ["CPU throttled", "ended", "crit"],
  "freq-capped": ["Frequency capped", "ended", "cau"],
  "soft-temp-limit": ["Soft temperature limit", "ended", "cau"],
};

function EventList({ events }: { events: PowerEvent[] }) {
  return (
    <ul className="list">
      {events.length ? (
        events.map((e, i) => {
          const [name, endWord, tone] = EVENT_TEXT[e.kind] ?? [e.kind, "ended", "cau"];
          const tn = e.active ? tone : "ok";
          return (
            <li key={`${e.t}-${e.kind}-${i}`}>
              <div className="row static">
                <Icon name={STATUS[tn].icon} className={`i-${tn}`} />
                <div className="row-main">
                  <span className="row-title">
                    {name}
                    {e.active ? "" : ` ${endWord}`}
                  </span>
                  <span className="row-meta">{utcDateTime(e.t)}</span>
                </div>
                <span className="row-value">
                  <SmBadge tone={tn}>{e.active ? "Started" : endWord}</SmBadge>
                </span>
              </div>
            </li>
          );
        })
      ) : (
        <li>
          <div className="row static">
            <span className="row-main fg2 body-sm">No events recorded.</span>
          </div>
        </li>
      )}
    </ul>
  );
}

/**
 * The Power events card: the newest five changes of the firmware's
 * under-voltage and throttling flags; ALL opens a dialog with every recorded
 * event (core keeps the last 200).
 */
export function PowerEventsCard({ events }: { events: PowerEvent[] }) {
  const [open, setOpen] = useState(false);
  const newest = [...events].reverse();
  return (
    <article className="card">
      <div className="card-head">
        <h2 className="h2">Power events</h2>
        {events.length > ON_CARD && (
          <button type="button" className="btn btn-sm" aria-haspopup="dialog" onClick={() => setOpen(true)}>
            All · {events.length}
          </button>
        )}
      </div>
      <p className="help">
        Changes of the firmware's under-voltage and throttling flags, newest first
        {events.length > ON_CARD ? ` (latest ${ON_CARD} of ${events.length})` : ""}.
      </p>
      <EventList events={newest.slice(0, ON_CARD)} />
      {open && <PowerEventsDialog events={newest} onClose={() => setOpen(false)} />}
    </article>
  );
}

function PowerEventsDialog({ events, onClose }: { events: PowerEvent[]; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="dialog dialog-scroll"
      aria-labelledby="sys-events-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // a click on the backdrop lands on the <dialog> itself
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="dialog-head">
        <h2 className="h2" id="sys-events-title">
          Power events
        </h2>
        <span className="label">{events.length} recorded</span>
        <button type="button" className="btn btn-icon" aria-label="Close" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div className="dialog-body">
        <p className="help">Every recorded change of the under-voltage and throttling flags, newest first. Times in UTC.</p>
        <EventList events={events} />
      </div>
    </dialog>
  );
}
