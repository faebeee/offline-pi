import { createFileRoute } from "@tanstack/react-router";
import { InfoScreen } from "../features/info/InfoScreen";

/** Info: the documentation's start page (docs/README.md). Served by core, always on. */
export const Route = createFileRoute("/info/")({
  component: () => <InfoScreen slug="" />,
});
