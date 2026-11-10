import { createFileRoute } from "@tanstack/react-router";
import { MapsScreen } from "../features/maps/MapsScreen";

type Search = { node?: string };

export const Route = createFileRoute("/maps")({
  // ?node=!abcd1234 (Mesh's "Show on map") shows the mesh nodes and opens that one
  validateSearch: (search: Record<string, unknown>): Search =>
    typeof search.node === "string" && search.node ? { node: search.node } : {},
  component: MapsRoute,
});

function MapsRoute() {
  const { node } = Route.useSearch();
  return <MapsScreen linkedNode={node} />;
}
