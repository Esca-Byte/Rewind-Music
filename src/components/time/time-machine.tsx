"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, LoaderCircle, Rewind } from "lucide-react";

import {
  playlists,
  type Playlist,
} from "@/lib/time/playlists";
import { isTimeTrack, type TimeTrack } from "@/lib/time/types";
import { getSimilarTracks } from "@/lib/time/similar-tracks";
import { getTrackCoverUrl } from "@/components/time/album-object";
import {
  isTauriEnvironment,
  searchTracks,
  getDownloadsPath,
  downloadTrackOffline,
  scanDownloadsFolder,
  deleteDownloadedTrack,
  minimizeAppWindow,
  toggleMaximizeAppWindow,
  closeAppWindow,
  isAppWindowMaximized,
  fetchSpotifyPlaylist,
  matchSpotifyTracksBatch,
  showMiniPlayerWindow,
  hideMiniPlayerWindow,
  restoreAppWindow,
} from "@/lib/tauri-audio";
import { emit, listen } from "@tauri-apps/api/event";
import {
  MINI_PLAYER_COMMAND_EVENT,
  MINI_PLAYER_READY_EVENT,
  MINI_PLAYER_STATE_EVENT,
  type MiniPlayerCommand,
  type MiniPlayerSnapshot,
} from "@/lib/mini-player";

import type {
  UserPlaylist,
  DownloadedSong,
  View,
  ActivePlaylistDisplay,
  AppTheme,
} from "@/types/music";

// Subcomponents
import { Topbar } from "@/components/layout/Topbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { PersistentPlayer } from "@/components/player/PersistentPlayer";
import { QueueDrawer } from "@/components/player/QueueDrawer";
import { AddPlaylistDialog } from "@/components/dialogs/AddPlaylistDialog";
import { AddToPlaylistDialog } from "@/components/dialogs/AddToPlaylistDialog";
import { TrackDetailsDialog } from "@/components/dialogs/TrackDetailsDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";

// Views
import { ExploreView } from "@/components/views/ExploreView";
import { PlaylistView } from "@/components/views/PlaylistView";
import { SearchView } from "@/components/views/SearchView";
import { LibraryView } from "@/components/views/LibraryView";
import { DownloadsView } from "@/components/views/DownloadsView";
import { SettingsView } from "@/components/views/SettingsView";
import { StatsView } from "@/components/views/StatsView";

// Core hooks & plugins
import { useListeningLibrary } from "./use-listening-library";
import { useListeningStats } from "./use-listening-stats";
import { useTimePlayer } from "./use-time-player";
import { useMediaKeys } from "./use-media-keys";
import { useSleepTimer } from "./use-sleep-timer";

export type { UserPlaylist, DownloadedSong };

function localDay(value: string | Date | number) {
  const date = typeof value === "string" || typeof value === "number" ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

const SPOTIFY_SYNC_CACHE_KEY = "rewind_spotify_sync_cache_v1";
const SEARCH_CACHE_KEY = "rewind_search_cache_v1";

type CachedSpotifyTrack = {
  sourceId: string;
  track: TimeTrack;
};

type CachedSpotifyPlaylist = {
  spotifyId: string;
  syncedAt: number;
  title: string;
  tagline: string;
  cover: string;
  tracks: CachedSpotifyTrack[];
};

type SpotifySyncState = {
  active: boolean;
  completed: number;
  total: number;
  current: string;
  failed: number;
};

function readSpotifySyncCache(): Record<string, CachedSpotifyPlaylist> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SPOTIFY_SYNC_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSpotifySyncCache(cache: Record<string, CachedSpotifyPlaylist>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SPOTIFY_SYNC_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Sync still works when browser storage is unavailable.
  }
}

function readSearchCache(query: string): TimeTrack[] | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(SEARCH_CACHE_KEY) || "{}");
    const entry = parsed?.[query];
    if (entry?.savedAt && Date.now() - entry.savedAt < 1000 * 60 * 60 * 24 && Array.isArray(entry.tracks)) {
      return entry.tracks;
    }
  } catch {
    // Search caching is optional.
  }
  return null;
}

function writeSearchCache(query: string, tracks: TimeTrack[]) {
  if (typeof window === "undefined") return;
  try {
    const parsed = JSON.parse(localStorage.getItem(SEARCH_CACHE_KEY) || "{}");
    const entries = Object.entries({ ...parsed, [query]: { savedAt: Date.now(), tracks } })
      .sort(([, left], [, right]) => Number((right as { savedAt?: number }).savedAt || 0) - Number((left as { savedAt?: number }).savedAt || 0))
      .slice(0, 40);
    localStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Search caching is optional.
  }
}

async function resolveSpotifyPlaylist(
  sourceId: string,
  genre: string,
  cachedBySourceId = new Map<string, TimeTrack>()
) {
  const source = await fetchSpotifyPlaylist(sourceId);
  const tracksToMatch = source.tracks.filter((item) => !cachedBySourceId.has(item.id));
  const matches = tracksToMatch.length ? await matchSpotifyTracksBatch(tracksToMatch) : [];
  let matchIndex = 0;
  const cacheEntries: CachedSpotifyTrack[] = [];
  const tracks = source.tracks.flatMap((item) => {
    const cachedTrack = cachedBySourceId.get(item.id);
    const match = cachedTrack ? null : matches[matchIndex++];
    if (!cachedTrack && !match?.videoId) return [];
    const track = cachedTrack
      ? {
          ...cachedTrack,
          title: item.title,
          artist: item.artist,
          album: source.title,
          genre,
          duration: item.duration || cachedTrack.duration,
        }
      : {
          id: `sp-${match!.videoId}`,
          videoId: match!.videoId,
          title: item.title,
          artist: item.artist,
          album: source.title,
          genre,
          year: new Date().getFullYear(),
          duration: match!.duration || item.duration || 180,
          cover: match!.cover || source.cover || `https://i.ytimg.com/vi/${match!.videoId}/hqdefault.jpg`,
          source: "youtube" as const,
        };
    cacheEntries.push({ sourceId: item.id, track });
    return [{
      ...track,
    }];
  });
  return { source, tracks, cacheEntries };
}

export function TimeMachine() {
  const [view, setView] = useState<View>("explore");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TimeTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchedFor, setSearchedFor] = useState("");
  const [toast, setToast] = useState("");
  const [details, setDetails] = useState<TimeTrack | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [memoryDate, setMemoryDate] = useState("");
  const [today, setToday] = useState("");
  const [downloadedSongs, setDownloadedSongs] = useState<DownloadedSong[]>([]);
  const [syncingDownloads, setSyncingDownloads] = useState<boolean>(false);
  const [electronDownloadsPath, setElectronDownloadsPath] = useState<string>("");
  const [isElectron, setIsElectron] = useState<boolean>(false);
  const [offlineMode, setOfflineMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("rewind-offline-mode") === "true";
  });
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>("kpop-2026");
  const [curatedPlaylists, setCuratedPlaylists] = useState<Playlist[]>(playlists);
  const [spotifySync, setSpotifySync] = useState<SpotifySyncState>({
    active: false,
    completed: 0,
    total: 0,
    current: "",
    failed: 0,
  });

  // Custom User Playlists
  const [customPlaylists, setCustomPlaylists] = useState<UserPlaylist[]>([]);
  const [newPlaylistOpen, setNewPlaylistOpen] = useState(false);
  const [addToPlaylistTrack, setAddToPlaylistTrack] = useState<TimeTrack | null>(null);
  const [refreshingPlaylistId, setRefreshingPlaylistId] = useState<string | null>(null);

  // Navigation history & window controls
  const [viewHistory, setViewHistory] = useState<View[]>(["explore"]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isMaximized, setIsMaximized] = useState(false);
  const [theme, setTheme] = useState<AppTheme>("analog");

  const searchInput = useRef<HTMLInputElement>(null);
  const searchId = useRef(0);
  const searchAbort = useRef<AbortController | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lookupCache = useRef(new Map<string, TimeTrack[]>());
  const smartQueueSeed = useRef("");

  const notify = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(""), 2800);
  }, []);

  const handleTrackError = useCallback(
    (failedTrack: TimeTrack, reason: string) => {
      notify(`Skipped "${failedTrack.title}" (${reason})`);
    },
    [notify]
  );

  const library = useListeningLibrary();
  const listeningStats = useListeningStats();
  const allTracks = useMemo(() => curatedPlaylists.flatMap((playlist) => playlist.tracks), [curatedPlaylists]);
  const initialTrack = playlists[0]?.tracks[0] || allTracks[0];
  const listenAndRecord = useCallback((nextTrack: TimeTrack) => {
    void library.listen(nextTrack);
    listeningStats.record(nextTrack);
  }, [library.listen, listeningStats.record]);
  const player = useTimePlayer(initialTrack, listenAndRecord, handleTrackError, offlineMode);
  const playing = player.status === "playing";

  useMediaKeys({
    onPlay: () => void player.play(),
    onPause: player.pause,
    onNextTrack: player.next,
    onPreviousTrack: player.previous,
    metadata: player.track
      ? {
          title: player.track.title,
          artist: player.track.artist,
          album: player.track.album,
          artwork: getTrackCoverUrl(player.track)
            ? [{ src: getTrackCoverUrl(player.track), sizes: "512x512", type: "image/jpeg" }]
            : [],
        }
      : null,
    status: player.status,
    duration: player.duration,
    position: player.position,
  });

  const handleSleepTimerExpired = () => {
    player.audioRef.current?.pause();
    notify("Sleep timer ended. Playback paused.");
  };
  const sleepTimer = useSleepTimer(handleSleepTimerExpired);

  const isCurrentTrackSaved = useMemo(
    () => library.favorites.some((item) => item.videoId === player.track.videoId),
    [library.favorites, player.track.videoId]
  );

  const miniSnapshot: MiniPlayerSnapshot = useMemo(
    () => ({
      track: player.track,
      playing,
      status: player.status,
      position: player.position,
      duration: player.duration,
      volume: player.volume,
      muted: player.muted,
      theme,
      isSaved: isCurrentTrackSaved,
    }),
    [
      player.track,
      playing,
      player.status,
      player.position,
      player.duration,
      player.volume,
      player.muted,
      theme,
      isCurrentTrackSaved,
    ]
  );

  const miniSnapshotRef = useRef(miniSnapshot);
  useEffect(() => {
    miniSnapshotRef.current = miniSnapshot;
  }, [miniSnapshot]);

  const emitMiniSnapshot = useCallback(() => {
    if (isTauriEnvironment()) void emit(MINI_PLAYER_STATE_EVENT, miniSnapshotRef.current);
  }, []);


  const activePlaylist: ActivePlaylistDisplay = useMemo(() => {
    const custom = customPlaylists.find((p) => p.id === selectedPlaylistId);
    if (custom) {
      return {
        id: custom.id,
        title: custom.title,
        tagline: custom.description || "Custom user playlist",
        cover:
          custom.tracks[0]?.cover ||
          custom.cover ||
          "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&q=80",
        accent: custom.accent || "#e0a82e",
        url: custom.spotifyId
          ? `https://open.spotify.com/playlist/${custom.spotifyId}`
          : custom.youtubeId
          ? `https://www.youtube.com/playlist?list=${custom.youtubeId}`
          : "",
        spotifyId: custom.spotifyId,
        youtubeId: custom.youtubeId,
        totalDuration: custom.tracks.reduce(
          (sum, t) => sum + (t.duration || 180),
          0
        ),
        trackCount: custom.tracks.length,
        tracks: custom.tracks,
        isCustom: true,
      };
    }
    const curated = curatedPlaylists.find((playlist) => playlist.id === selectedPlaylistId) ?? curatedPlaylists[0];
    return { ...curated, isCustom: false };
  }, [selectedPlaylistId, customPlaylists, curatedPlaylists]);

  const recommendationPool = useMemo(() => {
    const tracks = [
      ...allTracks,
      ...activePlaylist.tracks,
      ...customPlaylists.flatMap((playlist) => playlist.tracks),
      ...library.favorites,
      ...library.history.map((memory) => memory.track),
    ];
    const seen = new Set<string>();
    return tracks.filter((candidate) => {
      const key = candidate.videoId || candidate.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [activePlaylist.tracks, allTracks, customPlaylists, library.favorites, library.history]);

  const personalizedTracks = useMemo(() => {
    const genreWeights = new Map<string, number>();
    const artistWeights = new Map<string, number>();
    library.history.slice(0, 40).forEach((memory, index) => {
      const weight = Math.max(1, 12 - index * 0.25);
      genreWeights.set(memory.track.genre, (genreWeights.get(memory.track.genre) || 0) + weight);
      artistWeights.set(memory.track.artist, (artistWeights.get(memory.track.artist) || 0) + weight);
    });
    const favoriteIds = new Set(library.favorites.map((track) => track.videoId));
    return [...allTracks]
      .map((track, index) => ({
        track,
        score:
          (favoriteIds.has(track.videoId) ? 18 : 0) +
          (genreWeights.get(track.genre) || 0) * 2 +
          (artistWeights.get(track.artist) || 0) +
          Math.max(0, 2 - index / Math.max(1, allTracks.length)),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 12)
      .map(({ track }) => track);
  }, [allTracks, library.favorites, library.history]);

  const syncDefaultPlaylists = useCallback(async () => {
    if (!isTauriEnvironment()) return;
    const remotePlaylists = playlists.filter((playlist) => playlist.spotifyId);
    if (!remotePlaylists.length) return;

    const cache = readSpotifySyncCache();
    setCuratedPlaylists((current) => current.map((playlist) => {
      const cached = cache[playlist.id];
      if (!cached?.tracks?.length) return playlist;
      const tracks = cached.tracks.map((entry) => entry.track);
      return {
        ...playlist,
        title: cached.title || playlist.title,
        tagline: cached.tagline || playlist.tagline,
        cover: cached.cover || playlist.cover,
        tracks,
        trackCount: tracks.length,
        totalDuration: tracks.reduce((sum, track) => sum + (track.duration || 0), 0),
      };
    }));

    setSpotifySync({ active: true, completed: 0, total: remotePlaylists.length, current: "Starting…", failed: 0 });
    let completed = 0;
    let failed = 0;

    await Promise.all(remotePlaylists.map(async (playlist) => {
      setSpotifySync((state) => ({ ...state, current: `Syncing ${playlist.title}…` }));
      try {
        const cachedBySourceId = new Map(
          (cache[playlist.id]?.tracks || []).map((entry) => [entry.sourceId, entry.track])
        );
        const resolved = await resolveSpotifyPlaylist(playlist.spotifyId!, playlist.title, cachedBySourceId);
        cache[playlist.id] = {
          spotifyId: playlist.spotifyId!,
          syncedAt: Date.now(),
          title: resolved.source.title,
          tagline: resolved.source.description || playlist.tagline,
          cover: resolved.source.cover || playlist.cover,
          tracks: resolved.cacheEntries,
        };
        writeSpotifySyncCache(cache);
        setCuratedPlaylists((current) => current.map((item) => item.id === playlist.id
          ? {
              ...item,
              title: resolved.source.title,
              tagline: resolved.source.description || item.tagline,
              cover: resolved.source.cover || item.cover,
              trackCount: resolved.tracks.length,
              totalDuration: resolved.tracks.reduce((sum, track) => sum + (track.duration || 0), 0),
              tracks: resolved.tracks,
            }
          : item));
      } catch (error) {
        failed += 1;
        console.warn(`Could not sync ${playlist.title}:`, error);
      } finally {
        completed += 1;
        setSpotifySync((state) => ({
          ...state,
          completed,
          failed,
          current: completed < remotePlaylists.length ? state.current : "Sync complete",
        }));
      }
    }));

    setSpotifySync((state) => ({ ...state, active: false, current: failed ? "Sync finished with some unavailable playlists" : "Sync complete" }));
    if (failed < remotePlaylists.length) {
      notify(`Auto-sync complete · ${remotePlaylists.length - failed} playlist${remotePlaylists.length - failed === 1 ? "" : "s"} updated`);
    } else {
      notify("Spotify playlists could not be synced");
    }
  }, [notify]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void syncDefaultPlaylists();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [syncDefaultPlaylists]);

  const similarTracks = useMemo(
    () => getSimilarTracks(player.track, recommendationPool, 8),
    [player.track, recommendationPool]
  );

  const playSimilarTracks = useCallback(() => {
    const current = player.track;
    const existing = player.queue.filter(
      (candidate) => candidate.videoId !== current.videoId && candidate.id !== current.id
    );
    const additions = similarTracks.filter(
      (candidate) =>
        !existing.some(
          (queued) => queued.videoId === candidate.videoId || queued.id === candidate.id
        )
    );
    const nextQueue = [current, ...existing, ...additions];
    const first = additions[0] || existing[0];
    if (!first) {
      notify("No similar tracks found for this song.");
      return;
    }
    player.choose(first, nextQueue);
    notify(`Smart queue added ${additions.length || 1} similar track${(additions.length || 1) === 1 ? "" : "s"}.`);
  }, [notify, player, similarTracks]);

  useEffect(() => {
    if (
      !playing ||
      !player.duration ||
      player.position < Math.max(1, player.duration - 12) ||
      player.queue.length > 1 ||
      smartQueueSeed.current === player.track.id
    ) {
      return;
    }
    smartQueueSeed.current = player.track.id;
    const additions = getSimilarTracks(player.track, recommendationPool, 5);
    additions.forEach((candidate) => player.addToQueue(candidate));
  }, [player, playing, recommendationPool]);

  const persistCustomPlaylists = useCallback((next: UserPlaylist[]) => {
    setCustomPlaylists(next);
    try {
      localStorage.setItem("rewind-user-playlists", JSON.stringify(next));
    } catch {
      /* empty */
    }
  }, []);

  const handleExportPlaylists = useCallback(() => {
    const payload = {
      app: "Rewind Music Player",
      version: 1,
      exportedAt: new Date().toISOString(),
      playlists: customPlaylists,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `rewind-playlists-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify(`Backed up ${customPlaylists.length} playlist${customPlaylists.length === 1 ? "" : "s"}`);
  }, [customPlaylists, notify]);

  const handleImportPlaylists = useCallback(async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      const incoming = Array.isArray(parsed) ? parsed : parsed?.playlists;
      if (!Array.isArray(incoming)) throw new Error("This file does not contain Rewind playlists.");

      const valid = incoming.filter((playlist): playlist is UserPlaylist => {
        return Boolean(
          playlist &&
            typeof playlist === "object" &&
            typeof playlist.id === "string" &&
            typeof playlist.title === "string" &&
            Array.isArray(playlist.tracks) &&
            playlist.tracks.every(isTimeTrack)
        );
      });
      if (!valid.length) throw new Error("No valid playlists were found in that backup.");

      const merged = new Map(customPlaylists.map((playlist) => [playlist.id, playlist]));
      valid.slice(0, 100).forEach((playlist) => merged.set(playlist.id, playlist));
      persistCustomPlaylists(Array.from(merged.values()));
      notify(`Restored ${valid.length} playlist${valid.length === 1 ? "" : "s"}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not restore that playlist backup.");
    }
  }, [customPlaylists, notify, persistCustomPlaylists]);

  const handleCreatePlaylist = useCallback(
    (
      title: string,
      description?: string,
      singleTrack?: TimeTrack,
      initialTracks?: TimeTrack[],
      cover?: string,
      youtubeId?: string,
      spotifyId?: string
    ) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      const colors = [
        "#1db954",
        "#e0a82e",
        "#ec4899",
        "#8b5cf6",
        "#3b82f6",
        "#10b981",
        "#f97316",
        "#06b6d4",
      ];
      const tracks =
        initialTracks && initialTracks.length
          ? initialTracks
          : singleTrack
          ? [singleTrack]
          : [];
      const newPl: UserPlaylist = {
        id: `user-${Date.now()}`,
        title: trimmed,
        description:
          description?.trim() ||
          (spotifyId
            ? "Imported from Spotify"
            : youtubeId
            ? "Imported from YouTube"
            : "User created playlist"),
        createdAt: Date.now(),
        tracks,
        accent: spotifyId ? "#1db954" : colors[customPlaylists.length % colors.length],
        cover:
          cover ||
          tracks[0]?.cover ||
          "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&q=80",
        youtubeId,
        spotifyId,
      };
      const updated = [newPl, ...customPlaylists];
      persistCustomPlaylists(updated);
      notify(`Added playlist "${trimmed}" (${tracks.length} tracks)`);
      setSelectedPlaylistId(newPl.id);
      setView("playlists");
    },
    [customPlaylists, persistCustomPlaylists, notify]
  );

  const handleRefreshPlaylist = useCallback(async (playlistId: string) => {
    const custom = customPlaylists.find((item) => item.id === playlistId && item.spotifyId);
    const curated = curatedPlaylists.find((item) => item.id === playlistId && item.spotifyId);
    const sourceId = custom?.spotifyId || curated?.spotifyId;
    if (!sourceId) return;
    setRefreshingPlaylistId(playlistId);
    try {
      const resolved = await resolveSpotifyPlaylist(sourceId, custom?.tracks[0]?.genre || curated?.title || "Spotify Import");
      if (!resolved) return;
      if (custom) {
        const updated = customPlaylists.map((item) => item.id === playlistId
          ? { ...item, title: resolved.source.title, description: resolved.source.description || item.description, cover: resolved.source.cover || item.cover, tracks: resolved.tracks }
          : item);
        persistCustomPlaylists(updated);
      } else {
        setCuratedPlaylists((current) => current.map((item) => item.id === playlistId
          ? { ...item, title: resolved.source.title, tagline: resolved.source.description || item.tagline, cover: resolved.source.cover || item.cover, trackCount: resolved.tracks.length, totalDuration: resolved.tracks.reduce((sum, track) => sum + track.duration, 0), tracks: resolved.tracks }
          : item));
      }
      notify(`Refreshed ${resolved.source.title} with ${resolved.tracks.length} playable tracks`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not refresh this Spotify playlist.");
    } finally {
      setRefreshingPlaylistId(null);
    }
  }, [customPlaylists, curatedPlaylists, notify, persistCustomPlaylists]);

  const handleDeletePlaylist = useCallback(
    (id: string) => {
      const target = customPlaylists.find((p) => p.id === id);
      if (!target) return;
      if (confirm(`Are you sure you want to delete playlist "${target.title}"?`)) {
        const next = customPlaylists.filter((p) => p.id !== id);
        persistCustomPlaylists(next);
        setSelectedPlaylistId("kpop-2026");
        notify(`Deleted playlist "${target.title}"`);
      }
    },
    [customPlaylists, persistCustomPlaylists, notify]
  );

  const handleAddTrackToPlaylist = useCallback(
    (playlistId: string, track: TimeTrack) => {
      const pl = customPlaylists.find((p) => p.id === playlistId);
      if (!pl) return;
      if (pl.tracks.some((t) => t.videoId === track.videoId)) {
        notify(`"${track.title}" is already in ${pl.title}`);
        setAddToPlaylistTrack(null);
        return;
      }
      const nextTracks = [...pl.tracks, track];
      const updated = customPlaylists.map((p) =>
        p.id === playlistId
          ? { ...p, tracks: nextTracks, cover: p.cover || track.cover }
          : p
      );
      persistCustomPlaylists(updated);
      notify(`Added "${track.title}" to ${pl.title}`);
      setAddToPlaylistTrack(null);
    },
    [customPlaylists, persistCustomPlaylists, notify]
  );

  const handleRemoveTrackFromPlaylist = useCallback(
    (playlistId: string, trackIndex: number) => {
      const pl = customPlaylists.find((p) => p.id === playlistId);
      if (!pl) return;
      const trackTitle = pl.tracks[trackIndex]?.title;
      const nextTracks = pl.tracks.filter((_, idx) => idx !== trackIndex);
      const updated = customPlaylists.map((p) =>
        p.id === playlistId ? { ...p, tracks: nextTracks } : p
      );
      persistCustomPlaylists(updated);
      if (trackTitle) notify(`Removed "${trackTitle}" from ${pl.title}`);
    },
    [customPlaylists, persistCustomPlaylists, notify]
  );

  const playPlaylist = useCallback(
    (pl: { title: string; tracks: TimeTrack[] }, shuffle = false) => {
      if (!pl.tracks.length) return;
      const list = shuffle
        ? [...pl.tracks].sort(() => Math.random() - 0.5)
        : pl.tracks;
      player.choose(list[0], list);
      notify(
        shuffle
          ? `Shuffling ${pl.title} (${pl.tracks.length} tracks)`
          : `Playing ${pl.title}`
      );
    },
    [player, notify]
  );

  const playLikedRadio = useCallback(() => {
    if (!library.favorites.length) {
      notify("Save a few songs first to start your liked radio.");
      return;
    }
    const favoriteIds = new Set(library.favorites.map((track) => track.videoId));
    const extra = library.favorites.flatMap((track) => getSimilarTracks(track, recommendationPool, 3))
      .filter((track, index, list) => !favoriteIds.has(track.videoId) && list.findIndex((item) => item.videoId === track.videoId) === index);
    const radio = [...library.favorites, ...extra].sort(() => Math.random() - 0.5);
    player.choose(radio[0], radio);
    notify(`Liked radio started · ${radio.length} tracks`);
  }, [library.favorites, notify, player, recommendationPool]);

  const shuffleAll = useCallback(() => {
    if (!allTracks.length) return;
    const shuffled = [...allTracks].sort(() => Math.random() - 0.5);
    player.choose(shuffled[0], shuffled);
    notify(`Shuffling across all playlists (${allTracks.length} tracks)`);
  }, [allTracks, player, notify]);

  const openPlaylist = useCallback((id: string) => {
    setSelectedPlaylistId(id);
    setView("playlists");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const navigate = useCallback(
    (next: View) => {
      if (next === view) return;
      setView(next);
      setViewHistory((prev) => [...prev.slice(0, historyIndex + 1), next]);
      setHistoryIndex((prev) => prev + 1);
      if (next !== "search") {
        setQuery("");
        setSearchError("");
        searchAbort.current?.abort();
        searchId.current++;
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [view, historyIndex]
  );

  const goBack = useCallback(() => {
    if (historyIndex > 0) {
      const nextIdx = historyIndex - 1;
      setHistoryIndex(nextIdx);
      setView(viewHistory[nextIdx]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [historyIndex, viewHistory]);

  const goForward = useCallback(() => {
    if (historyIndex < viewHistory.length - 1) {
      const nextIdx = historyIndex + 1;
      setHistoryIndex(nextIdx);
      setView(viewHistory[nextIdx]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [historyIndex, viewHistory]);

  const favorite = async (track: TimeTrack) => {
    const existing = library.favorites.find(
      (item) => item.videoId === track.videoId
    );
    const success = await library.favorite(existing ?? track, !existing);
    if (success) {
      notify(
        existing
          ? "Removed from your collection"
          : "Saved to your collection."
      );
    }
  };

  const isSaved = useCallback(
    (track: TimeTrack) =>
      library.favorites.some((item) => item.videoId === track.videoId),
    [library.favorites]
  );

  const miniPlayerActions = useRef({
    toggle: player.toggle,
    previous: player.previous,
    next: player.next,
    toggleMute: () => player.setMuted(!player.muted),
    seek: player.seek,
    toggleFavorite: () => favorite(player.track),
  });

  useEffect(() => {
    miniPlayerActions.current = {
      toggle: player.toggle,
      previous: player.previous,
      next: player.next,
      toggleMute: () => player.setMuted(!player.muted),
      seek: player.seek,
      toggleFavorite: () => favorite(player.track),
    };
  }, [player.toggle, player.previous, player.next, player.setMuted, player.muted, player.seek, player.track]);

  const playerChooseRef = useRef(player.choose);
  useEffect(() => {
    playerChooseRef.current = player.choose;
  }, [player.choose]);

  const runSearch = useCallback(
    async (text: string, autoplay = false) => {
      const value = text.trim();
      if (value.length < 2) return;
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchAbort.current?.abort();
      const controller = new AbortController();
      searchAbort.current = controller;
      const id = ++searchId.current;
      setSearching(true);
      setSearchError("");
      setView("search");
      try {
        const cacheKey = value.toLowerCase();
        let songs = lookupCache.current.get(cacheKey) || readSearchCache(cacheKey) || undefined;
        if (!songs) {
          if (isTauriEnvironment()) {
            try {
              const sidecarResults = await searchTracks(value);
              if (sidecarResults.length > 0) {
                songs = sidecarResults;
              }
            } catch {
              // fallback
            }
          }
          if (!songs || !songs.length) {
            const lower = value.toLowerCase();
            songs = allTracks.filter(
              (t) =>
                t.title.toLowerCase().includes(lower) ||
                t.artist.toLowerCase().includes(lower)
            );
          }
          lookupCache.current.set(cacheKey, songs);
          writeSearchCache(cacheKey, songs);
        }
        if (id !== searchId.current) return;
        setResults(songs);
        setSearchedFor(value);
        setSearching(false);
        if (autoplay && songs[0]) playerChooseRef.current(songs[0], songs);
      } catch (error) {
        if (controller.signal.aborted || id !== searchId.current) return;
        setSearching(false);
        setResults([]);
        setSearchError(
          error instanceof Error
            ? error.message
            : "Please try your search again."
        );
      }
    },
    [allTracks]
  );

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      searchAbort.current?.abort();
      searchId.current++;
      setSearching(false);
      setResults((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    searchTimer.current = setTimeout(() => void runSearch(value), 550);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query, runSearch]);

  const isSyncingRef = useRef(false);
  const syncDownloads = useCallback(
    async (silent = true) => {
      if (!isTauriEnvironment() || isSyncingRef.current) return;
      isSyncingRef.current = true;
      try {
        setSyncingDownloads(true);
        const diskTracks = await scanDownloadsFolder();
        const songs: DownloadedSong[] = diskTracks.map((t) => ({
          id: t.id,
          videoId: t.videoId,
          title: t.title,
          artist: t.artist,
          album: t.album || "Rewind Downloads",
          year: t.year ?? null,
          genre: t.genre || "Offline Audio",
          duration: t.duration || 180,
          cover: t.cover,
          downloadedAt: t.downloadedAt,
          filePath: t.filePath,
          fileName: t.fileName,
          fileSize: t.fileSize,
        }));
        setDownloadedSongs(songs);
        try {
          localStorage.setItem("rewind-downloaded-songs", JSON.stringify(songs));
        } catch {
          /* empty */
        }
        if (!silent) {
          notify(
            `Synchronized with downloads folder (${songs.length} song${
              songs.length === 1 ? "" : "s"
            }).`
          );
        }
      } catch (err) {
        console.error("Failed to sync downloads:", err);
        if (!silent) notify("Failed to sync downloads folder.");
      } finally {
        isSyncingRef.current = false;
        setSyncingDownloads(false);
      }
    },
    [notify]
  );

  const triggerDownload = (track: TimeTrack) => {
    if (!track.videoId) return;

    const newEntry: DownloadedSong = {
      id: track.id || track.videoId,
      videoId: track.videoId,
      title: track.title,
      artist: track.artist,
      album: track.album,
      year: track.year,
      genre: track.genre,
      downloadedAt: Date.now(),
      duration: track.duration,
      cover: track.cover,
    };

    setDownloadedSongs((prev) => {
      const filtered = prev.filter(
        (s) => s.videoId !== track.videoId && s.id !== track.id
      );
      const next = [newEntry, ...filtered];
      try {
        localStorage.setItem("rewind-downloaded-songs", JSON.stringify(next));
      } catch {
        /* empty */
      }
      return next;
    });

    const targetFolder = electronDownloadsPath || "Music\\Rewind Downloads";
    notify(`Downloading "${track.title}" to ${targetFolder}...`);

    if (isTauriEnvironment()) {
      downloadTrackOffline({
        videoId: track.videoId,
        title: track.title,
        artist: track.artist,
        album: track.album,
        year: track.year,
        genre: track.genre,
        duration: track.duration,
        cover: track.cover,
      }).then((res) => {
        if (res.success) {
          notify(`Downloaded "${track.title}" to ${targetFolder}`);
          void syncDownloads(true);
        } else {
          notify(`Download failed: ${res.error || "Unknown error"}`);
        }
      });
    }
  };

  const clearAllDownloads = useCallback(async () => {
    if (confirm("Delete all downloaded songs from this list and your computer?")) {
      for (const song of downloadedSongs) {
        if (song.filePath && isTauriEnvironment()) {
          await deleteDownloadedTrack(song.filePath);
        }
      }
      setDownloadedSongs([]);
      localStorage.removeItem("rewind-downloaded-songs");
      notify("All downloaded songs cleared.");
      void syncDownloads(true);
    }
  }, [downloadedSongs, notify, syncDownloads]);

  const deleteSingleDownload = useCallback(
    async (song: DownloadedSong) => {
      if (confirm(`Delete "${song.title}" from your computer?`)) {
        if (song.filePath && isTauriEnvironment()) {
          await deleteDownloadedTrack(song.filePath);
        }
        const next = downloadedSongs.filter((s) => s.id !== song.id);
        setDownloadedSongs(next);
        localStorage.setItem("rewind-downloaded-songs", JSON.stringify(next));
        notify(`Deleted "${song.title}".`);
        void syncDownloads(true);
      }
    },
    [downloadedSongs, notify, syncDownloads]
  );

  // Keep the always-on-top mini player synchronized with the real audio player.
  useEffect(() => {
    if (!isTauriEnvironment()) return;
    emitMiniSnapshot();
  }, [miniSnapshot, emitMiniSnapshot]);

  useEffect(() => {
    if (!isTauriEnvironment()) return;
    let disposeCommand: (() => void) | undefined;
    let disposeReady: (() => void) | undefined;

    const connectMiniPlayer = async () => {
      disposeCommand = await listen<MiniPlayerCommand>(
        MINI_PLAYER_COMMAND_EVENT,
        ({ payload }) => {
          const actions = miniPlayerActions.current;
          switch (payload.command) {
            case "toggle":
              void actions.toggle();
              break;
            case "previous":
              actions.previous();
              break;
            case "next":
              actions.next();
              break;
            case "toggleMute":
              actions.toggleMute();
              break;
            case "seek":
              void actions.seek(payload.position);
              break;
            case "toggleFavorite":
              void actions.toggleFavorite();
              break;
            case "restore":
              void hideMiniPlayerWindow().then(restoreAppWindow);
              break;
            case "hide":
              void hideMiniPlayerWindow();
              break;
          }
        }
      );
      disposeReady = await listen(MINI_PLAYER_READY_EVENT, emitMiniSnapshot);
    };

    void connectMiniPlayer();
    return () => {
      disposeCommand?.();
      disposeReady?.();
    };
  }, [emitMiniSnapshot]);

  // Tauri window listeners & context menu lock
  useEffect(() => {
    if (!isTauriEnvironment()) return;
    let unlisten: (() => void) | undefined;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const init = async () => {
      try {
        setIsMaximized(await isAppWindowMaximized());
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        unlisten = await win.onResized(() => {
          if (resizeTimer) clearTimeout(resizeTimer);
          resizeTimer = setTimeout(async () => {
            try {
              setIsMaximized(await win.isMaximized());
            } catch {
              /* ignore */
            }
          }, 150);
        });
      } catch (e) {
        console.warn("Failed to attach window resize listener:", e);
      }
    };
    void init();
    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return; // Allow native context menu in inputs for cut/copy/paste
      }
      e.preventDefault();
    };
    window.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("contextmenu", handleContextMenu);
    return () => {
      window.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, []);

  const handleCloseNewPlaylist = useCallback(() => {
    setNewPlaylistOpen(false);
  }, []);

  const handleCloseAddToPlaylist = useCallback(() => {
    setAddToPlaylistTrack(null);
  }, []);

  const handleCloseDetails = useCallback(() => {
    setDetails(null);
  }, []);

  const handleCloseInfo = useCallback(() => {
    setInfoOpen(false);
  }, []);

  const handleMinimize = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    // Show the companion first. Once the main window is minimized, its WebView
    // can be suspended before a second async window call gets a chance to run.
    await showMiniPlayerWindow();
    await minimizeAppWindow();
    window.setTimeout(emitMiniSnapshot, 120);
  }, [emitMiniSnapshot]);

  const handleToggleMaximize = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const nextMax = await toggleMaximizeAppWindow();
    setIsMaximized(nextMax);
  }, []);

  const handleClose = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    await closeAppWindow();
  }, []);

  const handleSelectTheme = useCallback((nextTheme: AppTheme) => {
    setTheme(nextTheme);
    try {
      localStorage.setItem("rewind-app-theme", nextTheme);
    } catch {
      /* empty */
    }
  }, []);

  // Initial load runs once on mount
  useEffect(() => {
    setToday(localDay(new Date()));
    try {
      const saved = localStorage.getItem("rewind-downloaded-songs");
      if (saved) setDownloadedSongs(JSON.parse(saved));
      const savedPlaylists = localStorage.getItem("rewind-user-playlists");
      if (savedPlaylists) setCustomPlaylists(JSON.parse(savedPlaylists));
      const savedTheme = localStorage.getItem("rewind-app-theme") as AppTheme | null;
      if (savedTheme) setTheme(savedTheme);
    } catch {
      /* empty */
    }

    if (isTauriEnvironment()) {
      setIsElectron(true);
      getDownloadsPath()
        .then((p) => {
          if (p) setElectronDownloadsPath(p);
        })
        .catch(() => {});
      void syncDownloads(true);
    }
  }, [syncDownloads]);

  const playerToggleRef = useRef(player.toggle);
  useEffect(() => {
    playerToggleRef.current = player.toggle;
  }, [player.toggle]);

  // Spacebar play/pause shortcut
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const input = event.target as HTMLElement;
      const editing =
        input.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(input.tagName);
      if (
        !editing &&
        event.code === "Space" &&
        !document.querySelector('[aria-modal="true"]')
      ) {
        event.preventDefault();
        void playerToggleRef.current();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => {
      window.removeEventListener("keydown", shortcut);
    };
  }, []);

  useEffect(() => {
    const onFocus = () => {
      if (isTauriEnvironment()) {
        void syncDownloads(true);
        void hideMiniPlayerWindow();
      }
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, [syncDownloads]);

  useEffect(() => {
    if (view === "downloads" && isTauriEnvironment()) {
      void syncDownloads(true);
    }
  }, [view, syncDownloads]);

  useEffect(
    () => () => {
      searchAbort.current?.abort();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  return (
    <div
      className={`rewind-app theme-${theme} ${
        theme === "midnight" || theme === "cyberpunk" ? "dark-theme" : "light-theme"
      }`}
    >
      {/* NUCLEAR-STYLE UNIFIED TOPBAR */}
      <Topbar
        view={view}
        query={query}
        setQuery={setQuery}
        activePlaylist={activePlaylist}
        historyIndex={historyIndex}
        viewHistoryLength={viewHistory.length}
        isMaximized={isMaximized}
        isElectron={isElectron}
        totalTracksCount={allTracks.length}
        searchInputRef={searchInput}
        onNavigate={navigate}
        onGoBack={goBack}
        onGoForward={goForward}
        onRunSearch={runSearch}
        onShuffleAll={shuffleAll}
        onMinimize={handleMinimize}
        onToggleMaximize={handleToggleMaximize}
        onClose={handleClose}
      />

      {/* SIDEBAR NAVIGATION */}
      <Sidebar
        view={view}
        selectedPlaylistId={selectedPlaylistId}
        customPlaylists={customPlaylists}
        curatedPlaylists={curatedPlaylists}
        favoritesCount={library.favorites.length}
        onNavigate={navigate}
        onOpenPlaylist={openPlaylist}
        onOpenNewPlaylistModal={() => setNewPlaylistOpen(true)}
        onOpenInfoModal={() => setInfoOpen(true)}
      />

      {/* MAIN WORKSPACE VIEW ROUTING */}
      <div className="rewind-workspace">
        <main className="rewind-main">
          {spotifySync.active && (
            <div className="playlist-sync-banner" role="status" aria-live="polite">
              <LoaderCircle size={16} className="spinner" />
              <div>
                <strong>Auto-syncing playlists</strong>
                <span>{spotifySync.current} · {spotifySync.completed}/{spotifySync.total} complete</span>
              </div>
              <div className="playlist-sync-progress" aria-hidden="true">
                <i style={{ width: `${spotifySync.total ? (spotifySync.completed / spotifySync.total) * 100 : 0}%` }} />
              </div>
            </div>
          )}
          {view === "explore" && (
            <ExploreView
              allTracksCount={allTracks.length}
              allTracks={allTracks}
              curatedPlaylists={curatedPlaylists}
              history={library.history}
              currentTrack={player.status !== "idle" ? player.track : undefined}
              personalizedTracks={personalizedTracks}
              currentTrackVideoId={player.track?.videoId}
              isPlaying={playing}
              isSaved={isSaved}
              onNavigate={navigate}
              onShuffleAll={shuffleAll}
              onOpenPlaylist={openPlaylist}
              onPlayPlaylist={playPlaylist}
              onChooseTrack={player.choose}
              onPlayNext={(track) => {
                player.playNext(track);
                notify(`Playing "${track.title}" next`);
              }}
              onAddToQueue={(track) => {
                player.addToQueue(track);
                notify(`Added "${track.title}" to queue`);
              }}
              onOpenAddToPlaylist={setAddToPlaylistTrack}
              onToggleFavorite={favorite}
              onDownload={triggerDownload}
            />
          )}

          {view === "playlists" && (
            <PlaylistView
              activePlaylist={activePlaylist}
              selectedPlaylistId={selectedPlaylistId}
              customPlaylists={customPlaylists}
              curatedPlaylists={curatedPlaylists}
              currentTrackVideoId={player.track?.videoId}
              isPlaying={playing}
              isSaved={isSaved}
              onSelectPlaylist={setSelectedPlaylistId}
              onOpenNewPlaylistModal={() => setNewPlaylistOpen(true)}
              onPlayPlaylist={playPlaylist}
              onDeletePlaylist={handleDeletePlaylist}
              onNavigate={navigate}
              onChooseTrack={player.choose}
              onPlayNext={(track) => {
                player.playNext(track);
                notify(`Playing "${track.title}" next`);
              }}
              onAddToQueue={(track) => {
                player.addToQueue(track);
                notify(`Added "${track.title}" to queue`);
              }}
              onOpenAddToPlaylist={setAddToPlaylistTrack}
              onToggleFavorite={favorite}
              onDownload={triggerDownload}
              onRemoveTrackFromPlaylist={handleRemoveTrackFromPlaylist}
              onExportPlaylists={handleExportPlaylists}
              onImportPlaylists={(file) => void handleImportPlaylists(file)}
              onRefreshPlaylist={(id) => void handleRefreshPlaylist(id)}
              refreshingPlaylistId={refreshingPlaylistId}
            />
          )}

          {view === "search" && (
            <SearchView
              query={query}
              searchedFor={searchedFor}
              searching={searching}
              searchError={searchError}
              results={results}
              currentTrackVideoId={player.track?.videoId}
              isPlaying={playing}
              isSaved={isSaved}
              onSetQuery={setQuery}
              onRunSearch={runSearch}
              onChooseTrack={player.choose}
              onPlayNext={(track) => {
                player.playNext(track);
                notify(`Playing "${track.title}" next`);
              }}
              onAddToQueue={(track) => {
                player.addToQueue(track);
                notify(`Added "${track.title}" to queue`);
              }}
              onOpenAddToPlaylist={setAddToPlaylistTrack}
              onToggleFavorite={favorite}
              onDownload={triggerDownload}
            />
          )}

          {view === "collection" && (
            <LibraryView
              mode="collection"
              favorites={library.favorites}
              history={library.history}
              memoryDate={memoryDate}
              today={today}
              currentTrackVideoId={player.track?.videoId}
              isPlaying={playing}
              isSaved={isSaved}
              onSetMemoryDate={setMemoryDate}
              onNavigate={navigate}
              onChooseTrack={player.choose}
              onPlayNext={(track) => {
                player.playNext(track);
                notify(`Playing "${track.title}" next`);
              }}
              onAddToQueue={(track) => {
                player.addToQueue(track);
                notify(`Added "${track.title}" to queue`);
              }}
              onOpenAddToPlaylist={setAddToPlaylistTrack}
              onToggleFavorite={favorite}
              onDownload={triggerDownload}
              onPlayLikedRadio={playLikedRadio}
            />
          )}

          {view === "memories" && (
            <LibraryView
              mode="memories"
              favorites={library.favorites}
              history={library.history}
              memoryDate={memoryDate}
              today={today}
              currentTrackVideoId={player.track?.videoId}
              isPlaying={playing}
              isSaved={isSaved}
              onSetMemoryDate={setMemoryDate}
              onNavigate={navigate}
              onChooseTrack={player.choose}
              onPlayNext={(track) => {
                player.playNext(track);
                notify(`Playing "${track.title}" next`);
              }}
              onAddToQueue={(track) => {
                player.addToQueue(track);
                notify(`Added "${track.title}" to queue`);
              }}
              onOpenAddToPlaylist={setAddToPlaylistTrack}
              onToggleFavorite={favorite}
              onDownload={triggerDownload}
              onPlayLikedRadio={playLikedRadio}
            />
          )}

          {view === "downloads" && (
            <DownloadsView
              downloadedSongs={downloadedSongs}
              syncingDownloads={syncingDownloads}
              electronDownloadsPath={electronDownloadsPath}
              isElectron={isElectron}
              offlineMode={offlineMode}
              onToggleOfflineMode={() => {
                setOfflineMode((current) => {
                  const next = !current;
                  localStorage.setItem("rewind-offline-mode", String(next));
                  notify(next ? "Offline mode enabled" : "Online playback enabled");
                  return next;
                });
              }}
              currentTrackId={player.track?.id}
              currentTrackVideoId={player.track?.videoId}
              isPlaying={playing}
              onNavigate={navigate}
              onSyncDownloads={syncDownloads}
              onTriggerDownload={triggerDownload}
              onChooseTrack={player.choose}
              onTogglePlay={() => void player.toggle()}
              onClearAllDownloads={clearAllDownloads}
              onDeleteSingleDownload={deleteSingleDownload}
              onNotify={notify}
            />
          )}

          {view === "stats" && (
            <StatsView
              stats={listeningStats.stats}
              tracks={[...allTracks, ...customPlaylists.flatMap((playlist) => playlist.tracks)]}
            />
          )}

          {view === "settings" && (
            <SettingsView
              currentTheme={theme}
              onSelectTheme={handleSelectTheme}
              onNavigate={navigate}
              crossfadeSeconds={player.crossfadeSeconds}
              onSetCrossfadeSeconds={player.setCrossfadeSeconds}
            />
          )}

          {library.error && (
            <div className="sync-warning" role="status">
              {library.error}
              <button onClick={() => void library.reload()}>Retry sync</button>
            </div>
          )}

          <footer className="rewind-footer">
            <span>
              <Rewind size={13} />
              REWIND MUSIC PLAYER
            </span>
            <span>POWERED BY YOUTUBE EMBEDS · FULL RECORDINGS</span>
          </footer>
        </main>
      </div>

      {/* MOBILE NAVIGATION */}
      <MobileNav
        view={view}
        onNavigate={navigate}
        onFocusSearch={() => {
          setView("search");
          searchInput.current?.focus();
        }}
      />

      {/* PERSISTENT AUDIO PLAYER */}
      <PersistentPlayer
        track={player.track}
        playing={playing}
        status={player.status}
        position={player.position}
        duration={player.duration}
        volume={player.volume}
        muted={player.muted}
        shuffle={player.shuffle}
        repeat={player.repeat}
        isSaved={isSaved(player.track)}
        queueOpen={queueOpen}
        onTogglePlay={() => void player.toggle()}
        onPrevious={player.previous}
        onNext={player.next}
        onSeek={(pos) => void player.seek(pos)}
        onSetVolume={player.setVolume}
        onSetMuted={player.setMuted}
        onSetShuffle={player.setShuffle}
        onSetRepeat={player.setRepeat}
        onToggleFavorite={favorite}
        onDownload={triggerDownload}
         onOpenDetails={setDetails}
         onToggleQueue={() => setQueueOpen(!queueOpen)}
         similarTrackCount={similarTracks.length}
         onPlaySimilar={playSimilarTracks}
         sleepTimerActive={sleepTimer.isActive}
         sleepTimerRemainingSeconds={sleepTimer.remainingSeconds}
         sleepTimerDurations={sleepTimer.durations}
         onStartSleepTimer={(minutes) => {
           sleepTimer.start(minutes as (typeof sleepTimer.durations)[number]);
           notify(`Sleep timer set for ${minutes} minutes.`);
         }}
         onCancelSleepTimer={() => {
           sleepTimer.cancel();
           notify("Sleep timer cancelled.");
         }}
       />

      {/* PURE HTML5 AUDIO ELEMENT */}
      <audio {...player.audioProps} preload="auto" style={{ display: "none" }} />
      <audio {...player.transitionAudioProps} preload="auto" style={{ display: "none" }} />

      {player.error && (
        <div className="playback-toast-error" role="status">
          <p>{player.error}</p>
          <button onClick={player.retry}>Retry</button>
        </div>
      )}

      {/* QUEUE DRAWER */}
      {queueOpen && (
        <QueueDrawer
          currentTrack={player.track}
          queue={player.queue}
          onClose={() => setQueueOpen(false)}
          onClearQueue={() => {
            player.clearQueue();
            notify("Queue cleared");
          }}
          onChooseTrack={player.choose}
          onRemoveFromQueue={(index) => {
            const track = player.queue[index];
            player.removeFromQueue(index);
            if (track) notify(`Removed "${track.title}" from queue`);
          }}
          onReorderQueue={(fromIndex, toIndex) => {
            player.reorderQueue(fromIndex, toIndex);
            notify("Queue order updated");
          }}
        />
      )}


      {/* CREATE / IMPORT PLAYLIST DIALOG */}
      <AddPlaylistDialog
        isOpen={newPlaylistOpen}
        onClose={handleCloseNewPlaylist}
        onCreatePlaylist={handleCreatePlaylist}
      />

      {/* ADD TO PLAYLIST DIALOG */}
      <AddToPlaylistDialog
        track={addToPlaylistTrack}
        customPlaylists={customPlaylists}
        onClose={handleCloseAddToPlaylist}
        onAddTrackToPlaylist={handleAddTrackToPlaylist}
        onCreatePlaylistWithTrack={(name, track) =>
          handleCreatePlaylist(name, undefined, track)
        }
      />

      {/* TRACK / ALBUM DETAILS DIALOG */}
      <TrackDetailsDialog
        track={details}
        currentPosition={player.position}
        isSaved={details ? isSaved(details) : false}
        onClose={handleCloseDetails}
        onPlay={(track) => player.choose(track, [track])}
        onToggleFavorite={favorite}
        onDownload={triggerDownload}
      />

      {/* ABOUT DIALOG */}
      <AboutDialog
        isOpen={infoOpen}
        onClose={handleCloseInfo}
      />

      {/* TOAST NOTIFICATION */}
      {toast && (
        <div className="rewind-toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
