import { createFileRoute } from "@tanstack/react-router";
import { FilesScreen } from "../features/files/FilesScreen";

type Search = { path?: string };

export const Route = createFileRoute("/files")({
  // ?path=Photos/2026: the folder shown, linkable
  validateSearch: (search: Record<string, unknown>): Search => {
    const path = typeof search.path === "string" ? search.path.replace(/^\/+|\/+$/g, "") : "";
    return path && !path.split("/").some((p) => p === ".." || p === ".") ? { path } : {};
  },
  component: FilesRoute,
});

/** Files: a shared folder on the Pi (upload, download, folders). */
function FilesRoute() {
  const { path } = Route.useSearch();
  return <FilesScreen path={path ?? ""} />;
}
