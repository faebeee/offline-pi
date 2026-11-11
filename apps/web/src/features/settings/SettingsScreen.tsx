import {
  useSettingsOverview,
  useSettingsSizes,
  type SettingPath,
  type SettingPathSize,
  type SettingSection,
  type SettingVar,
} from "@outpost/api-client";
import { useMemo, useState } from "react";
import { Screen } from "../../app/Screen";
import { Banner, Icon } from "../../ui/outpost";
import { fmtBytes } from "../system/format";
import { Bar, SmBadge } from "../system/parts";
import "./settings.css";

type Show = "all" | "changed";

/** Settings: every .env value with its meaning, the data folders, their drive and size. Read only. */
export function SettingsScreen() {
  const overview = useSettingsOverview({ query: { refetchInterval: 30_000 } });
  // walking a big library takes a while; core keeps the result for 5 min
  const sizes = useSettingsSizes({ query: { refetchInterval: 5 * 60_000, staleTime: 60_000 } });
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>("all");
  const data = overview.data;

  const sizeOf = useMemo(() => new Map((sizes.data?.sizes ?? []).map((s) => [s.key, s])), [sizes.data]);
  const sections = useMemo(() => filterSections(data?.sections ?? [], query, show), [data, query, show]);
  const changedCount = (data?.sections ?? []).reduce((n, s) => n + s.vars.filter((v) => v.changed).length, 0);

  const context = data
    ? [data.project ?? "project folder unknown", data.version ? `v${data.version}` : null].filter(Boolean).join(" · ")
    : undefined;

  return (
    <Screen module="settings" title="Settings" context={context}>
      <div className="set">
        {overview.isError && (
          <Banner tone="crit" title="Settings could not be loaded">
            Core did not answer. Check that it is running and reload.
          </Banner>
        )}
        {data && (
          <Banner tone="info" title="Read only">
            {data.source === "env-file" ? (
              <>
                Values from <code>{data.envFile}</code>.{" "}
              </>
            ) : (
              <>The .env file is not readable here, so these are the values core started with. </>
            )}
            To change a setting, run <code>./install.sh</code> in the project folder on the Pi.
          </Banner>
        )}

        {data && (
          <article className="card">
            <div className="card-head">
              <h2 className="h2">Data folders</h2>
              <span className="label">
                {sizes.isFetching ? "Measuring…" : sizes.data ? `${data.paths.length} folders` : ""}
              </span>
            </div>
            <p className="help">Where each module keeps its data, the drive it is on and how much it uses.</p>
            <ul className="list set-paths">
              {data.paths.map((p) => (
                <PathRow key={p.key} path={p} size={sizeOf.get(p.key)} measuring={sizes.isLoading} />
              ))}
            </ul>
          </article>
        )}

        {data && (
          <div className="set-tools">
            <div className="search">
              <Icon name="search" />
              <input
                className="input"
                type="search"
                placeholder="Find a setting"
                aria-label="Find a setting"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="seg" role="group" aria-label="Which settings">
              <button type="button" aria-pressed={show === "all"} onClick={() => setShow("all")}>
                All
              </button>
              <button type="button" aria-pressed={show === "changed"} onClick={() => setShow("changed")}>
                Changed · {changedCount}
              </button>
            </div>
          </div>
        )}

        {data && !sections.length && <p className="help">No setting matches.</p>}
        {sections.map((s) => (
          <SectionCard key={s.id} section={s} />
        ))}
      </div>
    </Screen>
  );
}

function filterSections(sections: SettingSection[], query: string, show: Show): SettingSection[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return sections
    .map((s) => ({
      ...s,
      vars: s.vars.filter((v) => {
        if (show === "changed" && !v.changed) return false;
        const text = `${v.key} ${v.value ?? ""} ${v.description} ${s.title}`.toLowerCase();
        return words.every((w) => text.includes(w));
      }),
    }))
    .filter((s) => s.vars.length);
}

function PathRow({ path: p, size, measuring }: { path: SettingPath; size?: SettingPathSize; measuring: boolean }) {
  const used = p.totalBytes != null && p.freeBytes != null ? p.totalBytes - p.freeBytes : null;
  const ratio = used != null && p.totalBytes ? used / p.totalBytes : 0;
  const tone = ratio >= 0.95 ? "crit" : ratio >= 0.9 ? "cau" : undefined;
  let sizeText = "--";
  if (size?.bytes != null) sizeText = `${size.complete ? "" : "≥ "}${fmtBytes(size.bytes)}`;
  else if (measuring && p.exists) sizeText = "Measuring…";

  return (
    <li className="set-path">
      <div className="set-path-head">
        <span className="data set-key">{p.key}</span>
        {!p.installed && <SmBadge tone="off">Not installed</SmBadge>}
        {p.installed && !p.exists && <SmBadge tone="crit">Missing</SmBadge>}
        <span className="data set-size" aria-label={`Size ${sizeText}`}>
          {sizeText}
        </span>
      </div>
      <span className="data set-value">{p.hostPath ?? p.value}</span>
      {p.description && <span className="help">{p.description}</span>}
      {p.totalBytes != null && (
        <>
          <Bar ratio={ratio} cells={32} tone={tone} label={`${p.mountPoint ?? "drive"} used`} />
          <span className="label">
            {fmtBytes(p.freeBytes)} free of {fmtBytes(p.totalBytes)}
            {p.device && ` · ${p.device}`}
            {p.fsType && ` · ${p.fsType}`}
            {p.mountPoint && ` · on ${p.mountPoint}`}
            {size && size.files > 0 && ` · ${size.files.toLocaleString("en")} files`}
          </span>
        </>
      )}
      {p.installed && !p.exists && (
        <span className="help">
          The folder does not exist. Is the drive plugged in and mounted? Otherwise run ./install.sh to choose another.
        </span>
      )}
    </li>
  );
}

function SectionCard({ section: s }: { section: SettingSection }) {
  return (
    <article className={`card set-section${s.installed ? "" : " is-off"}`}>
      <div className="card-head">
        <h2 className="h2">{s.title}</h2>
        {!s.installed && <SmBadge tone="off">Not installed</SmBadge>}
      </div>
      <dl className="set-vars">
        {s.vars.map((v) => (
          <VarRow key={v.key} v={v} />
        ))}
      </dl>
    </article>
  );
}

function VarRow({ v }: { v: SettingVar }) {
  let value: string;
  if (v.secret) value = v.isSet ? "•••• (set, hidden)" : "not set";
  else value = v.value ?? "empty";
  return (
    <div className="set-var">
      <dt className="data set-key">
        {v.key}
        {v.changed && <SmBadge tone="info">Changed</SmBadge>}
      </dt>
      <dd>
        <span className={`data set-value${v.value == null ? " is-empty" : ""}`}>{value}</span>
        {v.changed && !v.secret && v.defaultValue != null && (
          <span className="label set-default">Default: {v.defaultValue === "" ? "empty" : v.defaultValue}</span>
        )}
        {v.description && <span className="help">{v.description}</span>}
      </dd>
    </div>
  );
}
