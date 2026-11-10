/**
 * The one fetch every generated function goes through (orval mutator).
 * Same origin, relative to the site root (core serves the web app and the
 * API on one port). Non-2xx answers throw ApiError with core's message.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** The module behind this domain is not running (503) or not installed (404 with module). */
  get moduleDown(): boolean {
    return this.status === 503;
  }
}

const PIN_KEY = "outpost-control-pin";

/** Control PIN for start/stop (CONTROL_PIN), kept for this browser tab. */
export const controlPin = {
  get(): string {
    try {
      return sessionStorage.getItem(PIN_KEY) ?? "";
    } catch {
      return "";
    }
  },
  set(pin: string) {
    try {
      if (pin) sessionStorage.setItem(PIN_KEY, pin);
      else sessionStorage.removeItem(PIN_KEY);
    } catch {
      // storage blocked: the PIN is asked again next time
    }
  },
};

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  const method = (options.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    // CSRF guard core asks for on state-changing calls
    headers.set("X-Pi-Monitor", "1");
    const pin = controlPin.get();
    if (pin && !headers.has("X-Control-Pin")) headers.set("X-Control-Pin", pin);
  }

  const res = await fetch(url, { ...options, headers });
  const text = res.status === 204 ? "" : await res.text();
  let body: unknown = undefined;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const m = (body as { message?: unknown } | undefined)?.message;
    const message = Array.isArray(m) ? m.join(", ") : typeof m === "string" ? m : `HTTP ${res.status}`;
    throw new ApiError(res.status, message, body);
  }
  return body as T;
}

export default apiFetch;

/** Error type of every generated hook (orval reads this export). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type ErrorType<E> = ApiError;
