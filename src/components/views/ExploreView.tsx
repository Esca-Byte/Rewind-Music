"use client";

import React from "react";
import {
  ArrowRight,
  Play,
  Shuffle,
  Sparkles,
} from "lucide-react";
import { TrackRow } from "@/components/track/TrackRow";
import type { Playlist } from "@/lib/time/playlists";
import type { TimeTrack } from "@/lib/time/types";
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
  isSaved: (track: TimeTrack) => boolean;
  onNavigate: (view: View) => void;
  onOpenPlaylist: (id: string) => void;
  onPlayPlaylist: (pl: { title: string; tracks: TimeTrack[] }, shuffle?: boolean) => void;
  onChooseTrack: (track: TimeTrack, list: TimeTrack[]) => void;
  onPlayNext: (track: TimeTrack) => void;
  onAddToQueue: (track: TimeTrack) => void;
  onOpenAddToPlaylist: (track: TimeTrack) => void;
  onToggleFavorite: (track: TimeTrack) => void;
  onDownload: (track: TimeTrack) => void;
}

export function ExploreView({
  allTracksCount,
  allTracks,
  curatedPlaylists,
  history,
  currentTrack,
  personalizedTracks,
  currentTrackVideoId,
  isPlaying,
  isSaved,
  onNavigate,
  onOpenPlaylist,
  onPlayPlaylist,
  onChooseTrack,
  onPlayNext,
  onAddToQueue,
  onOpenAddToPlaylist,
  onToggleFavorite,
  onDownload,
}: ExploreViewProps) {
  const featured = curatedPlaylists[0];
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

  return (
    <>
      <div className="home-welcome-row">
        <div>
          <p className="overline">YOUR PERSONAL LISTENING ROOM</p>
          <h1>
            Find your next <em>favorite sound.</em>
          </h1>
          <p className="intro-description">
            Full-length listening, handpicked for the moments that matter.
          </p>
        </div>
        <div className="home-library-stats">
          <span><strong>{allTracksCount}</strong> tracks</span>
          <span><strong>{curatedPlaylists.length}</strong> mixes</span>
          <span><strong>{history.length}</strong> memories</span>
        </div>
      </div>

      {/* FEATURED PLAYLIST HERO BANNER */}
      {featured && (
        <section className="explore-featured-hero home-hero">
          <div className="featured-hero-media">
            <img src={featured.cover} alt={featured.title} />
            <span className="featured-pill">FEATURED PLAYLIST</span>
          </div>
          <div className="featured-hero-info">
            <span className="playlist-caption-pill">
              <Sparkles size={13} /> TOP PICK
            </span>
            <p className="home-hero-eyebrow">A fresh place to start</p>
            <h2>{featured.title}</h2>
            <p>{featured.tagline}</p>
            <div className="featured-hero-meta">
              <span>{featured.trackCount} full tracks</span>
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
                className="text-link"
                onClick={() => onOpenPlaylist(featured.id)}
              >
                View Playlist <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="home-personalized">
        <div className="section-header">
          <div>
            <h2>Daily Mix <span className="small-count">{personalizedTracks.length}</span></h2>
            <p>A living mix shaped by what you save and play.</p>
          </div>
          <div className="home-personalized-actions">
            <button className="quiet-button" onClick={() => onPlayPlaylist({ title: "Made for you", tracks: personalizedTracks }, true)} disabled={!personalizedTracks.length}>
              <Shuffle size={14} /> Refresh mix
            </button>
            <button className="text-link" onClick={() => onPlayPlaylist({ title: "Made for you", tracks: personalizedTracks }, false)} disabled={!personalizedTracks.length}>
              Play all <ArrowRight size={14} />
            </button>
          </div>
        </div>
        <div className="home-personalized-list">
          {personalizedTracks.slice(0, 5).map((track, index) => (
            <TrackRow
              key={`personalized-${track.id}-${index}`}
              track={track}
              index={index}
              list={personalizedTracks}
              suffix="personalized"
              isPlayingCurrent={currentTrackVideoId === track.videoId}
              isPlaying={isPlaying}
              isSaved={isSaved(track)}
              onChoose={onChooseTrack}
              onPlayNext={onPlayNext}
              onAddToQueue={onAddToQueue}
              onOpenAddToPlaylist={onOpenAddToPlaylist}
              onToggleFavorite={onToggleFavorite}
              onDownload={onDownload}
            />
          ))}
        </div>
      </section>

      {currentTrack && (
        <section className="home-now-listening">
          <div className="home-now-copy">
            <span className="home-section-kicker"><span /> NOW IN THE ROOM</span>
            <strong>{currentTrack.title}</strong>
            <small>{currentTrack.artist}</small>
          </div>
          <button className="home-now-play" onClick={() => onChooseTrack(currentTrack, [currentTrack])}>
            <Play size={15} fill="currentColor" /> Play again
          </button>
        </section>
      )}

      {history.length > 0 && (
        <section className="home-continue-section">
          <div className="section-header">
            <div>
              <h2>Continue listening <span className="small-count">{history.length}</span></h2>
              <p>Pick up where your listening trail left off.</p>
            </div>
            <button className="text-link" onClick={() => onNavigate("memories")}>
              View history <ArrowRight size={15} />
            </button>
          </div>
          <div className="home-continue-grid">
            {history.slice(0, 6).map((memory) => (
              <button
                type="button"
                className="home-continue-card"
                key={memory.id}
                onClick={() => onChooseTrack(memory.track, history.map((item) => item.track))}
                title={`Play ${memory.track.title}`}
              >
                <span className="home-continue-artwork">
                  <img src={memory.track.cover} alt="" loading="lazy" />
                  <span><Play size={14} fill="currentColor" /></span>
                </span>
                <span className="home-continue-copy">
                  <strong>{memory.track.title}</strong>
                  <small>{memory.track.artist}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* CURATED PLAYLISTS */}
      <section className="discover-playlists-shelf">
        <div className="section-header home-playlist-header">
          <div>
            <h2>
              Made for the mood{" "}
              <span className="small-count">{curatedPlaylists.length}</span>
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

      {/* HIGHLIGHT FROM EACH PLAYLIST */}
      {visiblePlaylists.map((pl) => (
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
                onOpenAddToPlaylist={onOpenAddToPlaylist}
                onToggleFavorite={onToggleFavorite}
                onDownload={onDownload}
              />
            ))}
          </div>
        </section>
      ))}

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
