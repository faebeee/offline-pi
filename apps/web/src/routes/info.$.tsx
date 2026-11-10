import { createFileRoute } from "@tanstack/react-router";
import { InfoScreen } from "../features/info/InfoScreen";

/** Info: one documentation page, /info/<chapter>/<page> (numeric prefixes and .md dropped). */
export const Route = createFileRoute("/info/$")({
  component: InfoPageRoute,
});

function InfoPageRoute() {
  const { _splat } = Route.useParams();
  return <InfoScreen slug={(_splat ?? "").replace(/\/+$/, "")} />;
}
