import type { ReactNode } from "react";
import { Banner, Illustration, ThemeToggle } from "../ui/outpost";
import { AccountButton, useMe } from "./auth";
import { useModules } from "../features/modules/useModules";
import { Nav } from "./Nav";

/**
 * One screen in the Outpost frame (DESIGN.md section 6): header with the
 * module label, title and actions, an optional context line, the content
 * and the module nav. The status strip above it is shared (StripProvider).
 */
export function Screen({
  module,
  title,
  actions,
  context,
  bleed = false,
  children,
}: {
  /** module id ("home", "maps", ...), for the label and the nav */
  module: string;
  title: ReactNode;
  actions?: ReactNode;
  /** the .context line under the header (e.g. map zoom and coordinates) */
  context?: ReactNode;
  /** full-bleed content (maps) instead of the padded grid */
  bleed?: boolean;
  children: ReactNode;
}) {
  const { data } = useModules();
  const { isAdmin } = useMe();
  const entry = data?.modules.find((m) => m.id === module);
  const label = module === "home" ? "Home" : (entry?.label ?? module);
  // admin-only screens (System, Logs, Settings, Diagnostics, Users): core
  // refuses their data to others anyway; say so instead of showing errors
  const blocked = !!entry?.adminOnly && !isAdmin;
  return (
    <>
      <header className="header">
        <div className="header-title">
          <span className="label">{label}</span>
          <h1 className="h1">{title}</h1>
        </div>
        <div className="header-actions">
          {actions}
          <ThemeToggle />
          <AccountButton />
        </div>
      </header>
      {context && !blocked && (
        <div className="context" aria-live="off">
          {context}
        </div>
      )}
      <div className="frame-body">
        <main className={bleed && !blocked ? "content bleed" : "content grid-bg"}>
          {blocked ? (
            <>
              <Illustration name="lost" className="gate-art" />
              <Banner tone="info" title="Admins only">
                {label} is only open to admins. Ask an admin if you need something from it.
              </Banner>
            </>
          ) : (
            children
          )}
        </main>
        <Nav current={module} />
      </div>
    </>
  );
}
