import { createFileRoute } from "@tanstack/react-router";
import { AdminOnly } from "../app/AdminOnly";
import { UsersScreen } from "../features/users/UsersScreen";

/** Users: the accounts that can open outpost (admins only). */
export const Route = createFileRoute("/users")({
  component: () => (
    <AdminOnly id="users">
      <UsersScreen />
    </AdminOnly>
  ),
});
