import {
  getMapsPoisQueryKey,
  mapsCreatePoi,
  mapsDeletePoi,
  mapsUpdatePoi,
  useMapsPois,
  type CreatePoiRequest,
  type Poi,
  type PoisResponse,
  type UpdatePoiRequest,
} from "@outpost/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

const EMPTY: Poi[] = [];

/**
 * Every saved place. POIs are small and global, so the whole set is loaded
 * once and kept in the query cache; viewport filtering happens client-side.
 */
export function usePois(enabled: boolean) {
  const qc = useQueryClient();
  const { data } = useMapsPois(undefined, { query: { enabled } });
  const [error, setError] = useState<string | null>(null);
  const key = getMapsPoisQueryKey();

  const edit = useCallback(
    (fn: (pois: Poi[]) => Poi[]) =>
      qc.setQueryData<PoisResponse>(key, (prev) => ({ pois: fn(prev?.pois ?? []) })),
    // the key is a constant
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc],
  );

  const create = useCallback(
    async (body: CreatePoiRequest): Promise<Poi | null> => {
      try {
        const poi = await mapsCreatePoi(body);
        edit((prev) => [...prev, poi]);
        setError(null);
        return poi;
      } catch (err) {
        setError((err as Error).message);
        return null;
      }
    },
    [edit],
  );

  /**
   * Applies the patch locally first so dragging a marker feels instant, then
   * reconciles with the server's copy (or rolls back if it refused).
   */
  const update = useCallback(
    async (id: string, body: UpdatePoiRequest): Promise<void> => {
      let previous: Poi | undefined;
      edit((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          previous = p;
          return { ...p, ...body };
        }),
      );
      try {
        const saved = await mapsUpdatePoi(id, body);
        edit((prev) => prev.map((p) => (p.id === id ? saved : p)));
        setError(null);
      } catch (err) {
        if (previous) {
          const rollback = previous;
          edit((prev) => prev.map((p) => (p.id === id ? rollback : p)));
        }
        setError((err as Error).message);
      }
    },
    [edit],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      try {
        await mapsDeletePoi(id);
        edit((prev) => prev.filter((p) => p.id !== id));
        setError(null);
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [edit],
  );

  const dismissError = useCallback(() => setError(null), []);
  const pois = data?.pois ?? EMPTY;
  return useMemo(
    () => ({ pois, error, dismissError, create, update, remove }),
    [pois, error, dismissError, create, update, remove],
  );
}
