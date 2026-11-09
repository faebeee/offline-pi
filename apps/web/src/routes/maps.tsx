import { createFileRoute } from "@tanstack/react-router";
import { MapsScreen } from "../features/maps/MapsScreen";

export const Route = createFileRoute("/maps")({ component: MapsScreen });
