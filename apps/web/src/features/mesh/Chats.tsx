import { ApiError, meshSend, type MeshConfig, type MeshMessage } from "@offline-pi/api-client";
import { ago, utcTime } from "@offline-pi/ui/outpost.js";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Icon } from "../../ui/outpost";
import { Composer } from "./Composer";
import { CONV_RE, hex, parseConv } from "./format";
import { PinDialog } from "./PinDialog";
import { meshUi, useMeshUi } from "./store";
import { Thread } from "./Thread";
import { upsertMessage, useMesh, useTick } from "./useMesh";

export const wide = () => matchMedia("(min-width: 721px)").matches;

function sendErrorText(err: unknown, config: MeshConfig): string {
  if (err instanceof ApiError) {
    if (err.status === 429) {
      const { count, window } = config.rateLimit;
      return count
        ? `too many messages, ${count} per ${window} s are allowed. Wait a moment and try again`
        : "too many messages. Wait a moment and try again";
    }
    if (err.status === 503) return `the radio is not connected${/^HTTP /.test(err.message) ? "" : ` (${err.message})`}`;
  }
  return err instanceof Error ? err.message : String(err);
}

/** Messages view: conversations (channels + DMs) beside the open thread. */
export function Chats({ conv }: { conv?: string }) {
  const mesh = useMesh();
  const ui = useMeshUi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  useTick();

  // first visit: reopen the last conversation (the primary channel on wide screens)
  useEffect(() => {
    if (conv) return;
    const last = meshUi.lastConv() || (wide() ? "ch:0" : null);
    if (last && CONV_RE.test(last)) void navigate({ to: "/mesh", search: { conv: last }, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    meshUi.setCurrent(conv ?? null);
    if (conv) meshUi.setLastConv(conv);
  }, [conv]);
  useEffect(() => () => meshUi.setCurrent(null), []);

  const open = (c: string) => void navigate({ to: "/mesh", search: { conv: c } });

  // ---- sending
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [pinAsk, setPinAsk] = useState<{ again: boolean; resolve: (pin: string | null) => void } | null>(null);
  useEffect(() => setError(""), [conv]);

  const askPin = (again: boolean) => new Promise<string | null>((resolve) => setPinAsk({ again, resolve }));

  /** POST a message, asking for the PIN when core wants one. True when handed to the radio. */
  async function sendText(to: string, text: string): Promise<boolean> {
    let pin = meshUi.pin();
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const row = await meshSend(
          { conv: to, text },
          mesh.config.sendPinRequired || pin ? { headers: { "X-Send-PIN": pin } } : undefined,
        );
        upsertMessage(qc, row);
        return true;
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 401) throw err;
        const entered = await askPin(attempt > 0 || !!meshUi.pin());
        if (entered == null) return false;
        pin = entered;
        meshUi.setPin(pin);
      }
    }
    throw new Error("Wrong PIN");
  }

  async function run(prefix: string, to: string, text: string): Promise<boolean> {
    if (sending) return false;
    setSending(true);
    setError("");
    try {
      return await sendText(to, text);
    } catch (err) {
      setError(`${prefix}: ${sendErrorText(err, mesh.config)}.`);
      return false;
    } finally {
      setSending(false);
    }
  }

  // FAILED -> send the same text again (a new message; the failed one stays)
  const retry = (m: MeshMessage) => void run("Retry failed", m.conv, m.text);

  // ---- conversation list
  const channels = (mesh.status.channels ?? []).map((c) => `ch:${c.index}`);
  // channels the node no longer has but that have history
  for (const c of mesh.convs) if (c.conv.startsWith("ch:") && !channels.includes(c.conv)) channels.push(c.conv);
  const dms = mesh.convs
    .filter((c) => c.conv.startsWith("dm:"))
    .sort((a, b) => (b.lastTime || 0) - (a.lastTime || 0))
    .map((c) => c.conv);
  if (conv?.startsWith("dm:") && !dms.includes(conv)) dms.unshift(conv);

  const item = (c: string) => {
    const { kind, num } = parseConv(c);
    const row = mesh.convs.find((x) => x.conv === c);
    const n = meshUi.unread(c, row?.lastId);
    const meta: string[] = [];
    if (kind === "ch") {
      const ch = mesh.channel(num);
      meta.push(ch ? `CH ${num} · ${ch.role === "primary" ? "PRIMARY" : "SECONDARY"}` : `CH ${num} · NOT ON RADIO`);
    } else {
      meta.push(hex(num));
      const node = mesh.nodes.get(num);
      if (node?.lastHeard) meta.push(`HEARD ${ago(node.lastHeard)}`);
    }
    if (row?.lastTime) meta.push(`LAST ${utcTime(row.lastTime * 1000)}`);
    return (
      <li key={c}>
        <button type="button" className="row has-mono" aria-current={c === conv ? "true" : undefined} onClick={() => open(c)}>
          <span className="monogram" aria-hidden="true">
            {kind === "ch" ? "#" : mesh.nodeShort(num)}
          </span>
          <span className="row-main">
            <span className="row-title">{kind === "ch" ? mesh.channelName(num) : mesh.nodeName(num)}</span>
            <span className="row-meta">{meta.join(" · ")}</span>
          </span>
          {n > 0 && (
            <span className="badge badge-info badge-sm">
              <Icon name="message" />
              {n > 99 ? "99+" : n} NEW
            </span>
          )}
          <Icon name="chevron" />
        </button>
      </li>
    );
  };

  const radioUp = mesh.status.state === "connected" && ui.live !== "closed";

  return (
    <section className="mesh-chats" data-pane={conv ? "thread" : "list"} role="tabpanel" aria-labelledby="mesh-tab-chats">
      <nav className="conv-pane grid-bg" aria-label="Conversations">
        <ul className="list conv-list">
          <li className="list-section label">Channels</li>
          {channels.map(item)}
          <li className="list-section label">Direct messages</li>
          {dms.length ? dms.map(item) : <li className="list-hint help">Start one from the Nodes tab.</li>}
        </ul>
      </nav>

      <section className="thread" aria-label="Messages">
        <Thread key={conv ?? ""} conv={conv} mesh={mesh} onRetry={retry} retryDisabled={sending} onError={setError} />
        <Composer
          conv={conv}
          placeholderTo={conv ? mesh.convTitle(conv) : ""}
          radioUp={radioUp}
          live={ui.live}
          radioState={mesh.status.state}
          maxBytes={mesh.config.maxTextBytes}
          sending={sending}
          error={error}
          onClearError={() => setError("")}
          onSend={(text) => (conv ? run("Not sent", conv, text) : Promise.resolve(false))}
        />
      </section>

      {pinAsk && (
        <PinDialog
          again={pinAsk.again}
          onDone={(pin) => {
            pinAsk.resolve(pin);
            setPinAsk(null);
          }}
        />
      )}
    </section>
  );
}
