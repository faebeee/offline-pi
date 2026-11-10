import type { MeshMessage } from "@outpost/api-client";
import { ago, utcDate, utcTime } from "@outpost/ui/outpost.js";
import { Fragment, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { Icon } from "../../ui/outpost";
import { BROADCAST, dividerLabel, hex, hopsText, parseConv, type Names } from "./format";
import { meshUi } from "./store";
import { flatten, useMessages } from "./useMesh";

function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <Icon name="message" />
      <p className="empty-title">{title}</p>
      <p>{children}</p>
    </div>
  );
}

/** Delivery state of a sent message: fixed status shape + word. */
function Delivery({ m, onRetry, disabled }: { m: MeshMessage; onRetry: () => void; disabled: boolean }) {
  const broadcast = m.toNum === BROADCAST;
  switch (m.status) {
    case "pending":
      return (
        <span className="msg-state" title="Handing the message to the radio">
          <Icon name="info" className="i-xs" />
          SENDING
        </span>
      );
    case "sent":
      return (
        <span className="msg-state" title={broadcast ? "Sent to the mesh" : "Relayed, waiting for the recipient"}>
          <Icon name="info" className="i-xs" />
          {broadcast ? "SENT" : "SENT · RELAYED"}
        </span>
      );
    case "acked":
      return (
        <span className="msg-state is-ok" title="Delivered: the recipient confirmed">
          <Icon name="ok" className="i-xs" />
          ACK
        </span>
      );
    case "failed":
      return (
        <span className="msg-state is-crit">
          <Icon name="critical" className="i-xs" />
          {`FAILED${m.error ? ` · ${m.error.replaceAll("_", " ")}` : " · NO ACK"}`}
          <button type="button" className="btn btn-sm retry" onClick={onRetry} disabled={disabled}>
            <Icon name="refresh" />
            Retry
          </button>
        </span>
      );
    default:
      return null;
  }
}

function Message({ m, mesh, onRetry, retryDisabled }: { m: MeshMessage; mesh: Names; onRetry: () => void; retryDisabled: boolean }) {
  const out = m.direction === "out";
  const hops = out ? null : hopsText(m.hops);
  return (
    <li className={`msg${out ? " msg-out" : ""}`} data-id={m.id}>
      <span className="msg-meta">
        <b>{out ? mesh.status.shortName || "YOU" : mesh.nodeName(m.fromNum)}</b>
        {hops && <span>{hops}</span>}
        {!out && m.rxSnr != null && <span>SNR {m.rxSnr} dB</span>}
        <time dateTime={new Date(m.rxTime * 1000).toISOString()}>{utcTime(m.rxTime * 1000)}</time>
      </span>
      <span className="msg-text">{m.text}</span>
      {out && <Delivery m={m} onRetry={onRetry} disabled={retryDisabled} />}
    </li>
  );
}

function subline(conv: string, mesh: Names): string {
  const { kind, num } = parseConv(conv);
  if (kind === "ch") {
    const ch = mesh.channel(num);
    return ch
      ? `${ch.role === "primary" ? "Primary" : "Secondary"} channel · everyone on it can read along`
      : "Channel not configured on the radio anymore";
  }
  const n = mesh.nodes.get(num);
  return `Direct message · ${hex(num)}${n?.lastHeard ? ` · heard ${ago(n.lastHeard)}` : ""}`;
}

/** The open conversation's messages (scroll pane). Keyed by conv. */
export function Thread({
  conv,
  mesh,
  onRetry,
  retryDisabled,
  onError,
}: {
  conv?: string;
  mesh: Names;
  onRetry: (m: MeshMessage) => void;
  retryDisabled: boolean;
  onError: (message: string) => void;
}) {
  if (!conv) {
    return (
      <div className="messages grid-bg">
        <Empty title="No conversation open">Pick a channel or a direct message from the list.</Empty>
      </div>
    );
  }
  return <Messages conv={conv} mesh={mesh} onRetry={onRetry} retryDisabled={retryDisabled} onError={onError} />;
}

function Messages({
  conv,
  mesh,
  onRetry,
  retryDisabled,
  onError,
}: {
  conv: string;
  mesh: Names;
  onRetry: (m: MeshMessage) => void;
  retryDisabled: boolean;
  onError: (message: string) => void;
}) {
  const q = useMessages(conv);
  const list = flatten(q.data);
  const newest = list[list.length - 1];

  useEffect(() => {
    if (q.error && !q.data) onError(`Could not load messages: ${q.error.message}`);
  }, [q.error, q.data, onError]);

  // scroll: older history keeps the view where it was; new messages follow
  // only when already at the bottom; own messages and the first load jump down
  const box = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const olderFrom = useRef<number | null>(null);
  const lastId = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    if (olderFrom.current != null) {
      el.scrollTop = el.scrollHeight - olderFrom.current;
      olderFrom.current = null;
    } else if (atBottom.current || (newest?.direction === "out" && newest.id !== lastId.current)) {
      el.scrollTop = el.scrollHeight;
    }
    lastId.current = newest?.id;
  });

  // read up to the newest message while it is on screen
  useEffect(() => {
    const read = () => {
      if (document.visibilityState === "visible" && newest) meshUi.markRead(conv, newest.id);
    };
    read();
    document.addEventListener("visibilitychange", read);
    return () => document.removeEventListener("visibilitychange", read);
  }, [conv, newest]);

  const loadOlder = () => {
    if (box.current) olderFrom.current = box.current.scrollHeight;
    q.fetchNextPage().then(
      (r) => {
        if (r.error) onError(`Could not load older messages: ${r.error.message}`);
      },
      (e: Error) => onError(`Could not load older messages: ${e.message}`),
    );
  };

  let lastDay = "";
  return (
    <div
      className="messages grid-bg"
      ref={box}
      onScroll={(e) => {
        const el = e.currentTarget;
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      }}
    >
      <p className="thread-sub label">{subline(conv, mesh)}</p>
      {q.hasNextPage && (
        <button type="button" className="btn btn-ghost btn-sm older" onClick={loadOlder} disabled={q.isFetchingNextPage}>
          {q.isFetchingNextPage ? "Loading…" : "Load older messages"}
        </button>
      )}
      <ol className="chat" aria-live="polite" aria-relevant="additions">
        {list.map((m) => {
          const day = utcDate(m.rxTime * 1000);
          const divider = day !== lastDay;
          lastDay = day;
          return (
            <Fragment key={m.id}>
              {divider && (
                <li className="divider" role="separator">
                  {dividerLabel(m.rxTime)}
                </li>
              )}
              <Message m={m} mesh={mesh} onRetry={() => onRetry(m)} retryDisabled={retryDisabled} />
            </Fragment>
          );
        })}
      </ol>
      {q.isSuccess && !list.length && (
        <Empty title="No messages yet">
          {conv.startsWith("ch:")
            ? "Messages on this channel show up here as they arrive."
            : "Send the first message; it is delivered when the node is in range."}
        </Empty>
      )}
    </div>
  );
}
