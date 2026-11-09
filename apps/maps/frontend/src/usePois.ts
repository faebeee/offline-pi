import { useCallback, useEffect, useState } from "react";
import {
  createPoi,
  deletePoi,
  fetchPois,
  updatePoi,
  type CreatePoiRequest,
  type Poi,
  type UpdatePoiRequest,
} from "./api";

/**
 * The full list of points of interest. POIs are small and global, so the whole
 * set is loaded once and kept in memory; viewport filtering happens client-side.
 */
export function usePois() {
  const [pois, setPois] = useState<Poi[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPois()
      .then((next) => {
        if (!cancelled) setPois(next);
      })
      .catch(() => {
        // no backend yet; App surfaces the connection error
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const create = useCallback(async (body: CreatePoiRequest): Promise<Poi | null> => {
    try {
      const poi = await createPoi(body);
      setPois((prev) => [...prev, poi]);
      setError(null);
      return poi;
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  }, []);

  /**
   * Applies the patch locally first so dragging a marker feels instant, then
   * reconciles with the server's copy (or rolls back if it refused).
   */
  const update = useCallback(async (id: string, body: UpdatePoiRequest): Promise<void> => {
    let previous: Poi | undefined;
    setPois((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        previous = p;
        return { ...p, ...body };
      }),
    );

    try {
      const saved = await updatePoi(id, body);
      setPois((prev) => prev.map((p) => (p.id === id ? saved : p)));
      setError(null);
    } catch (err) {
      if (previous) {
        const rollback = previous;
        setPois((prev) => prev.map((p) => (p.id === id ? rollback : p)));
      }
      setError((err as Error).message);
    }
  }, []);

  const remove = useCallback(async (id: string): Promise<void> => {
    try {
      await deletePoi(id);
      setPois((prev) => prev.filter((p) => p.id !== id));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  return { pois, error, dismissError: () => setError(null), create, update, remove };
}
