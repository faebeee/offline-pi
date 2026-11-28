import type { ReactNode } from "react";
import { useMe } from "./auth";
import { Screen } from "./Screen";

/**
 * Route guard for an admin-only screen (manifest "admin": true): a user gets
 * the frame with "Admins only" (Screen draws it) and the screen itself never
 * mounts, so it doesn't ask core for data it won't get.
 */
export function AdminOnly({ id, children }: { id: string; children: ReactNode }) {
  const { isAdmin } = useMe();
  if (isAdmin) return <>{children}</>;
  return (
    <Screen module={id} title="Admins only">
      {null}
    </Screen>
  );
}
