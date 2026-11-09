// Library landing page logic. Inlined by build-index.sh right after
// outpost.js in the same <script type="module">, so outpost.js's functions
// (frame, icon, bytes, onVisibility, ...) are in scope. Wrapped in a block so
// its names can't clash with outpost.js. Talks only to kiwix-serve on the
// same origin: the OPDS catalog for the book list, /search for full text.
{
  const ATOM = "http://www.w3.org/2005/Atom";
  const DC = "http://purl.org/dc/terms/";
  const CATALOG = "/catalog/v2/entries?count=-1";

  // the sprite is inlined in the page: icons reference "#name"
  setSprite("");
  const { strip } = frame("library");
  const $ = (id) => document.getElementById(id);
  const list = $("books");
  const empty = $("empty");
  const errBox = $("catalog-error");
  const scope = $("scope");
  const go = $("search-go");

  let langName = (code) => code.toUpperCase();
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "language" });
    langName = (code) => {
      try {
        const n = dn.of(code);
        return n && n !== code ? n : code.toUpperCase();
      } catch {
        return code.toUpperCase();
      }
    };
  } catch {
    // no Intl.DisplayNames: show the code
  }

  const text = (entry, tag, ns = ATOM) => entry.getElementsByTagNameNS(ns, tag)[0]?.textContent.trim() ?? "";

  function parseCatalog(xml) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("The catalog is not valid XML.");
    return [...doc.getElementsByTagNameNS(ATOM, "entry")].map((e) => {
      const links = [...e.getElementsByTagNameNS(ATOM, "link")];
      const html = links.find((l) => l.getAttribute("type") === "text/html");
      const zim = links.find((l) => l.getAttribute("type") === "application/x-zim");
      const href = html?.getAttribute("href") ?? "";
      const tags = text(e, "tags").split(";");
      return {
        id: text(e, "id").replace(/^urn:uuid:/, ""),
        title: text(e, "title") || text(e, "name") || "Untitled",
        summary: text(e, "summary"),
        lang: text(e, "language").split(",")[0] || "",
        articles: Number(text(e, "articleCount")) || 0,
        size: Number(zim?.getAttribute("length")) || null,
        date: (text(e, "issued", DC) || text(e, "updated")).slice(0, 7),
        // /content/<book> -> kiwix's viewer with its toolbar
        href: href.startsWith("/content/") ? `/viewer#${href.slice("/content/".length)}` : href || "/",
        fulltext: tags.includes("_ftindex:yes"),
      };
    });
  }

  function monogramFor(title) {
    const words = title.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
    return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? words[0]?.[1] ?? "")).toUpperCase() || "?";
  }

  function renderBooks(books) {
    list.replaceChildren(
      ...books.map((b) => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.className = "row has-mono";
        a.href = b.href;
        const mono = document.createElement("span");
        mono.className = "monogram";
        mono.setAttribute("aria-hidden", "true");
        mono.textContent = monogramFor(b.title);
        const main = document.createElement("span");
        main.className = "row-main";
        const title = document.createElement("span");
        title.className = "row-title";
        title.textContent = b.title;
        if (b.summary) a.title = b.summary;
        const meta = document.createElement("span");
        meta.className = "row-meta";
        meta.textContent = [
          b.lang ? b.lang.toUpperCase() : "",
          b.articles ? `${b.articles.toLocaleString("en-US")} ARTICLES` : "",
          b.date,
          b.fulltext ? "" : "TITLES ONLY",
        ].filter(Boolean).join(" · ");
        main.append(title, meta);
        a.append(mono, main);
        if (b.size) {
          const v = document.createElement("span");
          v.className = "row-value";
          v.textContent = bytes(b.size);
          a.append(v);
        }
        a.append(icon("chevron"));
        li.append(a);
        return li;
      }),
    );
    list.hidden = books.length === 0;
    empty.hidden = books.length !== 0;
    $("books-count").textContent = `${books.length} INSTALLED`;
  }

  // Search scopes. kiwix-serve refuses a multi-book search across languages
  // ("confusion of tongues"), so whole-library search is per language;
  // single books are listed too. Only books with a full-text index count.
  function renderScopes(books) {
    const searchable = books.filter((b) => b.fulltext);
    const byLang = new Map();
    for (const b of searchable) byLang.set(b.lang, (byLang.get(b.lang) ?? 0) + 1);
    const langs = [...byLang].sort((x, y) => y[1] - x[1]);
    const opts = [];
    const opt = (value, label) => {
      const o = document.createElement("option");
      o.value = value;
      o.textContent = label;
      return o;
    };
    // "en" and "eng" are different languages to kiwix-serve but share a name
    const names = langs.map(([lang]) => langName(lang));
    langs.forEach(([lang, n], i) => {
      const dup = names.indexOf(names[i]) !== names.lastIndexOf(names[i]);
      const name = dup ? `${names[i]} (${lang.toUpperCase()})` : names[i];
      opts.push(opt(`lang:${lang}`, langs.length === 1 ? `All books (${n})` : `All ${name} books (${n})`));
    });
    if (searchable.length > 1) {
      const group = document.createElement("optgroup");
      group.label = "One book";
      group.append(...searchable.map((b) => opt(`id:${b.id}`, b.title)));
      opts.push(group);
    }
    const prev = scope.value;
    if (opts.length === 0) {
      opts.push(opt("", books.length ? "No book has a search index" : "No books installed"));
    }
    scope.replaceChildren(...opts);
    if ([...scope.options].some((o) => o.value === prev)) scope.value = prev;
    const ok = searchable.length > 0;
    scope.disabled = !ok;
    go.disabled = !ok;
  }

  $("search").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const pattern = $("q").value.trim();
    const [kind, value] = scope.value.split(/:(.*)/s);
    if (!pattern || !value) return;
    const params = new URLSearchParams({ pattern });
    params.set(kind === "id" ? "books.id" : "books.filter.lang", value);
    location.href = `/search?${params}`;
  });

  function setContext(books) {
    const total = books.reduce((s, b) => s + (b.size ?? 0), 0);
    const newest = books.map((b) => b.date).filter(Boolean).sort().pop();
    $("context-count").textContent = [
      `${books.length} ${books.length === 1 ? "BOOK" : "BOOKS"}`,
      total ? bytes(total) : "",
      newest ? `NEWEST ${newest}` : "",
    ].filter(Boolean).join(" · ");
  }

  let loading = false;
  async function load() {
    if (loading) return;
    loading = true;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 10_000);
    try {
      const res = await fetch(CATALOG, { signal: ctl.signal, cache: "no-store" });
      if (!res.ok) throw Object.assign(new Error(`kiwix-serve answered HTTP ${res.status}.`), { short: `HTTP ${res.status}` });
      const books = parseCatalog(await res.text()).sort((a, b) => a.title.localeCompare(b.title));
      renderBooks(books);
      renderScopes(books);
      setContext(books);
      errBox.hidden = true;
      strip.setLink("ok", `LOCAL · ${books.length} ${books.length === 1 ? "BOOK" : "BOOKS"}`);
    } catch (err) {
      // what happened, for the banner and (short) for the strip
      let reason = err.message || "Unknown error.";
      let short = err.short ?? "UNREADABLE";
      if (err.name === "AbortError") {
        reason = "kiwix-serve did not answer within 10 s.";
        short = "NO ANSWER";
      } else if (err.name === "TypeError") {
        reason = "Can't reach kiwix-serve on this box.";
        short = "NO LINK";
      }
      $("catalog-error-reason").textContent = reason;
      errBox.hidden = false;
      strip.setLink("crit", `LOCAL · ${short}`);
      $("context-count").textContent = "CATALOG UNAVAILABLE";
    } finally {
      clearTimeout(timer);
      loading = false;
    }
  }

  $("retry").addEventListener("click", load);
  // New downloads join the library while the page is open: re-read the
  // (local, cheap) catalog when the tab comes back into view.
  onVisibility((visible) => {
    if (visible) load();
  });
  load();
}
