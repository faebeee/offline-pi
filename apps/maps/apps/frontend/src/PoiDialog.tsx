import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_POI_EMOJI,
  POI_EMOJI_MAX,
  POI_EMOJI_PRESETS,
  POI_NAME_MAX,
  type CreatePoiRequest,
  type Poi,
} from "./api";

/** What the dialog is editing: a brand-new pin, or an existing POI. */
export type PoiDraft = { kind: "create"; lat: number; lon: number } | { kind: "edit"; poi: Poi };

type Props = {
  draft: PoiDraft;
  onSave: (body: CreatePoiRequest) => Promise<unknown>;
  onDelete?: () => Promise<unknown>;
  onClose: () => void;
};

/** Create or edit a point of interest: name, emoji and position. */
export function PoiDialog({ draft, onSave, onDelete, onClose }: Props) {
  const initial = draft.kind === "edit" ? draft.poi : undefined;
  const [name, setName] = useState(initial?.name ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? DEFAULT_POI_EMOJI);
  const [lat, setLat] = useState(String(draft.kind === "edit" ? draft.poi.lat : draft.lat));
  const [lon, setLon] = useState(String(draft.kind === "edit" ? draft.poi.lon : draft.lon));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => nameRef.current?.focus(), []);

  // Esc closes, matching the browser-native feel of the other overlays.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError("Give it a name.");
    if (!emoji.trim()) return setError("Pick an emoji.");

    const latitude = Number(lat);
    const longitude = Number(lon);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      return setError("Latitude must be between -90 and 90.");
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return setError("Longitude must be between -180 and 180.");
    }

    setBusy(true);
    setError(null);
    try {
      await onSave({ name: trimmed, emoji: emoji.trim(), lat: latitude, lon: longitude });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!onDelete) return;
    setBusy(true);
    try {
      await onDelete();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const title = draft.kind === "edit" ? "Edit point of interest" : "New point of interest";

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <form className="modal-body" onSubmit={submit}>
          <label className="field">
            <span className="muted small">Name</span>
            <input
              ref={nameRef}
              value={name}
              maxLength={POI_NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              placeholder="Trailhead parking"
            />
          </label>

          <div className="field">
            <span className="muted small">Emoji</span>
            <div className="emoji-row">
              <input
                className="emoji-input"
                value={emoji}
                maxLength={POI_EMOJI_MAX}
                onChange={(e) => setEmoji(e.target.value)}
                aria-label="Emoji"
              />
              <div className="emoji-presets">
                {POI_EMOJI_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={preset === emoji ? "emoji-preset active" : "emoji-preset"}
                    onClick={() => setEmoji(preset)}
                    aria-label={`Use ${preset}`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="coords">
            <label className="field">
              <span className="muted small">Latitude</span>
              <input
                className="tabular"
                value={lat}
                inputMode="decimal"
                onChange={(e) => setLat(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="muted small">Longitude</span>
              <input
                className="tabular"
                value={lon}
                inputMode="decimal"
                onChange={(e) => setLon(e.target.value)}
              />
            </label>
          </div>
          <p className="muted small">Drag the marker on the map to fine-tune the position.</p>

          {error && <p className="error small">{error}</p>}

          <div className="modal-actions">
            {onDelete &&
              (confirmingDelete ? (
                <span className="confirm">
                  <button type="button" className="danger small" onClick={remove} disabled={busy}>
                    Delete
                  </button>
                  <button
                    type="button"
                    className="small"
                    onClick={() => setConfirmingDelete(false)}
                  >
                    Keep
                  </button>
                </span>
              ) : (
                <button type="button" className="danger" onClick={() => setConfirmingDelete(true)}>
                  Delete
                </button>
              ))}
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
