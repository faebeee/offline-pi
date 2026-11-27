import { createFileRoute } from "@tanstack/react-router";
import { SuppliesScreen } from "../features/supplies/SuppliesScreen";

/** Supplies: the household's emergency stock, expiry dates and days of water. */
export const Route = createFileRoute("/supplies")({ component: SuppliesScreen });
