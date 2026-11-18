"use client";

import React from "react";
import {
  ArrowRight,
  Clock3,
  Flame,
  Heart,
  Infinity as InfinityIcon,
  MoreHorizontal,
  Music2,
  Plus,
  Play,
  Radio,
  Shuffle,
  Sparkles,
} from "lucide-react";
import { TrackRow } from "@/components/track/TrackRow";
import { getTrackCoverUrl } from "@/components/time/album-object";
import type { Playlist } from "@/lib/time/playlists";
import type { TimeTrack } from "@/lib/time/types";
import { SMART_QUEUE_MODES, type SmartQueueModeId } from "@/lib/time/smart-queue";
import type { View } from "@/types/music";

interface ExploreViewProps {
  allTracksCount: number;
  allTracks: TimeTrack[];
  curatedPlaylists: Playlist[];
  history: Array<{ id: string; playedAt: number | string | Date; track: TimeTrack }>;
  currentTrack?: TimeTrack;
  personalizedTracks: TimeTrack[];
  currentTrackVideoId?: string;
  isPlaying: boolean;
  smartQueueMode: SmartQueueModeId;
  autoQueueEnabled: boolean;
  isSaved: (track: TimeTrack) => boolean;
  onNavigate: (view: View) => void;
  onOpenPlaylist: (id: string) => void;
  onPlayPlaylist: (pl: { title: string; tracks: TimeTrack[] }, shuffle?: boolean) => void;
  onAddPlaylistToQueue: (playlist: Playlist) => void;
  onChooseTrack: (track: TimeTrack, list: TimeTrack[]) => void;
  onPlayNext: (track: TimeTrack) => void;
  onAddToQueue: (track: TimeTrack) => void;
  onStartRadio: (track: TimeTrack) => void;
  onLaunchSmartQueueMode: (mode: SmartQueueModeId) => void;
  onOpenAddToPlaylist: (track: TimeTrack) => void;
  onToggleFavorite: (track: TimeTrack) => void;
  isPlaylistSaved: (playlist: Playlist) => boolean;
  onTogglePlaylistSaved: (playlist: Playlist) => void;
  onDownload: (track: TimeTrack) => void;
  onOpenDetails: (track: TimeTrack) => void;
  onOpenArtist: (artist: string) => void;
}

type HomeMixCard = {
  id: string;
  title: string;
  description: string;
  cover: string;
  tracks: TimeTrack[];
  playlistId?: string;
};

export function ExploreView({
  allTracksCount,
  allTracks,
  curatedPlaylists,
  history,
  currentTrack,
  personalizedTracks,
  currentTrackVideoId,
  isPlaying,
  smartQueueMode,
  autoQueueEnabled,
  isSaved,
  onNavigate,
  onOpenPlaylist,
  onPlayPlaylist,
  onAddPlaylistToQueue,
  onChooseTrack,
  onPlayNext,
  onAddToQueue,
  onStartRadio,
  onLaunchSmartQueueMode,
  onOpenAddToPlaylist,
  onToggleFavorite,
  isPlaylistSaved,
  onTogglePlaylistSaved,
  onDownload,
  onOpenDetails,
  onOpenArtist,
}: ExploreViewProps) {
  const featuredSlides = curatedPlaylists.slice(0, 4);
  const [featuredIndex, setFeaturedIndex] = React.useState(0);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [showAllPreviews, setShowAllPreviews] = React.useState(false);
  const moreMenuRef = React.useRef<HTMLDivElement>(null);
  const swipeStart = React.useRef<{ x: number; y: number } | null>(null);

  React.useEffect(() => {
    if (!moreOpen) return;
    const closeMenu = (event: PointerEvent) => {
      if (!moreMenuRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreOpen]);

  const selectFeatured = (index: number) => {
    if (!featuredSlides.length) return;
    setFeaturedIndex(Math.max(0, Math.min(index, featuredSlides.length - 1)));
    setMoreOpen(false);
  };

  const moveFeatured = (direction: number) => {
    if (featuredSlides.length < 2) return;
    setFeaturedIndex((current) => (current + direction + featuredSlides.length) % featuredSlides.length);
    setMoreOpen(false);
  };

  const handleHeroPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    swipeStart.current = { x: event.clientX, y: event.clientY };
  };

  const handleHeroPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    moveFeatured(deltaX < 0 ? 1 : -1);
  };

  const handleHeroKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveFeatured(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveFeatured(-1);
    }
  };

  const activeFeaturedIndex = Math.min(featuredIndex, Math.max(0, featuredSlides.length - 1));
  const featured = featuredSlides[activeFeaturedIndex] || curatedPlaylists[0];
  const genres = Array.from(new Set(allTracks.map((track) => track.genre).filter(Boolean))).slice(0, 8);
  const [genreFilter, setGenreFilter] = React.useState("All");
  const [moodFilter, setMoodFilter] = React.useState("All");
  const moods = ["All", "Chill", "Energetic", "Sad", "Romantic", "Workout", "Focus"];
  const matchesMood = (track: TimeTrack, mood: string) => {
    if (mood === "All") return true;
    const text = `${track.title} ${track.artist} ${track.album} ${track.genre}`.toLowerCase();
    const keywords: Record<string, string[]> = {
      Chill: ["chill", "lofi", "acoustic", "ambient", "indie", "slow", "soft"],
      Energetic: ["party", "dance", "pop", "phonk", "viral", "hit", "banger"],
      Sad: ["sad", "alone", "broken", "cry", "heart", "melancholy", "1 am"],
      Romantic: ["love", "romantic", "valentine", "kiss", "romance", "couple"],
      Workout: ["workout", "gym", "hard", "rap", "hip hop", "energy", "edm"],
      Focus: ["focus", "study", "instrumental", "classical", "calm", "piano"],
    };
    return keywords[mood]?.some((keyword) => text.includes(keyword)) || false;
  };
  const visiblePlaylists = curatedPlaylists.filter((playlist) =>
    (genreFilter === "All" || playlist.tracks.some((track) => track.genre === genreFilter)) &&
    (moodFilter === "All" || playlist.tracks.some((track) => matchesMood(track, moodFilter)))
  );
  const dailyTracks = personalizedTracks.length ? personalizedTracks : allTracks.slice(0, 12);
  const mixCards: HomeMixCard[] = [
    {
      id: "daily-mix",
      title: "Your Daily Mix",
      description: "Based on your listening history",
      cover: dailyTracks[0]
        ? getTrackCoverUrl(dailyTracks[0])
        : featured?.cover || "",
      tracks: dailyTracks,
    },
    ...curatedPlaylists.slice(0, 5).map((playlist) => ({
      id: playlist.id,
      title: playlist.title,
      description: playlist.tagline,
      cover: playlist.cover,
      tracks: playlist.tracks,
      playlistId: playlist.id,
    })),
  ];
  const trendingTracks = allTracks.slice(0, 6);
  const recentTracks = history.length
    ? history.slice(0, 6).map((memory) => memory.track)
    : allTracks.slice(0, 6);
  const playMixCard = (mix: HomeMixCard) => {
    if (mix.playlistId) {
      onPlayPlaylist(curatedPlaylists.find((playlist) => playlist.id === mix.playlistId) || { title: mix.title, tracks: mix.tracks }, false);
      return;
    }
    onPlayPlaylist({ title: mix.title, tracks: mix.tracks }, false);
  };

  return (
    <>
      {/* FEATURED PLAYLIST HERO */}
      {featured && (
        <section
          className="explore-featured-hero home-hero"
          aria-label="Featured playlists"
          aria-roledescription="carousel"
          tabIndex={0}
          onPointerDown={handleHeroPointerDown}
          onPointerUp={handleHeroPointerUp}
          onPointerCancel={() => {
            swipeStart.current = null;
          }}
          onKeyDown={handleHeroKeyDown}
        >
          <div className="featured-hero-media hero-slide-in" key={`media-${featured.id}`}>
            <img src={featured.cover} alt={featured.title} />
            <span className="featured-pill">FEATURED PLAYLIST</span>
          </div>
          <div className="featured-hero-info hero-slide-in" key={`info-${featured.id}`}>
            <p className="home-hero-eyebrow">A fresh place to start</p>
            <h2>{featured.title}</h2>
            <p>{featured.tagline}</p>
            <div className="featured-hero-meta">
              <span><Music2 size={14} /> {featured.trackCount} tracks</span>
              <span>•</span>
              <span>{Math.round(featured.totalDuration / 60)} minutes of music</span>
            </div>
            <div className="featured-hero-actions">
              <button
                className="primary-button"
                onClick={() => onPlayPlaylist(featured, false)}
              >
                <Play size={16} fill="currentColor" /> Play Now
              </button>
              <button
                className="quiet-button"
                onClick={() => onPlayPlaylist(featured, true)}
              >
                <Shuffle size={16} /> Shuffle
              </button>
              <button
                type="button"
                className={`hero-icon-button ${isPlaylistSaved(featured) ? "is-active" : ""}`}
                onClick={() => onTogglePlaylistSaved(featured)}
                aria-label={`${isPlaylistSaved(featured) ? "Remove" : "Save"} ${featured.title}`}
                aria-pressed={isPlaylistSaved(featured)}
                title={isPlaylistSaved(featured) ? "Remove saved playlist" : "Save playlist"}
              >
                <Heart size={18} fill={isPlaylistSaved(featured) ? "currentColor" : "none"} />
              </button>
              <button
                type="button"
                className="hero-icon-button"
                onClick={() => onAddPlaylistToQueue(featured)}
                aria-label={`Add ${featured.title} to the play queue`}
                title="Add playlist to queue"
              >
                <Plus size={18} />
              </button>
              <div className="hero-more-control" ref={moreMenuRef}>
                <button
                  type="button"
                  className={`hero-icon-button ${moreOpen ? "is-active" : ""}`}
                  onClick={() => setMoreOpen((open) => !open)}
                  aria-label="More featured playlist actions"
                  aria-expanded={moreOpen}
                  aria-haspopup="menu"
                  title="More actions"
                >
                  <MoreHorizontal size={18} />
                </button>
                {moreOpen && (
                  <div className="hero-actions-menu" role="menu" aria-label={`${featured.title} actions`}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onOpenPlaylist(featured.id);
                        setMoreOpen(false);
                      }}
                    >
                      <ArrowRight size={14} /> Open playlist
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onPlayPlaylist(featured, true);
                        setMoreOpen(false);
                      }}
                    >
                      <Shuffle size={14} /> Play shuffled
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onAddPlaylistToQueue(featured);
                        setMoreOpen(false);
                      }}
                    >
                      <Plus size={14} /> Add all to queue
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="hero-slide-dots" aria-label="Choose featured playlist">
            {featuredSlides.map((playlist, index) => (
              <button
                type="button"
                key={playlist.id}
                className={index === activeFeaturedIndex ? "active" : ""}
                onClick={() => selectFeatured(index)}
                aria-label={`Show ${playlist.title}`}
                aria-current={index === activeFeaturedIndex ? "true" : undefined}
              />
            ))}
          </div>
        </section>
      )}

      <section className="home-shelf smart-radio-shelf">
        <div className="section-header home-shelf-header">
          <div>
            <h2><Radio size={19} /> Instant Smart Queue</h2>
            <p>Launch an endless auto-queue tuned to a genre, mood, or your current track.</p>
          </div>
          <span className={`smart-radio-status-pill ${autoQueueEnabled ? "active" : ""}`}>
            <InfinityIcon size={12} /> {autoQueueEnabled ? "Auto-Queue On" : "Auto-Queue Paused"}
          </span>
        </div>
        <div className="smart-radio-grid">
          {SMART_QUEUE_MODES.map((mode) => {
            const isActive = autoQueueEnabled && smartQueueMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                className={`smart-radio-card ${isActive ? "active" : ""}`}
                onClick={() => onLaunchSmartQueueMode(mode.id)}
                title={mode.description}
              >
                <span className="smart-radio-card-head">
                  <strong>{mode.label}</strong>
                  <Radio size={13} />
                </span>
                <small>{mode.description}</small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="home-shelf home-mixes-shelf">
        <div className="section-header home-shelf-header">
          <div>
            <h2>Made For You</h2>
            <p>Playlists and mixes tailored to your taste.</p>
          </div>
          <button className="text-link" onClick={() => onNavigate("playlists")}>See All <ArrowRight size={15} /></button>
        </div>
        <div className="home-mix-grid">
          {mixCards.map((mix) => (
            <article
              key={mix.id}
              className="home-mix-card"
              role="button"
              tabIndex={0}
              onClick={() => playMixCard(mix)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") playMixCard(mix);
              }}
            >
              <div className="home-mix-artwork">
                <img src={mix.cover} alt="" loading="lazy" />
                <button
                  type="button"
                  className="home-card-play"
                  onClick={(event) => {
                    event.stopPropagation();
                    playMixCard(mix);
                  }}
                  aria-label={`Play ${mix.title}`}
                >
                  <Play size={17} fill="currentColor" />
                </button>
              </div>
              <div className="home-mix-copy">
                <strong>{mix.title}</strong>
                <span>{mix.description}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="home-shelf home-trending-shelf">
        <div className="section-header home-shelf-header">
          <div>
            <h2><Flame size={20} /> Trending Now</h2>
            <p>What&apos;s hot right now</p>
          </div>
          <button className="text-link" onClick={() => onNavigate("search")}>See All <ArrowRight size={15} /></button>
        </div>
        <div className="home-trending-grid">
          {trendingTracks.map((track, index) => (
            <article
              className={`home-track-card ${currentTrack?.id === track.id ? "is-current" : ""}`}
              key={`trending-${track.id}`}
              role="button"
              tabIndex={0}
              onClick={() => onChooseTrack(track, trendingTracks)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onChooseTrack(track, trendingTracks);
              }}
            >
              <div className="home-track-artwork">
                <span className="home-track-rank">{index + 1}</span>
                <img src={getTrackCoverUrl(track)} alt="" loading="lazy" />
                <span className="home-track-play"><Play size={15} fill="currentColor" /></span>
              </div>
              <div className="home-track-copy">
                <strong title={track.title}>{track.title.replace(/\s+(Official|MV|M\/V).*$/i, "")}</strong>
                <span>{track.artist}</span>
              </div>
              <div className="home-track-meta">
                <span><Music2 size={11} /> Full track</span>
                <span><Clock3 size={11} /> {Math.round(track.duration / 60)}m</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      {recentTracks.length > 0 && (
        <section className="home-shelf home-recent-shelf">
          <div className="section-header home-shelf-header">
            <div>
              <h2><Clock3 size={20} /> Recently Played</h2>
              <p>{history.length ? "Pick up where your listening trail left off." : "Your listening history will appear here."}</p>
            </div>
            <button className="text-link" onClick={() => onNavigate("memories")}>See All <ArrowRight size={15} /></button>
          </div>
          <div className="home-recent-grid">
            {recentTracks.map((track, index) => (
              <button
                type="button"
                className="home-recent-card"
                key={`recent-${track.id}-${index}`}
                onClick={() => onChooseTrack(track, recentTracks)}
                title={`Play ${track.title}`}
              >
                <span className="home-recent-artwork">
                  <img src={getTrackCoverUrl(track)} alt="" loading="lazy" />
                </span>
                <span className="home-recent-copy">
                  <strong>{track.title}</strong>
                  <small>{track.artist}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* FULL PLAYLIST LIBRARY */}
      <section className="discover-playlists-shelf">
        <div className="section-header home-playlist-header">
          <div>
              <h2>
                Made for the mood{" "}
                <span className="small-count">{curatedPlaylists.length} mixes · {allTracksCount} tracks</span>
            </h2>
            <p>Handpicked rooms for every kind of listening day.</p>
          </div>
          <button className="text-link" onClick={() => onNavigate("playlists")}>
            All Playlists <ArrowRight size={15} />
          </button>
        </div>
        <div className="home-genre-filter" role="tablist" aria-label="Filter playlists by genre">
          {['All', ...genres].map((genre) => (
            <button key={genre} className={genreFilter === genre ? "active" : ""} onClick={() => setGenreFilter(genre)} aria-pressed={genreFilter === genre}>
              {genre}
            </button>
          ))}
        </div>
        <div className="home-genre-filter home-mood-filter" role="tablist" aria-label="Filter playlists by mood">
          {moods.map((mood) => (
            <button key={mood} className={moodFilter === mood ? "active" : ""} onClick={() => setMoodFilter(mood)} aria-pressed={moodFilter === mood}>
              {mood === "All" ? "All moods" : mood}
            </button>
          ))}
        </div>
        <div className="discover-playlists-grid">
          {visiblePlaylists.map((pl) => (
            <div
              key={pl.id}
              className="discover-playlist-card"
              role="button"
              tabIndex={0}
              onClick={() => onOpenPlaylist(pl.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onOpenPlaylist(pl.id);
              }}
            >
              <div className="discover-playlist-cover">
                <img src={pl.cover} alt={pl.title} loading="lazy" />
                <button
                  className="discover-play-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlayPlaylist(pl, false);
                  }}
                  aria-label={`Play ${pl.title}`}
                >
                  <Play size={18} fill="currentColor" />
                </button>
              </div>
              <div className="discover-playlist-info">
                <span className="discover-playlist-badge">
                  {pl.spotifyId && !pl.trackCount ? "Loading from Spotify" : `${pl.trackCount} songs`}
                </span>
                <h3>{pl.title}</h3>
                <p>{pl.tagline}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* HIGHLIGHT FROM EACH PLAYLIST (capped to 2 by default to keep Home fast & clean) */}
      {(showAllPreviews ? visiblePlaylists : visiblePlaylists.slice(0, 2)).map((pl) => (
        <section className="explore-playlist-preview" key={pl.id}>
          <div className="section-header">
            <div>
              <h2>
                {pl.title}{" "}
                <span className="small-count">{pl.trackCount} tracks</span>
              </h2>
              <p>{pl.tagline}</p>
            </div>
            <button className="text-link" onClick={() => onOpenPlaylist(pl.id)}>
              See all {pl.trackCount} tracks <ArrowRight size={15} />
            </button>
          </div>
          <div className="recording-list">
            {pl.tracks.slice(0, 5).map((track, index) => (
              <TrackRow
                key={`${track.id}-${pl.id}-${index}`}
                track={track}
                index={index}
                list={pl.tracks}
                suffix={pl.id}
                isPlayingCurrent={currentTrackVideoId === track.videoId}
                isPlaying={isPlaying}
                isSaved={isSaved(track)}
                onChoose={onChooseTrack}
                onPlayNext={onPlayNext}
                onAddToQueue={onAddToQueue}
                onStartRadio={onStartRadio}
                onOpenAddToPlaylist={onOpenAddToPlaylist}
                onToggleFavorite={onToggleFavorite}
                onDownload={onDownload}
                onOpenDetails={onOpenDetails}
                onOpenArtist={onOpenArtist}
              />
            ))}
          </div>
        </section>
      ))}

      {visiblePlaylists.length > 2 && (
        <div className="explore-preview-toggle-row">
          <button
            type="button"
            className="quiet-button"
            onClick={() => setShowAllPreviews((prev) => !prev)}
          >
            {showAllPreviews
              ? "Show fewer playlist previews"
              : `Show all ${visiblePlaylists.length} playlist previews`}
          </button>
        </div>
      )}

      {!visiblePlaylists.length && (
        <div className="empty-state home-filter-empty">
          <Sparkles size={28} />
          <h2>No mixes in this genre yet</h2>
          <p>Try another filter or add a Spotify playlist to grow this shelf.</p>
        </div>
      )}

    </>
  );
}
