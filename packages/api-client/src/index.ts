/**
 * @offline-pi/api-client: everything the web app needs to talk to core.
 *   - generated/: one file per domain (OpenAPI tag) with fetch functions,
 *     query keys and TanStack Query hooks; generated/model: every DTO
 *   - events.ts: typed Socket.IO namespaces (live updates)
 *   - fetcher.ts: ApiError and the control PIN
 * Regenerate with `npm run api:gen` at the repo root after changing core's API.
 */
export * from "./generated";
export * from "./generated/model";
export { ApiError, apiFetch, controlPin } from "./fetcher";
export * from "./events";
