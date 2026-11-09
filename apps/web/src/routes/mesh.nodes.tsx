import { createFileRoute } from "@tanstack/react-router";
import { Nodes } from "../features/mesh/Nodes";

/** Every node the radio has heard of. */
export const Route = createFileRoute("/mesh/nodes")({ component: Nodes });
