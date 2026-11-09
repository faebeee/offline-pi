import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "../../ui/outpost";
import { utf8Bytes } from "./format";
import type { Live } from "./store";

/** Send box: byte counter against the radio's limit, why sending is blocked, send errors. */
export function Composer({
  conv,
  placeholderTo,
  radioUp,
  live,
  radioState,
  maxBytes,
  sending,
  error,
  onClearError,
  onSend,
}: {
  conv?: string;
  placeholderTo: string;
  radioUp: boolean;
  live: Live;
  radioState?: string;
  maxBytes: number;
  sending: boolean;
  error: string;
  onClearError: () => void;
  onSend: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  const form = useRef<HTMLFormElement>(null);

  const bytes = utf8Bytes(text.trim());
  const over = bytes > maxBytes;
  const disabled = !conv || !radioUp || bytes === 0 || over || sending;

  let note: ["crit" | "cau", string] | null = null;
  if (error) note = ["crit", error];
  else if (over) note = ["crit", `Message is ${bytes} B, the limit is ${maxBytes} B. Shorten it to send.`];
  else if (conv && live === "closed") note = ["cau", "Cannot send: the Pi is unreachable. Reconnecting."];
  else if (conv && radioState !== "connected") note = ["cau", "Cannot send: the radio is not connected."];

  // grow with the text, up to 160 px
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  // a newly opened conversation takes the keyboard on wide screens
  useEffect(() => {
    if (conv && matchMedia("(min-width: 721px)").matches) area.current?.focus();
  }, [conv]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value || disabled) return;
    if (await onSend(value)) setText("");
  };

  return (
    <>
      {note && (
        <p id="mesh-composer-note" className={`composer-note is-${note[0]}`}>
          <Icon name={note[0] === "crit" ? "critical" : "caution"} className="i-sm" />
          <span>{note[1]}</span>
        </p>
      )}
      <form ref={form} className="composer" autoComplete="off" onSubmit={submit}>
        <div className="composer-field">
          <textarea
            ref={area}
            className="textarea"
            rows={1}
            value={text}
            placeholder={!conv ? "Pick a conversation" : radioUp ? `Message ${placeholderTo}` : "Radio not connected"}
            aria-label="Message"
            aria-describedby={note ? "mesh-bytes mesh-composer-note" : "mesh-bytes"}
            aria-invalid={over}
            disabled={!conv}
            onChange={(e) => {
              if (error) onClearError();
              setText(e.target.value);
            }}
            onKeyDown={(e) => {
              // Enter sends on devices with a keyboard; Shift+Enter adds a line break
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && matchMedia("(hover: hover)").matches) {
                e.preventDefault();
                form.current?.requestSubmit();
              }
            }}
          />
          <span id="mesh-bytes" className={`counter${over ? " is-over" : ""}`} aria-live="off">
            {bytes}/{maxBytes} B
          </span>
        </div>
        <button type="submit" className="btn btn-primary btn-send" aria-label="Send" disabled={disabled}>
          <Icon name="send" />
        </button>
      </form>
    </>
  );
}
