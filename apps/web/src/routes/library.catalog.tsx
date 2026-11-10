import { createFileRoute, Link } from "@tanstack/react-router";
import { Screen } from "../app/Screen";
import { Catalog, CatalogContext } from "../features/library/Catalog";
import { ModuleGate } from "../features/modules/ModuleGate";
import { Icon } from "../ui/outpost";

export const Route = createFileRoute("/library/catalog")({
  component: CatalogScreen,
});

/** Library: choose which books to download (and which to delete). */
function CatalogScreen() {
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
        <Catalog />
      </ModuleGate>
    </Screen>
  );
}
