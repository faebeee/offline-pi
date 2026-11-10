import { statusStrip, type LinkState, type Strip, type StripItem } from "@outpost/ui/outpost.js";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

const StripContext = createContext<Strip | null>(null);

/**
 * The status strip stays mounted across routes (its UTC clock keeps
 * ticking); each screen sets the link LED and items through useStrip*().
 */
export function StripProvider({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [strip, setStrip] = useState<Strip | null>(null);
  const bound = useRef(false);
  useEffect(() => {
    if (!ref.current || bound.current) return;
    bound.current = true;
    setStrip(statusStrip(ref.current));
  }, []);
  return (
    <StripContext.Provider value={strip}>
      <div ref={ref} />
      {children}
    </StripContext.Provider>
  );
}

/** The screen's link to its own data source: "<SOURCE> · <STATE>" (packages/ui/README.md). */
export function useStripLink(state: LinkState, label: string) {
  const strip = useContext(StripContext);
  useEffect(() => {
    strip?.setLink(state, label);
  }, [strip, state, label]);
}

/** Extra strip items for this screen; cleared when it unmounts. */
export function useStripItems(items: StripItem[]) {
  const strip = useContext(StripContext);
  const key = JSON.stringify(items);
  useEffect(() => {
    strip?.setItems(JSON.parse(key) as StripItem[]);
    return () => strip?.setItems([]);
  }, [strip, key]);
}
