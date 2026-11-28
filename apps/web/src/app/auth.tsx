import {
  ApiError,
  authChangePassword,
  authLogin,
  authLogout,
  authSetup,
  getAuthStateQueryKey,
  useAuthState,
  type Account,
  type AuthState,
} from "@outpost/api-client";
import { toast } from "@outpost/ui/outpost.js";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { createContext, useContext, useId, useState, type FormEvent, type ReactNode } from "react";
import { Banner, Icon, Illustration, ThemeToggle } from "../ui/outpost";
import { Dialog } from "./Dialog";
import "./auth.css";

type Me = { user: Account; isAdmin: boolean };

const MeContext = createContext<Me | null>(null);

/** The logged-in account. Only used inside <AuthGate>, so it is always there. */
export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe() outside <AuthGate>");
  return me;
}

/**
 * The whole app is behind the login: until someone is logged in, this shows
 * the first-run setup (no account yet: create the admin) or the login, and
 * nothing else talks to core. Any 401 later (session ended) brings the
 * login back (main.tsx refetches the state).
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const state = useAuthState({ query: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: true } });
  if (state.isPending) return null;
  if (state.error && !state.data) {
    return (
      <AuthFrame title="outpost">
        <Banner
          tone="crit"
          title="Can't reach the Pi"
          action={
            <button type="button" className="btn btn-crit" onClick={() => void state.refetch()}>
              <Icon name="refresh" />
              Retry
            </button>
          }
        >
          {state.error.message}
        </Banner>
      </AuthFrame>
    );
  }
  const s = state.data!;
  if (s.setup) return <SetupScreen />;
  if (!s.user) return <LoginScreen />;
  return <MeContext.Provider value={{ user: s.user, isAdmin: s.user.role === "admin" }}>{children}</MeContext.Provider>;
}

/** The frame of the login and setup screens: header with the theme, a centred card. */
function AuthFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="auth">
      <header className="header">
        <div className="header-title">
          <span className="label">outpost</span>
          <h1 className="h1">{title}</h1>
        </div>
        <div className="header-actions">
          <ThemeToggle />
        </div>
      </header>
      <main className="auth-body grid-bg">
        <Illustration name="hero" className="auth-art" />
        <div className="card auth-card">{children}</div>
      </main>
    </div>
  );
}

function useSignedIn() {
  const qc = useQueryClient();
  return (state: AuthState) => {
    // the app mounts and connects with the new session
    qc.setQueryData(getAuthStateQueryKey(), state);
  };
}

const message = (err: unknown) => (err instanceof ApiError || err instanceof Error ? err.message : String(err));

/**
 * First run: no account exists yet. Creating the admin needs the one-time
 * setup code only someone with access to the Pi can read, so nobody else on
 * the network can claim it first.
 */
function SetupScreen() {
  const signedIn = useSignedIn();
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const mismatch = repeat.length > 0 && repeat !== password;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== repeat) return setError("The two passwords differ.");
    setBusy(true);
    setError(null);
    try {
      signedIn(await authSetup({ code, username, password }));
      toast("Admin account created.");
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame title="Welcome">
      <form className="auth-form" onSubmit={(e) => void submit(e)}>
        <h2 className="h2">Create the admin account</h2>
        <p className="body-sm fg2">
          outpost is only open to accounts. This first one is the admin: it can add other accounts, start and stop
          modules and delete shared data. Keep the password somewhere safe.
        </p>
        <div className="field">
          <label className="label" htmlFor={`${id}-c`}>
            Setup code
          </label>
          <input
            id={`${id}-c`}
            className="input mono"
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            autoFocus
            required
            maxLength={20}
            placeholder="XXXX-XXXX"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <span className="help">
            Shown at the end of <span className="mono">./install.sh</span> and <span className="mono">./start.sh</span> on the
            Pi, or with <span className="mono">./manage.sh users setup-code</span>.
          </span>
        </div>
        <div className="field">
          <label className="label" htmlFor={`${id}-u`}>
            User name
          </label>
          <input id={`${id}-u`} className="input" autoComplete="username" required maxLength={32} value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor={`${id}-p`}>
            Password (at least 8 characters)
          </label>
          <input id={`${id}-p`} className="input" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className={`field${mismatch ? " is-error" : ""}`}>
          <label className="label" htmlFor={`${id}-r`}>
            Password again
          </label>
          <input id={`${id}-r`} className="input" type="password" autoComplete="new-password" required aria-invalid={mismatch || undefined} value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          {mismatch && <span className="field-error">The two passwords differ.</span>}
        </div>
        {error && <Banner tone="crit" title="Not created">{error}</Banner>}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy || !code.trim() || password.length < 8 || mismatch}>
          Create and continue
        </button>
      </form>
    </AuthFrame>
  );
}

function LoginScreen() {
  const signedIn = useSignedIn();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      signedIn(await authLogin({ username, password }));
    } catch (err) {
      setError(message(err));
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame title="Log in">
      <form className="auth-form" onSubmit={(e) => void submit(e)}>
        <div className="field">
          <label className="label" htmlFor={`${id}-u`}>
            User name
          </label>
          <input id={`${id}-u`} className="input" autoComplete="username" autoFocus required value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor={`${id}-p`}>
            Password
          </label>
          <input id={`${id}-p`} className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <Banner tone="crit" title="Not logged in">{error}</Banner>}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          Log in
        </button>
        <p className="help">No account? Ask whoever runs this outpost. Forgot the admin password? On the Pi: ./manage.sh users reset-password NAME</p>
      </form>
    </AuthFrame>
  );
}

/** Header button: who is logged in, change password, Users (admins), log out. */
export function AccountButton() {
  const { user } = useMe();
  const [open, setOpen] = useState(false);
  const label = `Account: ${user.username}`;
  return (
    <>
      <button type="button" className="btn btn-icon" aria-label={label} title={label} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Icon name="user" />
      </button>
      {open && <AccountDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function AccountDialog({ onClose }: { onClose: () => void }) {
  const { user, isAdmin } = useMe();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  const change = async () => {
    setBusy(true);
    setError(null);
    try {
      await authChangePassword({ current, password });
      setCurrent("");
      setPassword("");
      toast("Password changed. Other devices are logged out.");
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await authLogout().catch(() => undefined);
    // drop every cache and live connection of this session
    window.location.assign("/");
  };

  return (
    <Dialog
      title={user.username}
      onClose={onClose}
      onSubmit={() => void change()}
      actions={
        <>
          <button type="button" className="btn btn-crit account-logout" onClick={() => void logout()}>
            <Icon name="power" />
            Log out
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !current || password.length < 8}>
            Change password
          </button>
        </>
      }
    >
      <p className="body-sm fg2">
        {isAdmin
          ? "Admin: you can also start and stop modules, block devices, delete shared data and manage the accounts."
          : "User: you can use every screen. Starting and stopping modules, blocking devices and deleting shared data is for admins."}
      </p>
      {isAdmin && (
        <Link to="/users" className="btn" onClick={onClose}>
          <Icon name="users" />
          Manage users
        </Link>
      )}
      <div className="field">
        <label className="label" htmlFor={`${id}-c`}>
          Current password
        </label>
        <input id={`${id}-c`} className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="field">
        <label className="label" htmlFor={`${id}-n`}>
          New password (at least 8 characters)
        </label>
        <input id={`${id}-n`} className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && <Banner tone="crit" title="Not changed">{error}</Banner>}
    </Dialog>
  );
}
