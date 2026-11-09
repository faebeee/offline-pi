import { forwardRef } from "react";
import { useStripLink } from "../../app/strip";
import "./library.css";

/**
 * kiwix's viewer (its own toolbar, in-book search and navigation) in a
 * same-origin frame under core's passthrough, so the frame and nav stay.
 */
export const Reader = forwardRef<HTMLIFrameElement, { url: string; title: string }>(function Reader({ url, title }, ref) {
  useStripLink("ok", "LOCAL · READING");
  return <iframe ref={ref} className="lib-reader" src={url} title={title} />;
});
