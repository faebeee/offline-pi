import { useEffect, useRef, useState } from "react";
import { coords } from "@offline-pi/ui/outpost.js";
import { DEFAULT_POI_EMOJI, POI_NAME_MAX, type CreatePoiRequest, type Poi } from "./api";
import { HoldButton, Icon } from "./ui";

/** What the dialog is editing: a brand-new pin, or an existing POI. */
export type PoiDraft = { kind: "create"; lat: number; lon: number } | { kind: "edit"; poi: Poi };

type Props = {
  draft: PoiDraft;
  onSave: (body: CreatePoiRequest) => Promise<unknown>;
  onDelete?: () => Promise<unknown>;
  onClose: () => void;
};

type FieldError = { field: "name" | "lat" | "lon" | "form"; message: string };

/**
 * Create or edit a saved place: name and position. The API still carries an
 * `emoji` per POI; the Outpost UI does not show emoji (DESIGN.md), so an
 * existing value is kept untouched and new places get the default.
 */
export function PoiDialog({ draft, onSave, onDelete, onClose }: Props) {
  const initial = draft.kind === "edit" ? draft.poi : undefined;
  const [name, setName] = useState(initial?.name ?? "");
  const [lat, setLat] = useState(String(draft.kind === "edit" ? draft.poi.lat : draft.lat));
  const [lon, setLon] = useState(String(draft.kind === "edit" ? draft.poi.lon : draft.lon));
  const [error, setError] = useState<FieldError | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // No cleanup: closing would fire `close` (and onClose) on StrictMode's
    // simulated unmount. Removing the element ends the modal state anyway.
    if (!dialog.open) dialog.showModal();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError({ field: "name", message: "Give the place a name." });

    const latitude = Number(lat);
    const longitude = Number(lon);
    if (lat.trim() === "" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      return setError({ field: "lat", message: "Latitude must be between -90 and 90." });
    }
    if (lon.trim() === "" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return setError({ field: "lon", message: "Longitude must be between -180 and 180." });
    }

    setBusy(true);
    setError(null);
    try {
      await onSave({
        name: trimmed,
        emoji: initial?.emoji ?? DEFAULT_POI_EMOJI,
        lat: latitude,
        lon: longitude,
      });
      onClose();
    } catch (err) {
      setError({ field: "form", message: (err as Error).message });
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
      setError({ field: "form", message: (err as Error).message });
      setBusy(false);
    }
  }

  const title = draft.kind === "edit" ? "Edit place" : "New place";
  const position = draft.kind === "edit" ? draft.poi : draft;
  const invalid = (field: FieldError["field"]) => error?.field === field;

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="poi-title"
      onClose={() => closeRef.current()}
      // a click on the backdrop lands on the <dialog> itself
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
    >
      <form onSubmit={submit} noValidate>
        <div className="dialog-head">
          <span className="mk poi-dialog-mk" aria-hidden="true">
            <span className="mk-shape" />
          </span>
          <h2 id="poi-title" className="h2">
            {title}
          </h2>
          <button
            type="button"
            className="btn btn-icon"
            aria-label="Close"
            onClick={() => ref.current?.close()}
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="dialog-body">
          <p className="label">{coords(position.lat, position.lon)}</p>

          <Field id="poi-name" label="Name" error={invalid("name") ? error?.message : undefined}>
            <input
              id="poi-name"
              className="input"
              value={name}
              maxLength={POI_NAME_MAX}
              autoFocus
              aria-invalid={invalid("name") || undefined}
              aria-describedby={invalid("name") ? "poi-name-error" : undefined}
              onChange={(e) => setName(e.target.value)}
              placeholder="Trailhead parking"
            />
          </Field>

          <div className="coord-fields">
            <Field id="poi-lat" label="Latitude" error={invalid("lat") ? error?.message : undefined}>
              <input
                id="poi-lat"
                className="input mono"
                value={lat}
                inputMode="decimal"
                aria-invalid={invalid("lat") || undefined}
                aria-describedby={invalid("lat") ? "poi-lat-error" : undefined}
                onChange={(e) => setLat(e.target.value)}
              />
            </Field>
            <Field id="poi-lon" label="Longitude" error={invalid("lon") ? error?.message : undefined}>
              <input
                id="poi-lon"
                className="input mono"
                value={lon}
                inputMode="decimal"
                aria-invalid={invalid("lon") || undefined}
                aria-describedby={invalid("lon") ? "poi-lon-error" : undefined}
                onChange={(e) => setLon(e.target.value)}
              />
            </Field>
          </div>
          <p className="help">Drag the marker on the map to fine-tune the position.</p>

          {invalid("form") && (
            <p className="field-error" role="alert">
              <Icon name="critical" className="i-sm" />
              {error?.message}
            </p>
          )}

          {onDelete && <HoldButton label="Delete place" onConfirm={remove} disabled={busy} />}
        </div>

        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={() => ref.current?.close()}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving" : "Save place"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={error ? "field is-error" : "field"}>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children}
      {error && (
        <span id={`${id}-error`} className="field-error">
          <Icon name="critical" className="i-sm" />
          {error}
        </span>
      )}
    </div>
  );
}
