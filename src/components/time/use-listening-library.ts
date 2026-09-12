"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ListenerLibrary, ListeningMemory, TimeTrack } from "@/lib/time/types";

const LOCAL_STORAGE_KEY = "rewind_local_library_cache";

function readLocalCache(): ListenerLibrary | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.favorites) && Array.isArray(parsed?.history)) {
      return parsed as ListenerLibrary;
    }
  } catch {
    // Ignore cache read errors
  }
  return null;
}

function writeLocalCache(data: ListenerLibrary) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore quota or write errors
  }
}

export function useListeningLibrary() {
  const [library, setLibrary] = useState<ListenerLibrary>({ favorites: [], history: [] });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(new Set<string>());
  const init = useRef<Promise<void> | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/library", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const fetched = data as ListenerLibrary;
      setLibrary(fetched);
      writeLocalCache(fetched);
      setReady(true);
      setError("");
    } catch {
      // If network/server failed, keep local cache
      setReady(true);
      setError("Your local collection could not sync with database.");
    }
  }, []);

  useEffect(() => {
    const cached = readLocalCache();
    if (cached) {
      setLibrary(cached);
    }
    init.current = load();
  }, [load]);

  const favorite = useCallback(async (track: TimeTrack, saved: boolean) => {
    await init.current;
    if (pending.current.has(track.id)) return false;
    pending.current.add(track.id);
    try {
      const response = await fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "favorite", track, saved }),
      });
      if (!response.ok) throw new Error("Could not save");
      setLibrary((prev) => {
        const updated = {
          ...prev,
          favorites: saved
            ? [track, ...prev.favorites.filter((t) => t.videoId !== track.videoId)]
            : prev.favorites.filter((t) => t.id !== track.id),
        };
        writeLocalCache(updated);
        return updated;
      });
      setError("");
      return true;
    } catch {
      // Fallback local update
      setLibrary((prev) => {
        const updated = {
          ...prev,
          favorites: saved
            ? [track, ...prev.favorites.filter((t) => t.videoId !== track.videoId)]
            : prev.favorites.filter((t) => t.id !== track.id),
        };
        writeLocalCache(updated);
        return updated;
      });
      setError("Saved to local cache.");
      return true;
    } finally {
      pending.current.delete(track.id);
    }
  }, []);

  const listen = useCallback(async (track: TimeTrack) => {
    await init.current;
    try {
      const response = await fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "listen", track }),
      });
      if (!response.ok) throw new Error("Could not save listening memory");
      const { memory } = (await response.json()) as { memory: ListeningMemory };
      setLibrary((prev) => {
        const updated = {
          ...prev,
          history: [memory, ...prev.history.filter((item) => item.id !== memory.id)].slice(0, 500),
        };
        writeLocalCache(updated);
        return updated;
      });
    } catch {
      // Fallback local memory recording
      const fallbackMemory: ListeningMemory = {
        id: `local-${Date.now()}`,
        track,
        playedAt: new Date().toISOString(),
      };
      setLibrary((prev) => {
        const updated = {
          ...prev,
          history: [fallbackMemory, ...prev.history.filter((item) => item.track.id !== track.id)].slice(0, 500),
        };
        writeLocalCache(updated);
        return updated;
      });
    }
  }, []);

  return { ...library, ready, error, reload: load, favorite, listen };
}

