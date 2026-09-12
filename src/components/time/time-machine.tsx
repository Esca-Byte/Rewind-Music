"use client";

import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, AudioLines, CalendarDays,
  Check, ChevronRight, Compass, Disc3, Download, FolderOpen, Headphones, Heart, History,
  ListMusic, LoaderCircle, Pause, Play, Repeat2, Rewind,
  Search, Shuffle, SkipBack, SkipForward, Sparkles, Trash2, Volume2, VolumeX, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { playlists, getPlaylist, getAllPlaylistTracks, type Playlist } from "@/lib/time/playlists";
import { clock, type TimeTrack } from "@/lib/time/types";
import { AlbumObject, Artwork } from "./album-object";
import { useListeningLibrary } from "./use-listening-library";
import { useTimePlayer } from "./use-time-player";

export interface DownloadedSong {
  id: string;
  videoId: string;
  title: string;
  artist: string;
  album?: string;
  year?: number | null;
  genre?: string;
  downloadedAt: number;
  duration?: number;
  cover?: string;
}

type View = "explore" | "playlists" | "collection" | "memories" | "downloads" | "search";

const nav = [
  { id: "explore", label: "Home", icon: Compass },
  { id: "playlists", label: "Playlists", icon: ListMusic },
  { id: "collection", label: "My collection", icon: Heart },
  { id: "memories", label: "History", icon: History },
  { id: "downloads", label: "Downloads", icon: ArrowDownToLine },
] as const;

function localDay(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.current?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key === "Tab") {
        const nodes = element.current?.querySelectorAll<HTMLElement>('button, a[href], input, [tabindex="0"]');
        if (!nodes?.length) return;
        const first = nodes[0]; const last = nodes[nodes.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === element.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", handle);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener("keydown", handle); previous?.focus(); };
  }, [onClose]);
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={element} className="rewind-dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <button className="dialog-close icon-button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button>
        {children}
      </div>
    </div>
  );
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
  const [electronDownloadsPath, setElectronDownloadsPath] = useState<string>("");
  const [isElectron, setIsElectron] = useState<boolean>(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>("kpop-2026");

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
  const activePlaylist = useMemo(() => getPlaylist(selectedPlaylistId) ?? playlists[0], [selectedPlaylistId]);

  const notify = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(""), 2800);
  }, []);

  const playPlaylist = useCallback((pl: Playlist, shuffle = false) => {
    if (!pl.tracks.length) return;
    const list = shuffle ? [...pl.tracks].sort(() => Math.random() - 0.5) : pl.tracks;
    player.choose(list[0], list);
    notify(shuffle ? `Shuffling ${pl.title} (${pl.tracks.length} tracks)` : `Playing ${pl.title}`);
  }, [player.choose, notify]);

  const shuffleAll = useCallback(() => {
    if (!allTracks.length) return;
    const shuffled = [...allTracks].sort(() => Math.random() - 0.5);
    player.choose(shuffled[0], shuffled);
    notify(`Shuffling across all playlists (${allTracks.length} tracks)`);
  }, [allTracks, player.choose, notify]);

  const openPlaylist = useCallback((id: string) => {
    setSelectedPlaylistId(id);
    setView("playlists");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const navigate = useCallback((next: View) => {
    setView(next);
    setQuery("");
    setSearchError("");
    searchAbort.current?.abort();
    searchId.current++;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const closeDetails = useCallback(() => setDetails(null), []);
  const closeInfo = useCallback(() => setInfoOpen(false), []);

  const favorite = async (track: TimeTrack) => {
    const existing = library.favorites.find((item) => item.videoId === track.videoId);
    const success = await library.favorite(existing ?? track, !existing);
    if (success) notify(existing ? "Removed from your collection" : "Saved to your collection.");
  };

  const isSaved = (track: TimeTrack) => library.favorites.some((item) => item.videoId === track.videoId);

  const runSearch = useCallback(async (text: string, autoplay = false) => {
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
        const response = await fetch(`/api/search?q=${encodeURIComponent(value)}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Search is unavailable. Please try again.");
        songs = data.results as TimeTrack[];
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
      setSearchError(error instanceof Error ? error.message : "Please try your search again.");
    }
  }, [player.choose]);

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
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query, runSearch]);

  useEffect(() => {
    setToday(localDay(new Date()));
    try {
      const saved = localStorage.getItem("rewind-downloaded-songs");
      if (saved) {
        setDownloadedSongs(JSON.parse(saved));
      }
    } catch { /* empty */ }

    if (typeof window !== "undefined" && window.electronAPI) {
      setIsElectron(true);
      window.electronAPI.getDownloadsPath().then((p) => {
        if (p) setElectronDownloadsPath(p);
      }).catch(() => {});
    }

    const shortcut = (event: KeyboardEvent) => {
      const input = event.target as HTMLElement;
      const editing = input.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(input.tagName);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInput.current?.focus();
      } else if (!editing && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInput.current?.focus();
      } else if (!editing && event.code === "Space" && !document.querySelector('[aria-modal="true"]')) {
        event.preventDefault();
        void player.toggle();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => { window.removeEventListener("keydown", shortcut); };
  }, [player.toggle]);

  useEffect(() => () => {
    searchAbort.current?.abort();
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);



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
      const filtered = prev.filter((s) => s.videoId !== track.videoId && s.id !== track.id);
      const next = [newEntry, ...filtered];
      try {
        localStorage.setItem("rewind-downloaded-songs", JSON.stringify(next));
      } catch { /* empty */ }
      return next;
    });

    notify(`Downloading "${track.title}" to ${isElectron ? "Music\\Rewind Downloads" : "your device"}...`);

    const filename = `${track.artist ? `${track.artist} - ` : ""}${track.title}.m4a`;
    const downloadUrl = `/api/download?videoId=${track.videoId}&title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}`;
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredHistory = library.history.filter((item) => !memoryDate || localDay(item.playedAt) === memoryDate);
  const memoryGroups = filteredHistory.reduce<Record<string, typeof filteredHistory>>((groups, item) => {
    const day = localDay(item.playedAt);
    (groups[day] ??= []).push(item);
    return groups;
  }, {});

  const trackRow = (track: TimeTrack, index: number, list: TimeTrack[], suffix?: string) => {
    const active = player.track.videoId === track.videoId;
    return (
      <div className={`recording-row ${active ? "current" : ""}`} key={`${track.id}-${suffix ?? index}`}>
        <button className="row-number" onClick={() => player.choose(track, list)} aria-label={`${active && playing ? "Pause" : "Play"} ${track.title}`}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          {active && playing ? <AudioLines size={17} /> : <Play size={15} fill="currentColor" />}
        </button>
        <button className="recording-identity" onClick={() => player.choose(track, list)}>
          <Artwork track={track} />
          <span><strong>{track.title}</strong><small>{track.artist}</small></span>
        </button>
        <span className="row-album">{track.album}</span>
        <span className="row-year">{track.year ?? "—"}</span>
        <span className="row-length">{clock(track.duration)}</span>
        <div className="row-actions">
          <button
            className={`icon-button save-button ${isSaved(track) ? "saved" : ""}`}
            onClick={() => void favorite(track)}
            aria-label={`${isSaved(track) ? "Remove" : "Save"} ${track.title}`}
            aria-pressed={isSaved(track)}
            title={isSaved(track) ? "Remove from collection" : "Save to collection"}
          >
            <Heart size={16} fill={isSaved(track) ? "currentColor" : "none"} />
          </button>
          {track.videoId && (
            <button
              type="button"
              className="icon-button download-track-btn"
              onClick={(e) => {
                e.stopPropagation();
                triggerDownload(track);
              }}
              aria-label={`Download ${track.title}`}
              title={`Download audio for ${track.title}`}
            >
              <ArrowDownToLine size={16} />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="rewind-app modern-player-theme">
      <aside className="rewind-sidebar">
        <button className="rewind-brand" onClick={() => navigate("explore")} aria-label="Rewind home">
          <span><Rewind size={27} fill="currentColor" strokeWidth={1.4} /></span>
          <strong>rewind<span>.</span></strong>
        </button>
        <p className="brand-caption">GOOD MUSIC. ANY TIME.</p>

        <div className="sidebar-section">
          <span className="sidebar-label">MENU</span>
          <nav aria-label="Main navigation">
            {nav.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={`sidebar-link ${view === id ? "active" : ""}`}
                onClick={() => navigate(id)}
              >
                <Icon size={18} strokeWidth={1.65} />
                <span>{label}</span>
                {id === "collection" && library.favorites.length > 0 && <b>{library.favorites.length}</b>}
                {id === "playlists" && <b>{playlists.length}</b>}
              </button>
            ))}
          </nav>
        </div>

        <div className="sidebar-section playlist-shortcuts-section">
          <span className="sidebar-label">YOUR PLAYLISTS</span>
          <div className="sidebar-playlist-links">
            {playlists.map((pl) => (
              <button
                key={pl.id}
                className={`sidebar-playlist-item ${view === "playlists" && selectedPlaylistId === pl.id ? "active" : ""}`}
                onClick={() => openPlaylist(pl.id)}
              >
                <span className="sidebar-pl-dot" style={{ background: pl.accent }} />
                <span className="sidebar-pl-name">{pl.title}</span>
                <small>{pl.trackCount}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-bottom">
          <div className="sidebar-record"><span /><i /></div>
          <p>Full recordings.<br /><em>Never previews.</em></p>
          <span className="sidebar-footnote">OFFICIAL YOUTUBE STREAMS</span>
          <button className="listening-profile" onClick={() => setInfoOpen(true)}>
            <span className="profile-avatar">R</span>
            <span><strong>Listening Room</strong><small>About this player</small></span>
            <ChevronRight size={14} />
          </button>
        </div>
      </aside>

      <div className="rewind-workspace">
        <header className="rewind-topbar">
          <div className="page-breadcrumb">
            <span>{view === "explore" ? "Explore" : view === "search" ? "Search" : view === "playlists" ? "Playlists" : nav.find((n) => n.id === view)?.label}</span>
            <ChevronRight size={13} />
            <strong>{view === "explore" ? "Trending Music" : view === "playlists" ? activePlaylist.title : "Your Music"}</strong>
          </div>

          <form
            className="global-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              void runSearch(query, true);
            }}
          >
            <Search size={17} />
            <input
              ref={searchInput}
              value={query}
              maxLength={120}
              placeholder="Search any artist, song, or video on YouTube…"
              aria-label="Search songs and artists"
              onChange={(event) => {
                setQuery(event.target.value);
                if (event.target.value.trim().length >= 2) setView("search");
              }}
            />
            <kbd>⌘ K</kbd>
            {query && (
              <button className="clear-search" type="button" onClick={() => { setQuery(""); navigate("explore"); }} aria-label="Clear search">
                <X size={14} />
              </button>
            )}
          </form>

          <button className="today-button" onClick={shuffleAll}>
            <Shuffle size={14} />
            Shuffle All ({allTracks.length})
          </button>
        </header>

        <main className="rewind-main">
          {/* EXPLORE (HOME) VIEW */}
          {view === "explore" && (
            <>
              <div className="page-intro">
                <div>
                  <p className="overline">STREAM FULL RECORDINGS</p>
                  <h1>Good music. <em>In full.</em></h1>
                  <p className="intro-description">Curated YouTube mixes ready to stream with high fidelity audio.</p>
                </div>
                <span className="full-length-badge"><span />{allTracks.length} SONGS AVAILABLE</span>
              </div>

              {/* FEATURED PLAYLIST HERO BANNER */}
              <section className="explore-featured-hero">
                <div className="featured-hero-media">
                  <img src={playlists[0].cover} alt={playlists[0].title} />
                  <span className="featured-pill">FEATURED PLAYLIST</span>
                </div>
                <div className="featured-hero-info">
                  <span className="playlist-caption-pill"><Sparkles size={13} /> TOP PICK</span>
                  <h2>{playlists[0].title}</h2>
                  <p>{playlists[0].tagline}</p>
                  <div className="featured-hero-meta">
                    <span>{playlists[0].trackCount} full tracks</span>
                    <span>•</span>
                    <span>{Math.round(playlists[0].totalDuration / 60)} minutes of music</span>
                  </div>
                  <div className="featured-hero-actions">
                    <button className="primary-button" onClick={() => playPlaylist(playlists[0], false)}>
                      <Play size={16} fill="currentColor" /> Play Now
                    </button>
                    <button className="quiet-button" onClick={() => playPlaylist(playlists[0], true)}>
                      <Shuffle size={16} /> Shuffle
                    </button>
                    <button className="text-link" onClick={() => openPlaylist(playlists[0].id)}>
                      View Playlist <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              </section>

              {/* CURATED PLAYLISTS 3-CARD GRID */}
              <section className="discover-playlists-shelf">
                <div className="section-header">
                  <div>
                    <h2>Curated Playlists <span className="small-count">{playlists.length}</span></h2>
                    <p>Select a playlist to browse the full tracklist and start playing.</p>
                  </div>
                  <button className="text-link" onClick={() => navigate("playlists")}>
                    All Playlists <ArrowRight size={15} />
                  </button>
                </div>
                <div className="discover-playlists-grid">
                  {playlists.map((pl) => (
                    <div
                      key={pl.id}
                      className="discover-playlist-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => openPlaylist(pl.id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openPlaylist(pl.id); }}
                    >
                      <div className="discover-playlist-cover">
                        <img src={pl.cover} alt={pl.title} loading="lazy" />
                        <button
                          className="discover-play-btn"
                          onClick={(e) => { e.stopPropagation(); playPlaylist(pl, false); }}
                          aria-label={`Play ${pl.title}`}
                        >
                          <Play size={18} fill="currentColor" />
                        </button>
                      </div>
                      <div className="discover-playlist-info">
                        <span className="discover-playlist-badge">{pl.trackCount} songs</span>
                        <h3>{pl.title}</h3>
                        <p>{pl.tagline}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* HIGHLIGHT FROM EACH PLAYLIST */}
              {playlists.map((pl) => (
                <section className="explore-playlist-preview" key={pl.id}>
                  <div className="section-header">
                    <div>
                      <h2>{pl.title} <span className="small-count">{pl.trackCount} tracks</span></h2>
                      <p>{pl.tagline}</p>
                    </div>
                    <button className="text-link" onClick={() => openPlaylist(pl.id)}>
                      See all {pl.trackCount} tracks <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="recording-list">
                    {pl.tracks.slice(0, 5).map((track, index) => trackRow(track, index, pl.tracks, pl.id))}
                  </div>
                </section>
              ))}

              <section className="memory-preview">
                <div className="section-header">
                  <div>
                    <h2>Your Listening History</h2>
                    <p>Songs you’ve played recently in this browser.</p>
                  </div>
                  <button className="text-link" onClick={() => navigate("memories")}>
                    View full history <ArrowRight size={15} />
                  </button>
                </div>
                {library.history.length ? (
                  <div className="recording-list">
                    {library.history.slice(0, 4).map((memory, i) => trackRow(memory.track, i, library.history.map((m) => m.track), memory.id))}
                  </div>
                ) : (
                  <div className="memory-invitation">
                    <span className="memory-date-icon"><CalendarDays size={24} /></span>
                    <div>
                      <strong>Your listening history starts here.</strong>
                      <p>Press play on any song and we’ll keep track of your memories.</p>
                    </div>
                  </div>
                )}
              </section>
            </>
          )}

          {/* PLAYLISTS VIEW */}
          {view === "playlists" && (
            <>
              <div className="page-intro">
                <div>
                  <p className="overline">YOUTUBE SOUNDTRACKS</p>
                  <h1>Curated Playlists<em>.</em></h1>
                  <p className="intro-description">Stream complete songs directly from your favorite YouTube playlists.</p>
                </div>
                <span className="full-length-badge"><span />{playlists.reduce((sum, p) => sum + p.trackCount, 0)} SONGS READY</span>
              </div>

              <div className="playlist-tabs-row" role="tablist" aria-label="Curated playlists">
                {playlists.map((pl) => (
                  <button
                    key={pl.id}
                    role="tab"
                    aria-selected={activePlaylist.id === pl.id}
                    className={`playlist-nav-card ${activePlaylist.id === pl.id ? "active" : ""}`}
                    onClick={() => setSelectedPlaylistId(pl.id)}
                  >
                    <div className="playlist-nav-thumb">
                      <img src={pl.cover} alt={pl.title} />
                    </div>
                    <div className="playlist-nav-meta">
                      <strong>{pl.title}</strong>
                      <span>{pl.trackCount} songs · {Math.round(pl.totalDuration / 60)} min</span>
                    </div>
                  </button>
                ))}
              </div>

              <section className="playlist-hero-banner" style={{ "--playlist-accent": activePlaylist.accent } as CSSProperties}>
                <div className="playlist-hero-artwork">
                  <img src={activePlaylist.cover} alt={activePlaylist.title} />
                  <span className="playlist-pill-tag">YOUTUBE PLAYLIST</span>
                </div>
                <div className="playlist-hero-body">
                  <span className="playlist-caption-pill"><Sparkles size={13} /> {activePlaylist.title}</span>
                  <h2>{activePlaylist.title}</h2>
                  <p>{activePlaylist.tagline}</p>
                  <div className="playlist-specs">
                    <span><strong>{activePlaylist.trackCount}</strong> recordings</span>
                    <i />
                    <span><strong>{Math.round(activePlaylist.totalDuration / 60)}</strong> minutes</span>
                    <i />
                    <a href={activePlaylist.url} target="_blank" rel="noreferrer" className="playlist-ext-link">
                      Open on YouTube <ArrowUpRight size={13} />
                    </a>
                  </div>
                  <div className="playlist-cta-row">
                    <button className="primary-button" onClick={() => playPlaylist(activePlaylist, false)}>
                      <Play size={16} fill="currentColor" /> Play all ({activePlaylist.trackCount})
                    </button>
                    <button className="quiet-button" onClick={() => playPlaylist(activePlaylist, true)}>
                      <Shuffle size={16} /> Shuffle
                    </button>
                  </div>
                </div>
              </section>

              <section className="playlist-tracks-section">
                <div className="section-header">
                  <div>
                    <h2>Tracklist <span className="small-count">{activePlaylist.tracks.length}</span></h2>
                    <p>Click any song to play immediately.</p>
                  </div>
                </div>
                <div className="recording-list playlist-recording-list">
                  {activePlaylist.tracks.map((track, index) => trackRow(track, index, activePlaylist.tracks, activePlaylist.id))}
                </div>
              </section>
            </>
          )}

          {/* SEARCH VIEW */}
          {view === "search" && (
            <>
              <div className="page-intro">
                <div>
                  <p className="overline">YOUTUBE MUSIC SEARCH</p>
                  <h1>{searching ? "Finding your song…" : "Search results."}</h1>
                  <p className="intro-description">Search any artist or song. Press Enter to play immediately.</p>
                </div>
                <span className="full-length-badge"><span />FULL RECORDINGS</span>
              </div>
              {searchError && <div className="rewind-alert" role="alert">{searchError}<button onClick={() => void runSearch(query)}>Try again</button></div>}
              {searching ? (
                <div className="search-skeletons" aria-label="Searching full recordings">{Array.from({ length: 5 }, (_, i) => <div key={i}><i /><span /><b /></div>)}</div>
              ) : (
                <>
                  <div className="results-caption">
                    <span>{results.length} results {searchedFor && <>for <strong>“{searchedFor}”</strong></>}</span>
                    <span>YouTube catalog</span>
                  </div>
                  <div className="recording-list search-list">
                    {results.map((track, index) => trackRow(track, index, results))}
                  </div>
                  {results.length === 0 && !searchError && (
                    <div className="empty-state">
                      <Search size={34} />
                      <h2>Search millions of songs on YouTube.</h2>
                      <p>Type any song name, artist, or band to start streaming.</p>
                      <div>
                        {["Arz Kiya Hai Anuv Jain", "Die With A Smile Bruno Mars", "TREASURE NALLY-NA"].map((suggestion) => (
                          <button key={suggestion} onClick={() => setQuery(suggestion)}>{suggestion}<ArrowUpRight size={13} /></button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* COLLECTION (FAVORITES) VIEW */}
          {view === "collection" && (
            <>
              <div className="page-intro">
                <div>
                  <p className="overline">YOUR FAVORITE MUSIC</p>
                  <h1>Your collection<em>.</em></h1>
                  <p className="intro-description">{library.favorites.length} saved songs ready to replay anytime.</p>
                </div>
                <Heart size={28} strokeWidth={1.3} />
              </div>
              {library.favorites.length ? (
                <div className="recording-list collection-list">
                  {library.favorites.map((track, index) => trackRow(track, index, library.favorites))}
                </div>
              ) : (
                <div className="empty-state">
                  <Heart size={34} />
                  <h2>Make room for your favorites.</h2>
                  <p>Click the heart icon on any song to add it to your personal collection.</p>
                  <button className="primary-button" onClick={() => navigate("playlists")}>
                    Browse Playlists <ArrowRight size={15} />
                  </button>
                </div>
              )}
            </>
          )}

          {/* LISTENING HISTORY VIEW */}
          {view === "memories" && (
            <>
              <div className="page-intro">
                <div>
                  <p className="overline">LISTENING LOG</p>
                  <h1>Listening history<em>.</em></h1>
                  <p className="intro-description">Every song you’ve played in this browser.</p>
                </div>
              </div>
              <div className="memory-date-picker">
                <CalendarDays size={20} />
                <div><strong>Filter by day</strong><span>Pick a date to view past listening</span></div>
                <input type="date" value={memoryDate} max={today || undefined} onChange={(event) => setMemoryDate(event.target.value)} aria-label="Filter memories by date" />
                {memoryDate && <button className="quiet-button" onClick={() => setMemoryDate("")}>All history<X size={14} /></button>}
              </div>
              {Object.entries(memoryGroups).map(([day, memories]) => (
                <section className="memory-day" key={day}>
                  <div className="memory-day-heading">
                    <i />
                    <h2>{new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</h2>
                    <span>{memories.length} {memories.length === 1 ? "song" : "songs"}</span>
                  </div>
                  <div className="recording-list">
                    {memories.map((memory, index) => trackRow(memory.track, index, memories.map((m) => m.track), memory.id))}
                  </div>
                </section>
              ))}
              {!filteredHistory.length && (
                <div className="empty-state">
                  <History size={34} />
                  <h2>{memoryDate ? "No listening on this date." : "Your history starts now."}</h2>
                  <p>Songs are recorded here as soon as you press play.</p>
                  <button className="primary-button" onClick={() => navigate("explore")}>
                    Start Listening <Play size={14} fill="currentColor" />
                  </button>
                </div>
              )}
            </>
          )}

          {/* DOWNLOADS VIEW */}
          {view === "downloads" && (
            <>
              <div className="page-intro">
                <div>
                  <p className="overline">OFFLINE MUSIC</p>
                  <h1>Downloaded Songs<em>.</em></h1>
                  <p className="intro-description">
                    {downloadedSongs.length === 0
                      ? "No downloaded songs yet."
                      : `${downloadedSongs.length} song${downloadedSongs.length === 1 ? "" : "s"} downloaded for offline listening.`}
                  </p>
                </div>
                <Download size={27} strokeWidth={1.4} />
              </div>

              {/* Target Folder Banner */}
              <div className="download-folder-banner">
                <div className="download-folder-info">
                  <FolderOpen size={22} className="folder-icon" />
                  <div>
                    <strong>Target Download Folder</strong>
                    <span className="folder-path" title={electronDownloadsPath || "%USERPROFILE%\\Music\\Rewind Downloads"}>
                      {electronDownloadsPath || (isElectron ? "Music\\Rewind Downloads" : "Music\\Rewind Downloads (Default folder in Rewind App)")}
                    </span>
                  </div>
                </div>
                {isElectron ? (
                  <button
                    type="button"
                    className="open-folder-button"
                    onClick={() => {
                      window.electronAPI?.openDownloadsFolder();
                      notify("Opened Rewind Downloads folder.");
                    }}
                    title="Open folder in File Explorer"
                  >
                    <FolderOpen size={15} /> Open Folder
                  </button>
                ) : (
                  <span style={{ fontSize: "10px", color: "#8c957b" }}>
                    Rewind Desktop App saves automatically here
                  </span>
                )}
              </div>

              {/* Downloaded Tracks List */}
              {downloadedSongs.length > 0 ? (
                <div className="download-songs-container">
                  <div className="download-songs-toolbar">
                    <span className="count-badge">{downloadedSongs.length} tracks</span>
                    <button
                      type="button"
                      className="clear-downloads-button"
                      onClick={() => {
                        if (confirm("Clear all downloaded songs from this list?")) {
                          setDownloadedSongs([]);
                          localStorage.removeItem("rewind-downloaded-songs");
                          notify("Downloaded songs list cleared.");
                        }
                      }}
                    >
                      <Trash2 size={13} /> Clear List
                    </button>
                  </div>
                  <div className="download-list">
                    {downloadedSongs.map((song) => {
                      const track: TimeTrack = {
                        id: song.id,
                        videoId: song.videoId,
                        title: song.title,
                        artist: song.artist,
                        album: song.album || "Single",
                        year: song.year ?? null,
                        genre: song.genre || "Music",
                        duration: song.duration || 180,
                        cover: song.cover || `https://i.ytimg.com/vi/${song.videoId}/hqdefault.jpg`,
                        source: "youtube",
                      };
                      const isCurrent = player.track?.videoId === track.videoId;
                      return (
                        <div key={song.id} className="download-item">
                          <button
                            type="button"
                            className="download-play-btn"
                            onClick={() => {
                              if (isCurrent) {
                                void player.toggle();
                              } else {
                                player.choose(track, [track]);
                              }
                            }}
                            aria-label={`Play ${song.title}`}
                          >
                            {isCurrent && playing ? (
                              <Pause size={17} fill="currentColor" />
                            ) : (
                              <Play size={17} fill="currentColor" />
                            )}
                          </button>
                          <div className="download-meta">
                            <strong>{song.title}</strong>
                            <small>
                              {song.artist} {song.downloadedAt ? `· Downloaded ${new Date(song.downloadedAt).toLocaleDateString()}` : ""}
                            </small>
                          </div>
                          <div className="download-item-actions">
                            <button
                              type="button"
                              className="icon-button"
                              onClick={() => triggerDownload(track)}
                              title="Download again"
                              aria-label={`Download ${song.title} again`}
                            >
                              <ArrowDownToLine size={16} />
                            </button>
                            <button
                              type="button"
                              className="icon-button delete-download-btn"
                              onClick={() => {
                                const next = downloadedSongs.filter((s) => s.id !== song.id);
                                setDownloadedSongs(next);
                                localStorage.setItem("rewind-downloaded-songs", JSON.stringify(next));
                                notify(`Removed "${song.title}" from list.`);
                              }}
                              title="Remove from list"
                              aria-label={`Remove ${song.title} from list`}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="empty-downloads-state">
                  <Disc3 size={44} strokeWidth={1.2} className="empty-disc-icon" />
                  <h3>No downloaded songs yet</h3>
                  <p>
                    Browse your playlists or search for songs, then click the download button on any track to save it here for offline listening.
                  </p>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => navigate("playlists")}
                  >
                    Browse Playlists <ArrowRight size={15} />
                  </button>
                </div>
              )}
            </>
          )}

          {library.error && (
            <div className="sync-warning" role="status">
              {library.error}
              <button onClick={() => void library.reload()}>Retry sync</button>
            </div>
          )}
          <footer className="rewind-footer">
            <span><Rewind size={13} />REWIND MUSIC PLAYER</span>
            <span>POWERED BY YOUTUBE EMBEDS · FULL RECORDINGS</span>
          </footer>
        </main>
      </div>

      {/* MOBILE NAVIGATION */}
      <nav className="mobile-navigation" aria-label="Mobile navigation">
        {nav.map(({ id, label, icon: Icon }) => (
          <button key={id} className={view === id ? "active" : ""} onClick={() => navigate(id)}>
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
        <button className={view === "search" ? "active" : ""} onClick={() => { setView("search"); searchInput.current?.focus(); }}>
          <Search size={18} />
          <span>Search</span>
        </button>
      </nav>

      {/* PERSISTENT AUDIO PLAYER */}
      <section className="persistent-player" aria-label="Music player">
        <div className="player-current">
          <button className="player-artwork" onClick={() => setDetails(player.track)} aria-label="View current album">
            <Artwork track={player.track} eager />
          </button>
          <div>
            <strong>{player.track.title}</strong>
            <span>{player.track.artist}</span>
          </div>
          <div className="player-current-actions">
            <button
              className={`icon-button player-save ${isSaved(player.track) ? "saved" : ""}`}
              onClick={() => void favorite(player.track)}
              aria-label={`${isSaved(player.track) ? "Remove" : "Save"} current song`}
              title={isSaved(player.track) ? "Remove from collection" : "Save to collection"}
            >
              <Heart size={17} fill={isSaved(player.track) ? "currentColor" : "none"} />
            </button>
            {player.track.videoId && (
              <button
                type="button"
                className="icon-button player-download-btn"
                onClick={() => triggerDownload(player.track!)}
                aria-label={`Download ${player.track.title}`}
                title={`Download audio for ${player.track.title}`}
              >
                <ArrowDownToLine size={17} />
              </button>
            )}
          </div>
        </div>

        <div className="player-center">
          <div className="player-transport">
            <button
              className={`icon-button ${player.shuffle ? "enabled" : ""}`}
              onClick={() => player.setShuffle(!player.shuffle)}
              aria-label="Shuffle"
              aria-pressed={player.shuffle}
            >
              <Shuffle size={16} />
            </button>
            <button className="icon-button" onClick={player.previous} aria-label="Previous track">
              <SkipBack size={19} fill="currentColor" />
            </button>
            <button
              className="main-play-button"
              onClick={() => void player.toggle()}
              aria-label={playing ? "Pause playback" : "Play full recording"}
            >
              {player.status === "loading" ? <LoaderCircle size={21} className="spinner" /> : playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
            </button>
            <button className="icon-button" onClick={player.next} aria-label="Next track">
              <SkipForward size={19} fill="currentColor" />
            </button>
            <button
              className={`icon-button ${player.repeat ? "enabled" : ""}`}
              onClick={() => player.setRepeat(!player.repeat)}
              aria-label="Repeat track"
              aria-pressed={player.repeat}
            >
              <Repeat2 size={17} />
            </button>
          </div>

          <div className="player-timeline">
            <span>{clock(player.position)}</span>
            <input
              type="range"
              aria-label="Seek through full recording"
              min={0}
              max={player.duration || 1}
              value={Math.min(player.position, player.duration || 1)}
              disabled={!player.track}
              onChange={(event) => void player.seek(Number(event.target.value))}
              style={{ "--played": `${player.duration ? (player.position / player.duration) * 100 : 0}%` } as CSSProperties}
            />
            <span>{clock(player.duration)}</span>
          </div>
        </div>

        <div className="player-extra">
          <span className="source-label"><i />FULL TRACK</span>
          <button
            className={`icon-button ${queueOpen ? "enabled" : ""}`}
            onClick={() => setQueueOpen(!queueOpen)}
            aria-label="Toggle play queue"
            aria-expanded={queueOpen}
          >
            <ListMusic size={19} />
          </button>
          <div className="player-volume">
            <button className="icon-button" onClick={() => player.setMuted(!player.muted)} aria-label={player.muted ? "Unmute" : "Mute"}>
              {player.muted || player.volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input
              type="range"
              aria-label="Playback volume"
              min={0}
              max={1}
              step={0.01}
              value={player.muted ? 0 : player.volume}
              onChange={(event) => {
                player.setMuted(false);
                player.setVolume(Number(event.target.value));
              }}
            />
          </div>
        </div>
      </section>

      {/* PURE HTML5 AUDIO ELEMENT - NO VIDEO STREAMING */}
      <audio {...player.audioProps} preload="auto" style={{ display: "none" }} />

      {player.error && (
        <div className="playback-toast-error" role="status">
          <p>{player.error}</p>
          <button onClick={player.retry}>Retry</button>
        </div>
      )}

      {/* QUEUE DRAWER */}
      {queueOpen && (
        <aside className="queue-window" aria-label="Play queue">
          <div className="section-header">
            <h2>Up next</h2>
            <button className="icon-button" onClick={() => setQueueOpen(false)} aria-label="Close queue"><X size={17} /></button>
          </div>
          <p>{player.queue.length} songs queued.</p>
          {player.queue.map((track, index) => (
            <button
              key={`${track.id}-${index}`}
              className={`queue-record ${track.videoId === player.track.videoId ? "active" : ""}`}
              onClick={() => player.choose(track, player.queue)}
            >
              <Artwork track={track} />
              <span><strong>{track.title}</strong><small>{track.artist}</small></span>
              <span>{clock(track.duration)}</span>
            </button>
          ))}
        </aside>
      )}

      {toast && <div className="rewind-toast" role="status"><Check size={16} />{toast}</div>}

      {details && (
        <Dialog title={`${details.album} details`} onClose={closeDetails}>
          <div className="album-detail-art">
            <AlbumObject track={details} format="digital" hero />
          </div>
          <p className="overline">{details.album}</p>
          <h2 className="dialog-title">{details.title}</h2>
          <p className="dialog-subtitle">{details.artist}</p>
          <div className="dialog-track">
            <span><strong>{details.title}</strong><small>Full recording · {clock(details.duration)}</small></span>
            <button className="primary-button" onClick={() => { player.choose(details, [details]); setDetails(null); }}>
              <Play size={16} fill="currentColor" />Play
            </button>
          </div>
          <div className="dialog-actions-row">
            <button className="text-link" onClick={() => void favorite(details)}>
              <Heart size={15} fill={isSaved(details) ? "currentColor" : "none"} />
              {isSaved(details) ? "Saved in your collection" : "Save to collection"}
            </button>
            {details.videoId && (
              <button
                type="button"
                className="text-link"
                onClick={() => triggerDownload(details)}
              >
                <ArrowDownToLine size={15} />
                Download audio (.m4a)
              </button>
            )}
          </div>
        </Dialog>
      )}

      {infoOpen && (
        <Dialog title="About Rewind Player" onClose={closeInfo}>
          <div className="guide-icon"><Rewind size={32} fill="currentColor" /></div>
          <p className="overline">MUSIC WITHOUT CUTOFFS</p>
          <h2 className="dialog-title">Stream without limits.</h2>
          <div className="listening-guide">
            <p><strong>Official YouTube Recordings.</strong> Stream any track from your curated playlists or search YouTube without 30-second preview restrictions.</p>
            <p><strong>Your Curated Playlists.</strong> Instantly switch between Kpop 2026, Indie India, and English Songs, with full playback and shuffle.</p>
            <p><strong>Private Collection & History.</strong> Favorites and listening history are saved locally for this browser.</p>
            <p><strong>Keyboard Shortcuts.</strong> Space to play or pause. K to open search. Escape to close dialogs.</p>
          </div>
        </Dialog>
      )}
    </div>
  );
}
