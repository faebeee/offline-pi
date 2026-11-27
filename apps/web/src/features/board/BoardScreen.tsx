import {
  boardCreate,
  boardRemove,
  boardUpdate,
  getBoardPostsQueryKey,
  getBoardStatusQueryKey,
  useBoardPosts,
  useBoardStatus,
  type BoardPost,
  type BoardPostKind,
  type UpdatePostRequest,
} from "@outpost/api-client";
import { ago, toast } from "@outpost/ui/outpost.js";
import type { StatusState } from "@outpost/ui/outpost.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { Dialog } from "../../app/Dialog";
import { Screen } from "../../app/Screen";
import { Badge, Banner, Icon, Illustration } from "../../ui/outpost";
import { ModuleGate } from "../modules/ModuleGate";
import { isRunning, useModule, withControlPin } from "../modules/useModules";
import "./board.css";

const POLL_MS = 10_000;
const AUTHOR_KEY = "outpost-board-author";

export const KINDS: Record<
  BoardPostKind,
  { label: string; plural: string; tone: StatusState; hint: string; title: string; done: string; undo: string }
> = {
  need: {
    label: "Need",
    plural: "Needs",
    tone: "crit",
    hint: "Something someone needs: medicine, a tool, help with a task.",
    title: "What is needed?",
    done: "Mark as met",
    undo: "Still needed",
  },
  offer: {
    label: "Offer",
    plural: "Offers",
    tone: "ok",
    hint: "Something you can give, lend or help with.",
    title: "What can you offer?",
    done: "Mark as taken",
    undo: "Offer again",
  },
  checkin: {
    label: "Check-in",
    plural: "Check-ins",
    tone: "info",
    hint: "Who is where and how they are: “Anna: safe, at the school”.",
    title: "Who and how?",
    done: "Mark as old",
    undo: "Current again",
  },
  notice: {
    label: "Notice",
    plural: "Notices",
    tone: "cau",
    hint: "News for everyone: water distribution at 18:00, the road is closed.",
    title: "Headline",
    done: "Mark as over",
    undo: "Current again",
  },
};

const ORDER: BoardPostKind[] = ["need", "offer", "checkin", "notice"];

function storedAuthor(): string {
  try {
    return localStorage.getItem(AUTHOR_KEY) ?? "";
  } catch {
    return "";
  }
}

function rememberAuthor(name: string) {
  try {
    if (name) localStorage.setItem(AUTHOR_KEY, name);
  } catch {
    // storage blocked: asked again next time
  }
}

/** Board: news, needs, offers and check-ins of everyone on the Pi's network. */
export function BoardScreen() {
  const running = isRunning(useModule("board"));
  const status = useBoardStatus({ query: { enabled: running, refetchInterval: POLL_MS } }).data;
  const open = (k: BoardPostKind) => status?.kinds[k].open ?? 0;
  const context = status
    ? [`${open("need")} open ${open("need") === 1 ? "need" : "needs"}`, `${open("offer")} ${open("offer") === 1 ? "offer" : "offers"}`, status.updatedAt ? `Updated ${ago(status.updatedAt)}` : null]
        .filter(Boolean)
        .join(" · ")
    : undefined;

  return (
    <Screen module="board" title="Notice board" context={running ? context : undefined}>
      <ModuleGate id="board">
        <Board />
      </ModuleGate>
    </Screen>
  );
}

type Filter = BoardPostKind | "all";
type Editing = { post: BoardPost | null; kind: BoardPostKind } | null;

function Board() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const posts = useBoardPosts(undefined, { query: { refetchInterval: POLL_MS } });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: getBoardPostsQueryKey() });
    void qc.invalidateQueries({ queryKey: getBoardStatusQueryKey() });
  };

  const all = posts.data ?? [];
  const shown = all.filter((p) => (filter === "all" || p.kind === filter) && (showDone || !p.done));
  const doneCount = all.filter((p) => p.done && (filter === "all" || p.kind === filter)).length;

  return (
    <div className="board vstack">
      <div className="board-bar">
        <div className="chips" role="group" aria-label="Show">
          <button type="button" className="chip" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
            All
          </button>
          {ORDER.map((k) => (
            <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {KINDS[k].plural}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setEditing({ post: null, kind: filter === "all" ? "notice" : filter })}
        >
          <Icon name="plus" />
          New post
        </button>
      </div>

      {posts.error && (
        <Banner tone="crit" title="Could not load the board">
          {posts.error.message}
        </Banner>
      )}

      {posts.isSuccess && all.length === 0 ? (
        <div className="empty">
          <Illustration name="board" />
          <p className="empty-title">The board is empty</p>
          <p>
            Post what you need, what you can offer, where you are, or news for everyone on the Pi's network. No
            account needed, and it works without internet.
          </p>
        </div>
      ) : (
        <>
          {posts.isSuccess && shown.length === 0 && (
            <p className="help">Nothing here{filter === "all" ? "" : ` under ${KINDS[filter].plural}`}.</p>
          )}
          <ul className="board-list">
            {shown.map((p) => (
              <PostCard key={p.id} post={p} onEdit={() => setEditing({ post: p, kind: p.kind })} onChanged={refresh} />
            ))}
          </ul>
          {doneCount > 0 && (
            <button type="button" className="btn btn-ghost board-more" onClick={() => setShowDone((v) => !v)}>
              {showDone ? "Hide done posts" : `Show ${doneCount} done ${doneCount === 1 ? "post" : "posts"}`}
            </button>
          )}
        </>
      )}

      {editing && <PostDialog editing={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    </div>
  );
}

function PostCard({ post: p, onEdit, onChanged }: { post: BoardPost; onEdit: () => void; onChanged: () => void }) {
  const k = KINDS[p.kind];
  const update = useMutation({
    mutationFn: (body: UpdatePostRequest) =>
      body.pinned !== undefined ? withControlPin("pin posts", () => boardUpdate(p.id, body)) : boardUpdate(p.id, body),
    onSettled: onChanged,
  });
  const remove = useMutation({
    mutationFn: () => withControlPin("delete posts", () => boardRemove(p.id)),
    onSuccess: () => toast("Post deleted."),
    onSettled: onChanged,
  });
  const error = update.error ?? remove.error;

  return (
    <li className={`card board-post${p.done ? " is-done" : ""}${p.pinned ? " is-pinned" : ""}`}>
      <div className="board-post-head">
        <Badge state={p.done ? "off" : k.tone} className="badge-sm">
          {k.label}
        </Badge>
        {p.pinned && <span className="badge badge-sm badge-acc">Pinned</span>}
        {p.done && <span className="label">Done</span>}
        <span className="board-post-meta label">
          {[p.author, ago(p.createdAt), p.updatedAt - p.createdAt > 60 ? `edited ${ago(p.updatedAt)}` : null]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      <h3 className="board-post-title">{p.title}</h3>
      {p.body && <p className="board-post-body">{p.body}</p>}
      <div className="board-post-actions">
        <button type="button" className="btn btn-sm" disabled={update.isPending} onClick={() => update.mutate({ done: !p.done })}>
          <Icon name={p.done ? "refresh" : "ok"} />
          {p.done ? k.undo : k.done}
        </button>
        <button type="button" className="btn btn-sm" onClick={onEdit}>
          <Icon name="edit" />
          Edit
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={update.isPending}
          aria-pressed={p.pinned}
          onClick={() => update.mutate({ pinned: !p.pinned })}
        >
          <Icon name="waypoint" />
          {p.pinned ? "Unpin" : "Pin"}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-icon"
          aria-label="Delete post"
          title="Delete"
          disabled={remove.isPending}
          onClick={() => window.confirm(`Delete "${p.title}"? This can't be undone.`) && remove.mutate()}
        >
          <Icon name="trash" />
        </button>
      </div>
      {error && (
        <Banner tone="crit" title="Did not work">
          {error.message}
        </Banner>
      )}
    </li>
  );
}

function PostDialog({ editing, onClose, onSaved }: { editing: NonNullable<Editing>; onClose: () => void; onSaved: () => void }) {
  const p = editing.post;
  const [kind, setKind] = useState<BoardPostKind>(editing.kind);
  const [title, setTitle] = useState(p?.title ?? "");
  const [body, setBody] = useState(p?.body ?? "");
  const [author, setAuthor] = useState(p ? (p.author ?? "") : storedAuthor());
  const ids = { title: useId(), body: useId(), author: useId() };
  const k = KINDS[kind];

  const save = useMutation({
    mutationFn: () => {
      const data = { kind, title: title.trim(), body: body.trim(), author: author.trim() };
      return p ? boardUpdate(p.id, data) : boardCreate(data);
    },
    onSuccess: () => {
      rememberAuthor(author.trim());
      onSaved();
      onClose();
      toast(p ? "Post saved." : "Posted.");
    },
  });

  useEffect(() => {
    document.getElementById(ids.title)?.focus();
  }, [ids.title]);

  return (
    <Dialog
      title={p ? "Edit post" : "New post"}
      onClose={onClose}
      onSubmit={() => title.trim() && save.mutate()}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending || !title.trim()}>
            <Icon name="send" />
            {p ? "Save" : "Post"}
          </button>
        </>
      }
    >
      <div className="seg" role="group" aria-label="Kind of post">
        {ORDER.map((o) => (
          <button key={o} type="button" aria-pressed={kind === o} onClick={() => setKind(o)}>
            {KINDS[o].label}
          </button>
        ))}
      </div>
      <p className="help">{k.hint}</p>
      <div className="field">
        <label className="label" htmlFor={ids.title}>
          {k.title}
        </label>
        <input id={ids.title} className="input" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label className="label" htmlFor={ids.body}>
          Details (optional)
        </label>
        <textarea
          id={ids.body}
          className="textarea"
          rows={4}
          maxLength={4000}
          placeholder="Where, when, how to reach you"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      <div className="field">
        <label className="label" htmlFor={ids.author}>
          Your name (optional)
        </label>
        <input id={ids.author} className="input" maxLength={60} autoComplete="name" value={author} onChange={(e) => setAuthor(e.target.value)} />
      </div>
      {save.error && (
        <Banner tone="crit" title="Not saved">
          {save.error.message}
        </Banner>
      )}
    </Dialog>
  );
}
