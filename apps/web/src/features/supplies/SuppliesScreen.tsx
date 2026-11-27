import {
  getSuppliesItemsQueryKey,
  getSuppliesStatusQueryKey,
  suppliesAdjust,
  suppliesCreate,
  suppliesRemove,
  suppliesSaveSettings,
  suppliesUpdate,
  useSuppliesItems,
  useSuppliesStatus,
  type SuppliesSettings,
  type SuppliesStatus,
  type SupplyItem,
  type SupplyItemCategory,
} from "@outpost/api-client";
import { ago, toast } from "@outpost/ui/outpost.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Dialog } from "../../app/Dialog";
import { Screen } from "../../app/Screen";
import { Badge, Banner, Icon, Illustration, Progress } from "../../ui/outpost";
import { ModuleGate } from "../modules/ModuleGate";
import { isRunning, useModule, withControlPin } from "../modules/useModules";
import "./supplies.css";

const POLL_MS = 30_000;

export const CATEGORIES: { id: SupplyItemCategory; label: string; unit: string }[] = [
  { id: "water", label: "Water", unit: "L" },
  { id: "food", label: "Food", unit: "kg" },
  { id: "medicine", label: "Medicine and first aid", unit: "pcs" },
  { id: "hygiene", label: "Hygiene", unit: "pcs" },
  { id: "power", label: "Power and light", unit: "pcs" },
  { id: "tools", label: "Tools", unit: "pcs" },
  { id: "other", label: "Other", unit: "pcs" },
];

const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Supplies: the household's emergency stock, expiry dates and days of water. */
export function SuppliesScreen() {
  const running = isRunning(useModule("supplies"));
  const status = useSuppliesStatus({ query: { enabled: running, refetchInterval: POLL_MS } }).data;
  const context = status
    ? [
        `${status.items} ${status.items === 1 ? "item" : "items"}`,
        status.waterDays != null ? `Water ${num(status.waterDays)} d` : null,
        status.updatedAt ? `Updated ${ago(status.updatedAt)}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : undefined;

  return (
    <Screen module="supplies" title="Supplies" context={running ? context : undefined}>
      <ModuleGate id="supplies">
        <Supplies status={status} />
      </ModuleGate>
    </Screen>
  );
}

type Editing = { item: SupplyItem | null; category: SupplyItemCategory } | null;

function Supplies({ status }: { status: SuppliesStatus | undefined }) {
  const qc = useQueryClient();
  const items = useSuppliesItems({ query: { refetchInterval: POLL_MS } });
  const [editing, setEditing] = useState<Editing>(null);
  const [settings, setSettings] = useState(false);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: getSuppliesItemsQueryKey() });
    void qc.invalidateQueries({ queryKey: getSuppliesStatusQueryKey() });
  };

  const list = items.data ?? [];
  const expired = list.filter((i) => i.expired);
  const expiring = list.filter((i) => i.expiring);
  const low = list.filter((i) => i.low);
  const names = (xs: SupplyItem[]) => xs.map((i) => i.name).join(", ");

  return (
    <div className="supplies vstack">
      {status && <Summary status={status} onSettings={() => setSettings(true)} />}

      {expired.length > 0 && (
        <Banner tone="crit" title={`${expired.length} expired`}>
          {names(expired)}. Replace {expired.length === 1 ? "it" : "them"} or take {expired.length === 1 ? "it" : "them"} off
          the list.
        </Banner>
      )}
      {expiring.length > 0 && (
        <Banner tone="cau" title={`${expiring.length} expiring within ${status?.settings.expiryWarningDays ?? 30} days`}>
          {names(expiring)}. Use {expiring.length === 1 ? "it" : "them"} first and buy fresh.
        </Banner>
      )}
      {low.length > 0 && (
        <Banner tone="cau" title={`${low.length} below the minimum`}>
          {names(low)}.
        </Banner>
      )}
      {items.error && (
        <Banner tone="crit" title="Could not load the supplies">
          {items.error.message}
        </Banner>
      )}

      <div className="supplies-bar">
        <h2 className="h2">Stock</h2>
        <button type="button" className="btn btn-primary" onClick={() => setEditing({ item: null, category: "water" })}>
          <Icon name="plus" />
          Add item
        </button>
      </div>

      {items.isSuccess && list.length === 0 ? (
        <div className="empty">
          <Illustration name="supplies" />
          <p className="empty-title">No supplies listed yet</p>
          <p>
            List what you keep for an emergency: water, food, medicine, batteries. outpost then warns you before things
            expire and tells you how long the water lasts. A good start is water and food for a week for everyone in
            the household.
          </p>
        </div>
      ) : (
        CATEGORIES.map((c) => {
          const inCat = list.filter((i) => i.category === c.id);
          if (!inCat.length) return null;
          return (
            <section key={c.id} className="supplies-section" aria-labelledby={`sup-${c.id}`}>
              <div className="supplies-section-head">
                <h3 className="label" id={`sup-${c.id}`}>
                  {c.label} · {inCat.length}
                </h3>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing({ item: null, category: c.id })}>
                  <Icon name="plus" />
                  Add
                </button>
              </div>
              <ul className="list supplies-list">
                {inCat.map((i) => (
                  <ItemRow key={i.id} item={i} onEdit={() => setEditing({ item: i, category: i.category })} onChanged={refresh} />
                ))}
              </ul>
            </section>
          );
        })
      )}

      {editing && <ItemDialog editing={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
      {settings && status && <SettingsDialog settings={status.settings} onClose={() => setSettings(false)} onSaved={refresh} />}
    </div>
  );
}

/** Days of water against the target, and the counts. */
function Summary({ status, onSettings }: { status: SuppliesStatus; onSettings: () => void }) {
  const s = status.settings;
  const days = status.waterDays ?? 0;
  const ratio = Math.min(1, days / Math.max(1, s.targetDays));
  const short = days < s.targetDays;
  return (
    <article className="card supplies-summary">
      <div className="supplies-water">
        <div className="supplies-water-head">
          <span className="label">Water</span>
          {short ? (
            <Badge state={days < s.targetDays / 2 ? "crit" : "cau"} className="badge-sm">
              Below target
            </Badge>
          ) : (
            <Badge state="ok" className="badge-sm">
              Enough
            </Badge>
          )}
        </div>
        <div className="supplies-readout">
          <span className="readout-value">{num(days)}</span>
          <span className="readout-unit">of {s.targetDays} days</span>
        </div>
        <Progress ratio={ratio} />
        <p className="body-sm fg2">
          {num(status.waterLitres)} L for {s.people} {s.people === 1 ? "person" : "people"} at {num(s.waterLitresPerDay)} L each a
          day. Expired water and items not counted in L, dl, cl or ml are left out.
        </p>
      </div>
      <dl className="kv supplies-counts">
        <dt>Items</dt>
        <dd>{status.items}</dd>
        <dt>Expired</dt>
        <dd>{status.expired}</dd>
        <dt>Expiring</dt>
        <dd>{status.expiring}</dd>
        <dt>Low</dt>
        <dd>{status.low}</dd>
      </dl>
      <button type="button" className="btn btn-sm supplies-settings" onClick={onSettings}>
        <Icon name="sliders" />
        Household
      </button>
    </article>
  );
}

function expiryText(i: SupplyItem): string | null {
  if (!i.expires || i.daysLeft == null) return null;
  if (i.daysLeft < 0) return `expired ${i.expires}`;
  if (i.daysLeft === 0) return "expires today";
  if (i.daysLeft <= 60) return `expires in ${i.daysLeft} d`;
  return `until ${i.expires}`;
}

function ItemRow({ item: i, onEdit, onChanged }: { item: SupplyItem; onEdit: () => void; onChanged: () => void }) {
  const adjust = useMutation({ mutationFn: (delta: number) => suppliesAdjust(i.id, { delta }), onSettled: onChanged });
  const meta = [i.location, expiryText(i), i.minimum != null ? `min ${num(i.minimum)}` : null].filter(Boolean);
  return (
    <li>
      <div className="row-actions">
        <button type="button" className="row" onClick={onEdit} aria-label={`Edit ${i.name}`}>
          <span className="row-main">
            <span className="row-title">{i.name}</span>
            {meta.length > 0 && <span className="row-meta">{meta.join(" · ")}</span>}
          </span>
          <span className="supplies-flags">
            {i.expired ? (
              <Badge state="crit" className="badge-sm">
                Expired
              </Badge>
            ) : i.expiring ? (
              <Badge state="cau" className="badge-sm">
                Expiring
              </Badge>
            ) : null}
            {i.low && (
              <Badge state="cau" className="badge-sm">
                Low
              </Badge>
            )}
          </span>
          <span className="row-value">
            {num(i.quantity)} {i.unit}
          </span>
        </button>
        <button
          type="button"
          className="btn btn-icon"
          aria-label={`One less ${i.name}`}
          title="One less"
          disabled={adjust.isPending || i.quantity <= 0}
          onClick={() => adjust.mutate(-1)}
        >
          <Icon name="minus" />
        </button>
        <button
          type="button"
          className="btn btn-icon"
          aria-label={`One more ${i.name}`}
          title="One more"
          disabled={adjust.isPending}
          onClick={() => adjust.mutate(1)}
        >
          <Icon name="plus" />
        </button>
      </div>
    </li>
  );
}

/** "" -> null, "1,5" -> 1.5 */
function parseNumber(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

function ItemDialog({ editing, onClose, onSaved }: { editing: NonNullable<Editing>; onClose: () => void; onSaved: () => void }) {
  const i = editing.item;
  const [name, setName] = useState(i?.name ?? "");
  const [category, setCategory] = useState<SupplyItemCategory>(editing.category);
  const [quantity, setQuantity] = useState(i ? String(i.quantity) : "");
  const [unit, setUnit] = useState(i?.unit ?? CATEGORIES.find((c) => c.id === editing.category)!.unit);
  const [minimum, setMinimum] = useState(i?.minimum != null ? String(i.minimum) : "");
  const [expires, setExpires] = useState(i?.expires ?? "");
  const [location, setLocation] = useState(i?.location ?? "");
  const [note, setNote] = useState(i?.note ?? "");
  const id = useId();
  const f = (k: string) => `${id}-${k}`;

  const qty = parseNumber(quantity) ?? 0;
  const min = parseNumber(minimum);
  const invalid = !name.trim() || Number.isNaN(qty) || qty < 0 || (min != null && (Number.isNaN(min) || min < 0));

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        category,
        quantity: qty,
        unit: unit.trim(),
        minimum: min,
        expires: expires || null,
        location: location.trim() || null,
        note: note.trim() || null,
      };
      return i ? suppliesUpdate(i.id, body) : suppliesCreate(body);
    },
    onSuccess: () => {
      onSaved();
      onClose();
      toast(i ? "Saved." : `${name.trim()} added.`);
    },
  });
  const remove = useMutation({
    mutationFn: () => withControlPin("delete supplies", () => suppliesRemove(i!.id)),
    onSuccess: () => {
      onSaved();
      onClose();
      toast(`${i!.name} deleted.`);
    },
  });

  return (
    <Dialog
      title={i ? "Edit item" : "Add item"}
      onClose={onClose}
      scroll
      onSubmit={() => !invalid && save.mutate()}
      actions={
        <>
          {i && (
            <button
              type="button"
              className="btn btn-crit supplies-delete"
              disabled={remove.isPending}
              onClick={() => window.confirm(`Delete "${i.name}" from the list?`) && remove.mutate()}
            >
              <Icon name="trash" />
              Delete
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={invalid || save.isPending}>
            {i ? "Save" : "Add"}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="label" htmlFor={f("name")}>
          What
        </label>
        <input
          id={f("name")}
          className="input"
          required
          maxLength={100}
          placeholder="e.g. Mineral water 1.5 L"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field">
        <label className="label" htmlFor={f("cat")}>
          Category
        </label>
        <select
          id={f("cat")}
          className="select"
          value={category}
          onChange={(e) => {
            const next = e.target.value as SupplyItemCategory;
            // follow the category's usual unit while the user hasn't chosen one
            if (!i && unit === CATEGORIES.find((c) => c.id === category)!.unit) setUnit(CATEGORIES.find((c) => c.id === next)!.unit);
            setCategory(next);
          }}
        >
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="supplies-fields">
        <div className="field">
          <label className="label" htmlFor={f("qty")}>
            Quantity
          </label>
          <input id={f("qty")} className="input mono" inputMode="decimal" placeholder="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor={f("unit")}>
            Unit
          </label>
          <input id={f("unit")} className="input" maxLength={20} list={f("units")} value={unit} onChange={(e) => setUnit(e.target.value)} />
          <datalist id={f("units")}>
            {["L", "ml", "kg", "g", "pcs", "packs", "cans", "boxes"].map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label className="label" htmlFor={f("min")}>
            Minimum
          </label>
          <input id={f("min")} className="input mono" inputMode="decimal" placeholder="none" value={minimum} onChange={(e) => setMinimum(e.target.value)} />
        </div>
      </div>
      {category === "water" && <p className="help">Count water in L (or dl, cl, ml) so it counts towards the days of water.</p>}
      <div className="field">
        <label className="label" htmlFor={f("exp")}>
          Best before (optional)
        </label>
        <input id={f("exp")} className="input mono" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
      </div>
      <div className="field">
        <label className="label" htmlFor={f("loc")}>
          Where it is kept (optional)
        </label>
        <input id={f("loc")} className="input" maxLength={100} placeholder="e.g. Cellar, shelf 2" value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>
      <div className="field">
        <label className="label" htmlFor={f("note")}>
          Note (optional)
        </label>
        <textarea id={f("note")} className="textarea" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {(save.error ?? remove.error) && (
        <Banner tone="crit" title="Did not work">
          {(save.error ?? remove.error)!.message}
        </Banner>
      )}
    </Dialog>
  );
}

function SettingsDialog({ settings, onClose, onSaved }: { settings: SuppliesSettings; onClose: () => void; onSaved: () => void }) {
  const [people, setPeople] = useState(String(settings.people));
  const [litres, setLitres] = useState(String(settings.waterLitresPerDay));
  const [target, setTarget] = useState(String(settings.targetDays));
  const [warn, setWarn] = useState(String(settings.expiryWarningDays));
  const id = useId();
  const values = {
    people: parseNumber(people),
    waterLitresPerDay: parseNumber(litres),
    targetDays: parseNumber(target),
    expiryWarningDays: parseNumber(warn),
  };
  const invalid =
    !Number.isInteger(values.people) ||
    values.people! < 1 ||
    values.waterLitresPerDay == null ||
    !(values.waterLitresPerDay > 0) ||
    !Number.isInteger(values.targetDays) ||
    values.targetDays! < 1 ||
    !Number.isInteger(values.expiryWarningDays) ||
    values.expiryWarningDays! < 0;

  const save = useMutation({
    mutationFn: () =>
      suppliesSaveSettings({
        people: values.people!,
        waterLitresPerDay: values.waterLitresPerDay!,
        targetDays: values.targetDays!,
        expiryWarningDays: values.expiryWarningDays!,
      }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  const field = (key: string, label: string, value: string, set: (v: string) => void, help?: string) => (
    <div className="field">
      <label className="label" htmlFor={`${id}-${key}`}>
        {label}
      </label>
      <input id={`${id}-${key}`} className="input mono" inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} />
      {help && <span className="help">{help}</span>}
    </div>
  );

  return (
    <Dialog
      title="Household"
      onClose={onClose}
      onSubmit={() => !invalid && save.mutate()}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={invalid || save.isPending}>
            Save
          </button>
        </>
      }
    >
      {field("people", "People", people, setPeople)}
      {field("litres", "Water per person and day (L)", litres, setLitres, "For drinking and cooking. 3 L is a common rule.")}
      {field("target", "Stock should last (days)", target, setTarget, "Authorities advise about a week.")}
      {field("warn", "Warn before expiry (days)", warn, setWarn)}
      {save.error && (
        <Banner tone="crit" title="Not saved">
          {save.error.message}
        </Banner>
      )}
    </Dialog>
  );
}
