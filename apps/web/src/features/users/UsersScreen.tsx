import {
  getUsersListQueryKey,
  usersCreate,
  usersRemove,
  usersUpdate,
  useUsersList,
  type Account,
} from "@outpost/api-client";
import { ago, toast } from "@outpost/ui/outpost.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useMe } from "../../app/auth";
import { Dialog } from "../../app/Dialog";
import { Screen } from "../../app/Screen";
import { Badge, Banner, Icon } from "../../ui/outpost";
import "./users.css";

/** Users: the accounts that can open outpost (admins only). */
export function UsersScreen() {
  const { isAdmin } = useMe();
  return (
    <Screen module="users" title="Users">
      {isAdmin ? (
        <Accounts />
      ) : (
        <Banner tone="info" title="Admins only">
          Only an admin can see and change the accounts. Your own password is in the account button at the top.
        </Banner>
      )}
    </Screen>
  );
}

type Editing = { kind: "add" } | { kind: "password"; account: Account } | null;

function Accounts() {
  const qc = useQueryClient();
  const { user: me } = useMe();
  const list = useUsersList();
  const [editing, setEditing] = useState<Editing>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: getUsersListQueryKey() });

  const change = useMutation({
    mutationFn: ({ a, role }: { a: Account; role: "admin" | "user" }) => usersUpdate(a.id, { role }),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (a: Account) => usersRemove(a.id),
    onSuccess: (_, a) => toast(`${a.username} deleted.`),
    onSettled: refresh,
  });
  const error = change.error ?? remove.error;
  const accounts = list.data ?? [];

  return (
    <div className="users vstack">
      <div className="users-bar">
        <p className="body-sm fg2">
          Everyone needs an account to open outpost. <b>Admins</b> can also start and stop modules, block devices,
          delete shared data and manage these accounts; <b>users</b> can do everything else.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => setEditing({ kind: "add" })}>
          <Icon name="plus" />
          Add user
        </button>
      </div>

      {list.error && (
        <Banner tone="crit" title="Could not load the accounts">
          {list.error.message}
        </Banner>
      )}
      {error && (
        <Banner tone="crit" title="Did not work">
          {error.message}
        </Banner>
      )}

      <ul className="list users-list">
        {accounts.map((a) => (
          <li key={a.id}>
            <div className="row-actions">
              <div className="row static has-mono">
                <span className="monogram" aria-hidden="true">
                  {a.username.slice(0, 2).toUpperCase()}
                </span>
                <span className="row-main">
                  <span className="row-title">
                    {a.username}
                    {a.id === me.id && <span className="users-you label"> · you</span>}
                  </span>
                  <span className="row-meta">{a.createdAt ? `Added ${ago(a.createdAt)}` : ""}</span>
                </span>
                <Badge state={a.role === "admin" ? "info" : "off"} className="badge-sm">
                  {a.role === "admin" ? "Admin" : "User"}
                </Badge>
              </div>
              <select
                className="select users-role"
                aria-label={`Role of ${a.username}`}
                value={a.role}
                disabled={change.isPending}
                onChange={(e) => change.mutate({ a, role: e.target.value as "admin" | "user" })}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
              <button
                type="button"
                className="btn btn-icon"
                aria-label={`New password for ${a.username}`}
                title="New password"
                onClick={() => setEditing({ kind: "password", account: a })}
              >
                <Icon name="edit" />
              </button>
              <button
                type="button"
                className="btn btn-icon"
                aria-label={`Delete ${a.username}`}
                title={a.id === me.id ? "You can't delete your own account" : "Delete"}
                disabled={a.id === me.id || remove.isPending}
                onClick={() => window.confirm(`Delete the account "${a.username}"? It is logged out at once.`) && remove.mutate(a)}
              >
                <Icon name="trash" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {editing?.kind === "add" && <AddDialog onClose={() => setEditing(null)} onSaved={refresh} />}
      {editing?.kind === "password" && <PasswordDialog account={editing.account} onClose={() => setEditing(null)} />}
    </div>
  );
}

function AddDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const id = useId();
  const save = useMutation({
    mutationFn: () => usersCreate({ username, password, role }),
    onSuccess: (a) => {
      onSaved();
      onClose();
      toast(`${a.username} added. Give them the password.`);
    },
  });
  return (
    <Dialog
      title="Add user"
      onClose={onClose}
      onSubmit={() => save.mutate()}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending || !username.trim() || password.length < 8}>
            Add
          </button>
        </>
      }
    >
      <div className="field">
        <label className="label" htmlFor={`${id}-u`}>
          User name
        </label>
        <input id={`${id}-u`} className="input" autoComplete="off" autoFocus required maxLength={32} value={username} onChange={(e) => setUsername(e.target.value)} />
        <span className="help">Letters, digits, dots, dashes or underscores.</span>
      </div>
      <div className="field">
        <label className="label" htmlFor={`${id}-p`}>
          Password (at least 8 characters)
        </label>
        <input id={`${id}-p`} className="input" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div className="field">
        <label className="label" htmlFor={`${id}-r`}>
          Role
        </label>
        <select id={`${id}-r`} className="select" value={role} onChange={(e) => setRole(e.target.value as "admin" | "user")}>
          <option value="user">User: uses every screen</option>
          <option value="admin">Admin: also controls outpost and manages accounts</option>
        </select>
      </div>
      {save.error && (
        <Banner tone="crit" title="Not added">
          {save.error.message}
        </Banner>
      )}
    </Dialog>
  );
}

function PasswordDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const id = useId();
  const save = useMutation({
    mutationFn: () => usersUpdate(account.id, { password }),
    onSuccess: () => {
      onClose();
      toast(`New password set. ${account.username} is logged out everywhere.`);
    },
  });
  return (
    <Dialog
      title={`New password for ${account.username}`}
      onClose={onClose}
      onSubmit={() => save.mutate()}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending || password.length < 8}>
            Set password
          </button>
        </>
      }
    >
      <div className="field">
        <label className="label" htmlFor={`${id}-p`}>
          New password (at least 8 characters)
        </label>
        <input id={`${id}-p`} className="input" type="password" autoComplete="new-password" autoFocus required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {save.error && (
        <Banner tone="crit" title="Not set">
          {save.error.message}
        </Banner>
      )}
    </Dialog>
  );
}
