// Types for outpost.js (for TypeScript apps that import the synced copy).

export type ThemeMode = "dark" | "light";
export type Theme = "dark" | "light" | "neon" | "netrun" | "toxic";
export type ThemeInfo = { id: Theme; label: string; mode: ThemeMode; hint: string };
export const THEMES: readonly ThemeInfo[];
export type LinkState = "ok" | "cau" | "crit";
export type StatusState = "info" | "ok" | "cau" | "crit" | "off";
// built-in ids; modules added through a manifest are plain strings
export type ModuleId = "home" | "maps" | "mesh" | "knowledge" | "system" | (string & {});

/** `tone` colours the value: cau (elevated) or crit (act now). */
export type StripItem = { label: string; value: string; tone?: "cau" | "crit" };
export type Strip = {
  setLink(state: LinkState, label: string): void;
  /** the current screen's items, right before the clock */
  setItems(items: StripItem[]): void;
  /** host metrics shown on every screen, most important first */
  setHost(items: StripItem[]): void;
};

export const STATUS: Record<StatusState, { icon: string; cls: string }>;
export type ModuleEntry = { id: ModuleId; num: number; label: string; icon: string; path: string; running?: boolean };
export const MODULES: ModuleEntry[];
export function loadModules(): Promise<boolean>;

export function icon(name: string, className?: string): SVGSVGElement;
export function iconHtml(name: string, className?: string): string;
export function iconHref(name: string): string;
export function setSprite(url: string): void;
export function badgeHtml(state: StatusState, text: string, className?: string): string;
export function escapeHtml(text: string): string;
export function badge(state: StatusState, text: string, className?: string): HTMLSpanElement;

export function getTheme(): Theme;
export function getThemeMode(): ThemeMode;
export function initTheme(): Theme;
export function applyTheme(theme: Theme, persist?: boolean): void;
export function themeToggle(button: HTMLButtonElement): HTMLButtonElement;

export function moduleLabel(id: ModuleId): string;
export function moduleUrl(id: ModuleId, path?: string): string | null;
export function renderNav(nav: HTMLElement, current: ModuleId): HTMLElement;
export function statusStrip(el: HTMLElement): Strip;
export function frame(current: ModuleId, root?: ParentNode): { strip: Strip | null; modules: Promise<boolean> };

export function utcTime(d: Date | number | string): string;
export function utcClock(d: Date | number | string): string;
export function utcDateTime(d: Date | number | string): string;
export function utcDate(d: Date | number | string): string;
export function coords(lat: number, lon: number): string;
export function ago(seconds: number | null | undefined, now?: number): string;
export function bytes(n: number | null | undefined): string;
export function bearing(deg: number): string;
export function distance(meters: number): string;

export function progress(el: HTMLElement, ratio: number, cells?: number, tone?: "cau" | "crit"): void;
export function powerCells(el: HTMLElement, percent: number): void;
export function signalBars(el: HTMLElement, level: number): void;

export function toast(
  message: string,
  options?: { action?: string; onAction?: () => void; timeout?: number },
): () => void;
export function holdToConfirm(
  button: HTMLButtonElement,
  onConfirm: () => void,
  options?: { duration?: number; label?: string },
): () => void;
export function onVisibility(fn: (visible: boolean) => void): () => void;
