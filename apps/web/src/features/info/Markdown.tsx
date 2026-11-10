import type { InfoEntry } from "@offline-pi/api-client";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/** Text of a hast node (for heading ids). */
type HastNode = { type: string; value?: string; children?: HastNode[] };
function textOf(node: HastNode | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textOf).join("");
}

/** GitHub's heading anchors: "## Storage and SSD" -> "#storage-and-ssd". */
export function headingId(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");
}

/**
 * Where a link in docs/<file> points: another page (by its file), an anchor
 * on this page, the web, or a file of the project outside docs/.
 */
type Target =
  | { kind: "page"; slug: string; hash?: string }
  | { kind: "anchor"; hash: string }
  | { kind: "web"; href: string }
  | { kind: "file"; path: string };

export function resolveLink(href: string, file: string, entries: InfoEntry[]): Target {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return { kind: "web", href };
  if (href.startsWith("#")) return { kind: "anchor", hash: href.slice(1) };
  // resolve against the file's folder, as a file browser would
  const url = new URL(href, `http://docs/${file}`);
  const path = decodeURIComponent(url.pathname).replace(/^\//, "");
  const hash = url.hash ? url.hash.slice(1) : undefined;
  const asFile = path === "" || path.endsWith("/") ? `${path}README.md` : path;
  const hit = entries.find((e) => e.file === asFile) ?? entries.find((e) => e.file === `${asFile}/README.md`);
  if (hit) return { kind: "page", slug: hit.slug, hash };
  // e.g. ../AGENTS.md: a file of the project, not a page of the docs
  const outside = new URL(href, `http://repo/docs/${file}`).pathname.replace(/^\//, "");
  return { kind: "file", path: decodeURIComponent(outside) };
}

function DocLink({ href, file, entries, children }: { href: string; file: string; entries: InfoEntry[]; children: ReactNode }) {
  const t = resolveLink(href, file, entries);
  switch (t.kind) {
    case "page":
      return (
        <Link to="/info/$" params={{ _splat: t.slug }} hash={t.hash}>
          {children}
        </Link>
      );
    case "anchor":
      return (
        <a
          href={`#${t.hash}`}
          onClick={(e) => {
            const el = document.getElementById(t.hash);
            if (!el) return;
            e.preventDefault();
            el.scrollIntoView({ behavior: "smooth", block: "start" });
            history.replaceState(history.state, "", `#${t.hash}`);
          }}
        >
          {children}
        </a>
      );
    case "web":
      return (
        <a href={t.href} target="_blank" rel="noreferrer noopener" title={`${t.href} (needs internet)`}>
          {children}
        </a>
      );
    case "file":
      // not readable in the app: say which file of the project it is
      return (
        <span className="doc-file" title={`File in the project folder: ${t.path}`}>
          {children}
        </span>
      );
  }
}

/** One docs page rendered in the Outpost document style (.doc). */
export function Markdown({ markdown, file, entries }: { markdown: string; file: string; entries: InfoEntry[] }) {
  const heading =
    (Tag: "h1" | "h2" | "h3" | "h4"): Components["h1"] =>
    ({ node, children }) => <Tag id={headingId(textOf(node as HastNode))}>{children}</Tag>;

  const components: Components = {
    h1: heading("h1"),
    h2: heading("h2"),
    h3: heading("h3"),
    h4: heading("h4"),
    a: ({ href, children }) =>
      href ? (
        <DocLink href={href} file={file} entries={entries}>
          {children}
        </DocLink>
      ) : (
        <>{children}</>
      ),
    table: ({ children }) => (
      <div className="table-wrap">
        <table className="table">{children}</table>
      </div>
    ),
    // no images in the docs yet; say what would be there
    img: ({ alt }) => <span className="doc-file">{alt || "image"}</span>,
  };

  return (
    <div className="doc">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
