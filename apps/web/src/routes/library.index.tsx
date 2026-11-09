import { createFileRoute } from "@tanstack/react-router";
import { Screen } from "../app/Screen";
import { Library, LibraryContext, type LibrarySearch } from "../features/library/Library";
import { ModuleGate } from "../features/modules/ModuleGate";

export const Route = createFileRoute("/library/")({
  // ?q=&scope=lang:eng|id:<uuid>&start=: search results, linkable
  validateSearch: (search: Record<string, unknown>): LibrarySearch => {
    const q = search.q == null ? "" : String(search.q).trim();
    const start = Number(search.start);
    return {
      q: q || undefined,
      scope: typeof search.scope === "string" && search.scope ? search.scope : undefined,
      start: Number.isInteger(start) && start > 0 ? start : undefined,
    };
  },
  component: LibraryScreen,
});

/** Library (kiwix): installed books and full-text search. */
function LibraryScreen() {
  const search = Route.useSearch();
  return (
    <Screen module="knowledge" title="Library" context={<LibraryContext />}>
      <ModuleGate id="knowledge">
        <Library search={search} />
      </ModuleGate>
    </Screen>
  );
}
