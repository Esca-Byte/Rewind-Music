"use client";

import React from "react";
import { ArrowRight, CalendarDays, Play, Shuffle, Sparkles } from "lucide-react";
import { TrackRow } from "@/components/track/TrackRow";
import { playlists as curatedPlaylists, type Playlist } from "@/lib/time/playlists";
import type { TimeTrack } from "@/lib/time/types";
import type { View } from "@/types/music";

interface ExploreViewProps {
  allTracksCount: number;
  history: Array<{ id: string; playedAt: number | string | Date; track: TimeTrack }>;
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
  history,
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

  return (
    <>
      <div className="page-intro">
        <div>
          <p className="overline">STREAM FULL RECORDINGS</p>
          <h1>
            Good music. <em>In full.</em>
          </h1>
          <p className="intro-description">
            Curated YouTube mixes ready to stream with high fidelity audio.
          </p>
        </div>
        <span className="full-length-badge">
          <span />
          {allTracksCount} SONGS AVAILABLE
        </span>
      </div>

      {/* FEATURED PLAYLIST HERO BANNER */}
      {featured && (
        <section className="explore-featured-hero">
          <div className="featured-hero-media">
            <img src={featured.cover} alt={featured.title} />
            <span className="featured-pill">FEATURED PLAYLIST</span>
          </div>
          <div className="featured-hero-info">
            <span className="playlist-caption-pill">
              <Sparkles size={13} /> TOP PICK
            </span>
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

      {/* CURATED PLAYLISTS 3-CARD GRID */}
      <section className="discover-playlists-shelf">
        <div className="section-header">
          <div>
            <h2>
              Curated Playlists{" "}
              <span className="small-count">{curatedPlaylists.length}</span>
            </h2>
            <p>Select a playlist to browse the full tracklist and start playing.</p>
          </div>
          <button className="text-link" onClick={() => onNavigate("playlists")}>
            All Playlists <ArrowRight size={15} />
          </button>
        </div>
        <div className="discover-playlists-grid">
          {curatedPlaylists.map((pl) => (
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
                <span className="discover-playlist-badge">{pl.trackCount} songs</span>
                <h3>{pl.title}</h3>
                <p>{pl.tagline}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* HIGHLIGHT FROM EACH PLAYLIST */}
      {curatedPlaylists.map((pl) => (
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

      {/* LISTENING HISTORY PREVIEW */}
      <section className="memory-preview">
        <div className="section-header">
          <div>
            <h2>Your Listening History</h2>
            <p>Songs you’ve played recently in this browser.</p>
          </div>
          <button className="text-link" onClick={() => onNavigate("memories")}>
            View full history <ArrowRight size={15} />
          </button>
        </div>
        {history.length ? (
          <div className="recording-list">
            {history.slice(0, 4).map((memory, i) => (
              <TrackRow
                key={`${memory.track.id}-${memory.id}-${i}`}
                track={memory.track}
                index={i}
                list={history.map((m) => m.track)}
                suffix={memory.id}
                isPlayingCurrent={currentTrackVideoId === memory.track.videoId}
                isPlaying={isPlaying}
                isSaved={isSaved(memory.track)}
                onChoose={onChooseTrack}
                onPlayNext={onPlayNext}
                onAddToQueue={onAddToQueue}
                onOpenAddToPlaylist={onOpenAddToPlaylist}
                onToggleFavorite={onToggleFavorite}
                onDownload={onDownload}
              />
            ))}
          </div>
        ) : (
          <div className="memory-invitation">
            <span className="memory-date-icon">
              <CalendarDays size={24} />
            </span>
            <div>
              <strong>Your listening history starts here.</strong>
              <p>Press play on any song and we’ll keep track of your memories.</p>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
