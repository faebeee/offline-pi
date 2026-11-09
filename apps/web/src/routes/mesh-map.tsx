import { createFileRoute } from "@tanstack/react-router";
import { Screen } from "../app/Screen";
import { MeshMap } from "../features/mesh-map/MeshMap";
import { ModuleGate } from "../features/modules/ModuleGate";

type Search = { node?: string };

export const Route = createFileRoute("/mesh-map")({
  // ?node=!abcd1234 (Mesh's "Show on map") opens that node once it loads
  validateSearch: (search: Record<string, unknown>): Search =>
    typeof search.node === "string" && search.node ? { node: search.node } : {},
  component: MeshMapScreen,
});

/** Mesh map: live positions of the Meshtastic nodes on the downloaded regions. */
function MeshMapScreen() {
  const { node } = Route.useSearch();
  return (
    <Screen module="mesh-map" title="Node map" bleed>
      <ModuleGate id="mesh-map">
        <MeshMap linkedNode={node} />
      </ModuleGate>
    </Screen>
  );
}
