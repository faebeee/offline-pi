import { useEffect, useState } from "react";
import { Illustration } from "../ui/outpost";

const KEY = "outpost.booted";

function seen(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The terminal powering up: a short boot screen once per browser session
 * (DESIGN.md 0.6). It never blocks: it fades by itself after ~1.5 s, a tap
 * or key ends it, and it is skipped with reduced motion or motion-off.
 */
export function Boot() {
  const [show, setShow] = useState(
    () =>
      !seen() &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
      !document.documentElement.classList.contains("motion-off"),
  );

  useEffect(() => {
    if (!show) return;
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      // private mode: it shows again next time, that's all
    }
    const done = () => setShow(false);
    const timer = window.setTimeout(done, 1800);
    window.addEventListener("keydown", done);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", done);
    };
  }, [show]);

  if (!show) return null;
  return (
    <div className="boot grid-bg" aria-hidden="true" onClick={() => setShow(false)}>
      <div className="boot-inner">
        <Illustration name="generic" />
        <p className="boot-name">offline-pi</p>
        <ul className="boot-lines">
          <li>
            Field terminal <b>Loaded</b>
          </li>
          <li>
            Runs from <b>This Pi</b>
          </li>
          <li>
            Internet <b>Not required</b>
          </li>
          <li>
            Core link <b>Opening</b>
          </li>
        </ul>
      </div>
    </div>
  );
}
