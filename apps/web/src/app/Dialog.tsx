import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "../ui/outpost";

/**
 * Modal sheet on <dialog> (.dialog, DESIGN.md 0.2): head with title and
 * close button, a body and optional actions. Escape and a click on the
 * backdrop close it.
 */
export function Dialog({
  title,
  onClose,
  children,
  actions,
  onSubmit,
  scroll = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** buttons at the bottom; inside the form when onSubmit is given */
  actions?: ReactNode;
  /** makes the dialog a form (Enter submits) */
  onSubmit?: () => void;
  scroll?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  const inner = (
    <>
      <div className="dialog-head">
        <h2 className="h2" id={titleId}>
          {title}
        </h2>
        <button type="button" className="btn btn-icon" aria-label="Close" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div className="dialog-body">{children}</div>
      {actions && <div className="dialog-actions">{actions}</div>}
    </>
  );

  return (
    <dialog
      ref={ref}
      className={`dialog${scroll ? " dialog-scroll" : ""}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {onSubmit ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          {inner}
        </form>
      ) : (
        inner
      )}
    </dialog>
  );
}

/** A dialog asking for one line of text (a name). onDone(null) on cancel. */
export function PromptDialog({
  title,
  label,
  initial = "",
  confirm,
  maxLength,
  error,
  busy = false,
  onDone,
}: {
  title: string;
  label: string;
  initial?: string;
  confirm: string;
  maxLength?: number;
  error?: string | null;
  busy?: boolean;
  onDone: (value: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.focus();
    // select the name without its extension, like a file manager
    const dot = initial.lastIndexOf(".");
    el.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial]);

  return (
    <Dialog
      title={title}
      onClose={() => onDone(null)}
      onSubmit={() => value.trim() && onDone(value.trim())}
      actions={
        <>
          <button type="button" className="btn" onClick={() => onDone(null)}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !value.trim()}>
            {confirm}
          </button>
        </>
      }
    >
      <div className={`field${error ? " is-error" : ""}`}>
        <label className="label" htmlFor={inputId}>
          {label}
        </label>
        <input
          ref={input}
          id={inputId}
          className="input"
          required
          maxLength={maxLength}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {error && <span className="field-error">{error}</span>}
      </div>
    </Dialog>
  );
}
