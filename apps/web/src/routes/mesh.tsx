import { createFileRoute } from "@tanstack/react-router";
import { MeshLayout } from "../features/mesh/MeshLayout";

/** Mesh (Meshtastic chat): /mesh?conv=ch:0 (messages), /mesh/nodes. */
export const Route = createFileRoute("/mesh")({ component: MeshLayout });
