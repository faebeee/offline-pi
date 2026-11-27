import { createFileRoute, Link } from "@tanstack/react-router";
import { Screen } from "../app/Screen";
import { Catalog, CatalogContext } from "../features/library/Catalog";
import { ModuleGate } from "../features/modules/ModuleGate";
import { Icon } from "../ui/outpost";

type Search = { starter?: boolean };

export const Route = createFileRoute("/library/catalog")({
  // ?starter=true: tick the emergency starter set (from the library home)
  validateSearch: (search: Record<string, unknown>): Search =>
    search.starter === true || search.starter === "true" ? { starter: true } : {},
  component: CatalogScreen,
});

/** Library: choose which books to download (and which to delete). */
function CatalogScreen() {
  const { starter } = Route.useSearch();
  return (
    <Screen
      module="knowledge"
      title="Choose books"
      context={<CatalogContext />}
      actions={
        <Link to="/library" className="btn btn-icon" aria-label="Back to the library" title="Library">
          <Icon name="back" />
        </Link>
      }
    >
      <ModuleGate id="knowledge">
        <Catalog starter={!!starter} />
      </ModuleGate>
    </Screen>
  );
}
