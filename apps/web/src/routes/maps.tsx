import { createFileRoute } from "@tanstack/react-router";
import { MapsScreen } from "../features/maps/MapsScreen";

/** Maps: offline vector maps, regions and saved places. */
export const Route = createFileRoute("/maps")({ component: MapsScreen });
