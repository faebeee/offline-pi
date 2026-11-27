import { createFileRoute } from "@tanstack/react-router";
import { BoardScreen } from "../features/board/BoardScreen";

/** Board: news, needs, offers and check-ins of everyone on the Pi's network. */
export const Route = createFileRoute("/board")({ component: BoardScreen });
