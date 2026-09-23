"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, Rewind } from "lucide-react";

import {
  playlists,
  getPlaylist,
  getAllPlaylistTracks,
} from "@/lib/time/playlists";
import { type TimeTrack } from "@/lib/time/types";
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
} from "@/lib/tauri-audio";

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

// Core hooks & plugins
import { useListeningLibrary } from "./use-listening-library";
import { useTimePlayer } from "./use-time-player";

export type { UserPlaylist, DownloadedSong };

function localDay(value: string | Date | number) {
  const date = typeof value === "string" || typeof value === "number" ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
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
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>("kpop-2026");

  // Custom User Playlists
  const [customPlaylists, setCustomPlaylists] = useState<UserPlaylist[]>([]);
  const [newPlaylistOpen, setNewPlaylistOpen] = useState(false);
  const [addToPlaylistTrack, setAddToPlaylistTrack] = useState<TimeTrack | null>(null);

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

  const library = useListeningLibrary();
  const allTracks = useMemo(() => getAllPlaylistTracks(), []);
  const initialTrack = playlists[0]?.tracks[0] || allTracks[0];
  const player = useTimePlayer(initialTrack, library.listen);
  const playing = player.status === "playing";

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
        url: "",
        totalDuration: custom.tracks.reduce(
          (sum, t) => sum + (t.duration || 180),
          0
        ),
        trackCount: custom.tracks.length,
        tracks: custom.tracks,
        isCustom: true,
      };
    }
    const curated = getPlaylist(selectedPlaylistId) ?? playlists[0];
    return { ...curated, isCustom: false };
  }, [selectedPlaylistId, customPlaylists]);

  const notify = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(""), 2800);
  }, []);

  const persistCustomPlaylists = useCallback((next: UserPlaylist[]) => {
    setCustomPlaylists(next);
    try {
      localStorage.setItem("rewind-user-playlists", JSON.stringify(next));
    } catch {
      /* empty */
    }
  }, []);

  const handleCreatePlaylist = useCallback(
    (
      title: string,
      description?: string,
      singleTrack?: TimeTrack,
      initialTracks?: TimeTrack[],
      cover?: string,
      youtubeId?: string
    ) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      const colors = [
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
          (youtubeId ? "Imported from YouTube" : "User created playlist"),
        createdAt: Date.now(),
        tracks,
        accent: colors[customPlaylists.length % colors.length],
        cover:
          cover ||
          tracks[0]?.cover ||
          "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&q=80",
        youtubeId,
      };
      const updated = [newPl, ...customPlaylists];
      persistCustomPlaylists(updated);
      notify(`Added playlist "${trimmed}" (${tracks.length} tracks)`);
      setSelectedPlaylistId(newPl.id);
      setView("playlists");
    },
    [customPlaylists, persistCustomPlaylists, notify]
  );

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
        let songs = lookupCache.current.get(value.toLowerCase());
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
          lookupCache.current.set(value.toLowerCase(), songs);
        }
        if (id !== searchId.current) return;
        setResults(songs);
        setSearchedFor(value);
        setSearching(false);
        if (autoplay && songs[0]) player.choose(songs[0], songs);
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
    [allTracks, player]
  );

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      searchAbort.current?.abort();
      searchId.current++;
      setSearching(false);
      setResults([]);
      return;
    }
    searchTimer.current = setTimeout(() => void runSearch(value), 550);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query, runSearch]);

  const syncDownloads = useCallback(
    async (silent = true) => {
      if (!isTauriEnvironment()) return;
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

  // Tauri window listeners & context menu lock
  useEffect(() => {
    if (!isTauriEnvironment()) return;
    let unlisten: (() => void) | undefined;
    const init = async () => {
      try {
        setIsMaximized(await isAppWindowMaximized());
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        unlisten = await win.onResized(async () => {
          setIsMaximized(await isAppWindowMaximized());
        });
      } catch (e) {
        console.warn("Failed to attach window resize listener:", e);
      }
    };
    void init();
    return () => {
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
    await minimizeAppWindow();
  }, []);

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

  // Initial load, keyboard shortcuts & lifecycle
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
        void player.toggle();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => {
      window.removeEventListener("keydown", shortcut);
    };
  }, [player, syncDownloads]);

  useEffect(() => {
    const onFocus = () => {
      if (isTauriEnvironment()) void syncDownloads(true);
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
        favoritesCount={library.favorites.length}
        onNavigate={navigate}
        onOpenPlaylist={openPlaylist}
        onOpenNewPlaylistModal={() => setNewPlaylistOpen(true)}
        onOpenInfoModal={() => setInfoOpen(true)}
      />

      {/* MAIN WORKSPACE VIEW ROUTING */}
      <div className="rewind-workspace">
        <main className="rewind-main">
          {view === "explore" && (
            <ExploreView
              allTracksCount={allTracks.length}
              history={library.history}
              currentTrackVideoId={player.track?.videoId}
              isPlaying={playing}
              isSaved={isSaved}
              onNavigate={navigate}
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
            />
          )}

          {view === "downloads" && (
            <DownloadsView
              downloadedSongs={downloadedSongs}
              syncingDownloads={syncingDownloads}
              electronDownloadsPath={electronDownloadsPath}
              isElectron={isElectron}
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

          {view === "settings" && (
            <SettingsView
              currentTheme={theme}
              onSelectTheme={handleSelectTheme}
              onNavigate={navigate}
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
      />

      {/* PURE HTML5 AUDIO ELEMENT */}
      <audio {...player.audioProps} preload="auto" style={{ display: "none" }} />

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
