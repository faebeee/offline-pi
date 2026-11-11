import { Link, Outlet, useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { Screen } from "../../app/Screen";
import { Banner, Icon } from "../../ui/outpost";
import { ModuleGate } from "../modules/ModuleGate";
import { isRunning, useModule } from "../modules/useModules";
import { batteryText, CONV_RE, hex, parseConv } from "./format";
import { meshUi, useMeshUi } from "./store";
import { useMesh, useMeshLive } from "./useMesh";
import "./mesh.css";

/** Keeps the live feed while the mesh screens are open (inside the gate). */
function MeshLive() {
  useMeshLive();
  return null;
}

const count = (n: number) => (n ? `· ${n > 99 ? "99+" : n}` : "");

/**
 * Mesh (Meshtastic chat): the frame shared by the Messages and Nodes views:
 * header title and back button, context line, status strip, pinned
 * banners and the view tabs. The views render in the Outlet.
 */
export function MeshLayout() {
  const running = isRunning(useModule("mesh"));
  const ui = useMeshUi();
  const mesh = useMesh(running);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const search = useSearch({ strict: false }) as { conv?: string };
  const view = /\/nodes\/?$/.test(pathname) ? "nodes" : "chats";
  const conv = view === "chats" && search.conv && CONV_RE.test(search.conv) ? search.conv : null;
  const s = mesh.status;
  const radio = s.state || "connecting";


  useEffect(() => {
    const before = document.title;
    document.title = s.longName ? `${s.longName} · Mesh` : "Mesh";
    return () => {
      document.title = before;
    };
  }, [s.longName]);

  const title = view === "nodes" ? "Nodes" : conv ? mesh.convTitle(conv) : "Messages";

  // the radio's facts (the status strip is the same on every screen)
  const me = s.nodeNum != null ? mesh.nodes.get(s.nodeNum) : undefined;
  const bat = radio === "connected" ? batteryText(me?.battery) : null;
  const context = [s.region, s.preset];
  if (conv) {
    const { kind, num } = parseConv(conv);
    context.push(kind === "ch" ? `CH ${num} · ${mesh.channelName(num)}` : `DM · ${hex(num)}`);
  } else if (mesh.nodes.size) {
    context.push(`${mesh.nodes.size} ${mesh.nodes.size === 1 ? "NODE" : "NODES"}`);
  }
  if (bat) context.push(`BAT ${bat}`);
  const contextText = context.filter(Boolean).join(" · ");

  const back = conv ? (
    <button
      type="button"
      className="btn btn-icon mesh-back"
      aria-label="Back to conversations"
      onClick={() => {
        meshUi.setLastConv(null);
        void navigate({ to: "/mesh", search: {} });
      }}
    >
      <Icon name="back" />
    </button>
  ) : null;

  let unreadTotal = 0;
  for (const c of mesh.convs) unreadTotal += meshUi.unread(c.conv, c.lastId);

  // the Messages tab reopens the conversation that was open
  const lastConv = conv ?? meshUi.lastConv();
  const chatsSearch = lastConv && CONV_RE.test(lastConv) ? { conv: lastConv } : {};

  // arrow keys move between the tabs (WAI-ARIA tabs pattern)
  const tabs = useRef<HTMLDivElement>(null);
  const onTabKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = view === "chats" ? "nodes" : "chats";
    void navigate(next === "nodes" ? { to: "/mesh/nodes" } : { to: "/mesh", search: chatsSearch }).then(() =>
      tabs.current?.querySelector<HTMLElement>(`#mesh-tab-${next}`)?.focus(),
    );
  };

  return (
    <Screen module="mesh" title={title} actions={back} context={running && contextText ? contextText : undefined} bleed={running}>
      <ModuleGate id="mesh">
        <MeshLive />
        <div className="mesh" data-view={view}>
          {(ui.live === "closed" || s.state === "disconnected" || mesh.error) && (
            <div className="pinned mesh-pinned">
              {ui.live === "closed" ? (
                <Banner tone="cau" title="Lost connection to the Pi">
                  Reconnecting. Messages shown here may be out of date.
                </Banner>
              ) : s.state === "disconnected" ? (
                <Banner tone="cau" title="Radio not connected">
                  {s.error ? `${s.error}. ` : ""}Message history is still available; sending works again once the radio is
                  back.
                </Banner>
              ) : null}
              {mesh.error && (
                <Banner tone="crit" title="Could not reach the Pi">
                  {mesh.error.message}. Check that the mesh module is running; this page retries when the live link comes
                  back.
                </Banner>
              )}
            </div>
          )}
          <div className="tabs" role="tablist" aria-label="Views" ref={tabs} onKeyDown={onTabKey}>
            <Link
              to="/mesh"
              search={chatsSearch}
              id="mesh-tab-chats"
              className="tab"
              role="tab"
              aria-selected={view === "chats"}
              tabIndex={view === "chats" ? 0 : -1}
            >
              Messages <span className="tab-count">{count(unreadTotal)}</span>
            </Link>
            <Link
              to="/mesh/nodes"
              id="mesh-tab-nodes"
              className="tab"
              role="tab"
              aria-selected={view === "nodes"}
              tabIndex={view === "nodes" ? 0 : -1}
            >
              Nodes <span className="tab-count">{count(mesh.nodes.size)}</span>
            </Link>
          </div>
          <Outlet />
        </div>
      </ModuleGate>
    </Screen>
  );
}
