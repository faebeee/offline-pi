# Board

Board is a notice board on the Pi for everyone on its network or hotspot:
news, what people need, what they can offer, and who is where. No account
and no internet needed. Open it with Board in the module nav (`/board`).

## Kinds of posts

| Kind | Badge | For |
|---|---|---|
| Need | `NEED` | Something someone needs: medicine, a tool, help with a task. |
| Offer | `OFFER` | Something someone can give, lend or help with. |
| Check-in | `CHECK-IN` | Who is where and how they are: "Anna: safe, at the school". |
| Notice | `NOTICE` | News for everyone: "Water distribution at 18:00 at the town hall". |

## The screen

The context line shows how many needs are open, how many offers there are
and when the board last changed.

The chips at the top filter the posts: ALL, NEEDS, OFFERS, CHECK-INS,
NOTICES. Posts are cards, pinned ones first, then the newest change first.
Each card shows its kind, the name of who wrote it (if they gave one), when
it was posted, its headline and details.

The board refreshes itself every few seconds, so a phone left open on it
shows new posts.

## Posting

1. Press NEW POST.
2. Choose the kind. The hint below says what it is for.
3. Write a headline and, if needed, details: where, when, how to reach you.
4. Add your name if you like. The browser remembers it for your next post.
5. Press POST.

## Keeping it current

Each card has buttons:

| Button | What it does |
|---|---|
| MARK AS MET / TAKEN / OLD / OVER | The need was met, the offer taken, the check-in or notice is out of date. The post stays, crossed out, at the end. Press it again to bring it back. |
| EDIT | Change the post. |
| PIN / UNPIN | Keep the post at the top, for example the distribution times. Admins only. |
| Delete | Removes the post for good, after a question. Admins only. |

Done posts are hidden until you press SHOW `<N>` DONE POSTS at the end of
the list.

## Who can do what

Everyone with an account can post, edit and mark posts done. The name on a
post is only what its author typed, not the account. Only admins can pin
and delete posts (see [Users and login](14-users.md#admins-and-users)).

## Where the posts are

Board is part of outpost itself, like System and Logs: it is always
there and needs no installing. The posts are in `board.json` in
`CORE_DATA_DIR` (`./data/core` by default). The board holds up to 5000
posts. It exists only on this Pi: back it up
(see [Backup and restore](../04-operations/03-backup-and-restore.md)).
