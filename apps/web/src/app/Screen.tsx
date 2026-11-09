import type { ReactNode } from "react";
import { ThemeToggle } from "../ui/outpost";
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
  const label = module === "home" ? "Home" : (data?.modules.find((m) => m.id === module)?.label ?? module);
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
        </div>
      </header>
      {context && (
        <div className="context" aria-live="off">
          {context}
        </div>
      )}
      <div className="frame-body">
        <main className={bleed ? "content bleed" : "content grid-bg"}>{children}</main>
        <Nav current={module} />
      </div>
    </>
  );
}
