"use client";

import { useCallback, useEffect, useState } from "react";
import type { TimeTrack } from "@/lib/time/types";

const STORAGE_KEY = "rewind_listening_stats_v1";

export interface ListeningStatsSnapshot {
  totalSeconds: number;
  playCount: number;
  artists: Record<string, number>;
  genres: Record<string, number>;
  days: Record<string, number>;
}

const EMPTY_STATS: ListeningStatsSnapshot = {
  totalSeconds: 0,
  playCount: 0,
  artists: {},
  genres: {},
  days: {},
};

function readStats(): ListeningStatsSnapshot {
  if (typeof window === "undefined") return EMPTY_STATS;
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return {
      totalSeconds: Number(parsed?.totalSeconds) || 0,
      playCount: Number(parsed?.playCount) || 0,
      artists: parsed?.artists && typeof parsed.artists === "object" ? parsed.artists : {},
      genres: parsed?.genres && typeof parsed.genres === "object" ? parsed.genres : {},
      days: parsed?.days && typeof parsed.days === "object" ? parsed.days : {},
    };
  } catch {
    return EMPTY_STATS;
  }
}

function dayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function useListeningStats() {
  const [stats, setStats] = useState<ListeningStatsSnapshot>(EMPTY_STATS);

  useEffect(() => {
    const timer = window.setTimeout(() => setStats(readStats()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const record = useCallback((track: TimeTrack) => {
    setStats((previous) => {
      const next: ListeningStatsSnapshot = {
        totalSeconds: previous.totalSeconds + Math.max(0, track.duration || 0),
        playCount: previous.playCount + 1,
        artists: {
          ...previous.artists,
          [track.artist]: (previous.artists[track.artist] || 0) + 1,
        },
        genres: {
          ...previous.genres,
          [track.genre || "Unknown"]: (previous.genres[track.genre || "Unknown"] || 0) + 1,
        },
        days: {
          ...previous.days,
          [dayKey()]: (previous.days[dayKey()] || 0) + 1,
        },
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Statistics remain available for the current session.
      }
      return next;
    });
  }, []);

  return { stats, record };
}
