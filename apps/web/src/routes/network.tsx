import { createFileRoute } from "@tanstack/react-router";
import { NetworkScreen } from "../features/network/NetworkScreen";

/** Network: the devices on the Pi's hotspot (MAC, vendor, signal), block them. */
export const Route = createFileRoute("/network")({ component: NetworkScreen });
