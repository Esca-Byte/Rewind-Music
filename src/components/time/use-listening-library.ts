"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ListenerLibrary, ListeningMemory, TimeTrack } from "@/lib/time/types";

const LOCAL_STORAGE_KEY = "rewind_local_library_cache";

function readLocalCache(): ListenerLibrary {
  if (typeof window === "undefined") return { favorites: [], history: [] };
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return { favorites: [], history: [] };
    const parsed = JSON.parse(raw);
    return {
      favorites: Array.isArray(parsed?.favorites) ? parsed.favorites : [],
      history: Array.isArray(parsed?.history) ? parsed.history : [],
    };
  } catch {
    return { favorites: [], history: [] };
  }
}

function writeLocalCache(data: ListenerLibrary) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore quota errors
  }
}

export function useListeningLibrary() {
  const [library, setLibrary] = useState<ListenerLibrary>({ favorites: [], history: [] });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(new Set<string>());

  const load = useCallback(() => {
    const cached = readLocalCache();
    setLibrary(cached);
    setReady(true);
    setError("");
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const favorite = useCallback(async (track: TimeTrack, saved: boolean) => {
    if (pending.current.has(track.id)) return false;
    pending.current.add(track.id);
    try {
      setLibrary((prev) => {
        const updated = {
          ...prev,
          favorites: saved
            ? [track, ...prev.favorites.filter((t) => t.videoId !== track.videoId && t.id !== track.id)]
            : prev.favorites.filter((t) => t.id !== track.id && t.videoId !== track.videoId),
        };
        writeLocalCache(updated);
        return updated;
      });
      setError("");
      return true;
    } finally {
      pending.current.delete(track.id);
    }
  }, []);

  const listen = useCallback(async (track: TimeTrack) => {
    const memory: ListeningMemory = {
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      track,
      playedAt: new Date().toISOString(),
    };
    setLibrary((prev) => {
      const updated = {
        ...prev,
        history: [memory, ...prev.history.filter((item) => item.track.videoId !== track.videoId)].slice(0, 500),
      };
      writeLocalCache(updated);
      return updated;
    });
  }, []);

  return { ...library, ready, error, reload: load, favorite, listen };
}
