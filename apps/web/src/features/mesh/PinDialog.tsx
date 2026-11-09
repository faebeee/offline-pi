import { useEffect, useRef, useState } from "react";
import { Icon } from "../../ui/outpost";

/** Asks for the send PIN (MESH_SEND_PIN). onDone(null) on cancel / Escape. */
export function PinDialog({ again, onDone }: { again: boolean; onDone: (pin: string | null) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [pin, setPin] = useState("");
  const settled = useRef(false);
  const done = (value: string | null) => {
    if (settled.current) return;
    settled.current = true;
    ref.current?.close();
    onDone(value);
  };

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    input.current?.focus();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="mesh-pin-title"
      onCancel={(e) => {
        e.preventDefault();
        done(null);
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          done(pin);
        }}
      >
        <div className="dialog-head">
          <h2 className="h2" id="mesh-pin-title">
            PIN required
          </h2>
        </div>
        <div className="dialog-body">
          <p className="body-sm fg2">Sending from this Pi is protected by a PIN.</p>
          <div className={`field${again ? " is-error" : ""}`}>
            <label className="label" htmlFor="mesh-pin-input">
              Send PIN
            </label>
            <input
              ref={input}
              id="mesh-pin-input"
              className="input mono"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              required
              value={pin}
              aria-invalid={again}
              aria-describedby={again ? "mesh-pin-error" : undefined}
              onChange={(e) => setPin(e.target.value)}
            />
            {again && (
              <p id="mesh-pin-error" className="field-error">
                <Icon name="critical" className="i-sm" />
                Wrong PIN. Try again.
              </p>
            )}
          </div>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={() => done(null)}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Send
          </button>
        </div>
      </form>
    </dialog>
  );
}
