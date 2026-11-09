import { createFileRoute } from "@tanstack/react-router";
import { Chats } from "../features/mesh/Chats";
import { CONV_RE } from "../features/mesh/format";

/** Conversations and the open thread; ?conv=ch:<index> | dm:<node num>. */
export const Route = createFileRoute("/mesh/")({
  validateSearch: (search: Record<string, unknown>): { conv?: string } =>
    typeof search.conv === "string" && CONV_RE.test(search.conv) ? { conv: search.conv } : {},
  component: ChatsRoute,
});

function ChatsRoute() {
  const { conv } = Route.useSearch();
  return <Chats conv={conv} />;
}
