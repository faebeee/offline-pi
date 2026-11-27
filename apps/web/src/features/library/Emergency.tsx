import { useLibraryEmergencyArticle, useLibraryEmergencyIndex, type EmergencyIndex, type EmergencyTopic } from "@outpost/api-client";
import { bytes } from "@outpost/ui/outpost.js";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Banner, Icon } from "../../ui/outpost";
import { isRunning, useModule } from "../modules/useModules";
import { langName } from "./books";

const OPEN_KEY = "outpost-library-emergency-open";

function storedOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== "0";
  } catch {
    return true;
  }
}

/**
 * "In an emergency": the topics that matter first (CPR, bleeding, water
 * purification, ...), each opening the best article in the installed books.
 * Without a searchable book it offers the emergency starter set.
 */
export function EmergencySection({ bookCount }: { bookCount: number }) {
  const running = isRunning(useModule("knowledge"));
  const index = useLibraryEmergencyIndex({ query: { enabled: running, staleTime: 60_000 } }).data;
  const [open, setOpen] = useState(storedOpen);
  if (!index) return null;

  const toggle = () => {
    setOpen((v) => {
      try {
        localStorage.setItem(OPEN_KEY, v ? "0" : "1");
      } catch {
        // storage blocked: open again next time
      }
      return !v;
    });
  };

  const missing = index.starter.filter((b) => !b.installed);

  return (
    <section className="lib-section lib-sos" aria-labelledby="lib-sos-title">
      <div className="lib-section-head">
        <div className="lib-section-title">
          <h2 className="h2" id="lib-sos-title">
            In an emergency
          </h2>
          <span className="label">
            {index.language ? `Best article in your ${langName(index.language)} books` : "Needs a searchable book"}
          </span>
        </div>
        <button type="button" className="btn btn-sm" aria-expanded={open} aria-controls="lib-sos-body" onClick={toggle}>
          {open ? "Hide" : "Show"}
        </button>
      </div>
      <div id="lib-sos-body" className="vstack lib-sos-body" hidden={!open}>
        {!index.language ? (
          <StarterBanner index={index} empty={bookCount === 0} />
        ) : (
          <>
            {missing.length === index.starter.length && <StarterBanner index={index} empty={false} />}
            {index.groups.map((g) => (
              <div key={g.id} className="lib-sos-group">
                <h3 className="label">{g.label}</h3>
                <ul className="list lib-list lib-sos-list">
                  {g.topics.map((t) => (
                    <Topic key={t.id} topic={t} lang={index.language!} />
                  ))}
                </ul>
              </div>
            ))}
            <p className="help">
              Not a substitute for professional help: call the emergency number (112, in Switzerland 144 for an ambulance) when
              you can.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

/** One topic: opens its best article, or the search when there is none. */
function Topic({ topic, lang }: { topic: EmergencyTopic; lang: string }) {
  const { data, isLoading, error } = useLibraryEmergencyArticle(topic.id, { query: { staleTime: 5 * 60_000, retry: false } });
  const hit = data?.hit;
  const meta = isLoading ? "Looking it up…" : error ? "Search failed" : hit ? `${hit.title} · ${hit.book}` : "No article found, search instead";
  const body = (
    <>
      <span className="row-main">
        <span className="row-title">{topic.label}</span>
        <span className="row-meta">{meta}</span>
      </span>
      <Icon name={hit ? "chevron" : "search"} />
    </>
  );
  return (
    <li>
      {hit ? (
        <Link to="/library/read" search={{ url: hit.viewerUrl }} className="row">
          {body}
        </Link>
      ) : (
        <Link to="/library" search={{ q: topic.query, scope: `lang:${lang}` }} className={`row${isLoading ? " is-loading" : ""}`}>
          {body}
        </Link>
      )}
    </li>
  );
}

function StarterBanner({ index, empty }: { index: EmergencyIndex; empty: boolean }) {
  const missing = index.starter.filter((b) => !b.installed);
  const size = missing.reduce((s, b) => s + b.size, 0);
  return (
    <Banner
      tone="info"
      title={empty ? "Start with the emergency books" : "Add the emergency books"}
      action={
        <Link to="/library/catalog" search={{ starter: true }} className="btn">
          <Icon name="download" />
          Choose
        </Link>
      }
    >
      The emergency topics open articles in books with a full-text index. The starter set ({missing.map((b) => b.title).join(", ")},
      about {bytes(size)}) covers first aid, medicine and water. Download it while you have internet.
    </Banner>
  );
}
