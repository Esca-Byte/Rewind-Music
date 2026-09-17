"use client";

import React, { type CSSProperties } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ListMusic,
  Play,
  Plus,
  Shuffle,
  Sparkles,
  Trash2,
} from "lucide-react";
import { TrackRow } from "@/components/track/TrackRow";
import { playlists as curatedPlaylists } from "@/lib/time/playlists";
import type { TimeTrack } from "@/lib/time/types";
import type { UserPlaylist, ActivePlaylistDisplay, View } from "@/types/music";

interface PlaylistViewProps {
  activePlaylist: ActivePlaylistDisplay;
  selectedPlaylistId: string;
  customPlaylists: UserPlaylist[];
  currentTrackVideoId?: string;
  isPlaying: boolean;
  isSaved: (track: TimeTrack) => boolean;
  onSelectPlaylist: (id: string) => void;
  onOpenNewPlaylistModal: () => void;
  onPlayPlaylist: (pl: { title: string; tracks: TimeTrack[] }, shuffle?: boolean) => void;
  onDeletePlaylist: (id: string) => void;
  onNavigate: (view: View) => void;
  onChooseTrack: (track: TimeTrack, list: TimeTrack[]) => void;
  onPlayNext: (track: TimeTrack) => void;
  onAddToQueue: (track: TimeTrack) => void;
  onOpenAddToPlaylist: (track: TimeTrack) => void;
  onToggleFavorite: (track: TimeTrack) => void;
  onDownload: (track: TimeTrack) => void;
  onRemoveTrackFromPlaylist: (playlistId: string, trackIndex: number) => void;
}

export function PlaylistView({
  activePlaylist,
  selectedPlaylistId,
  customPlaylists,
  currentTrackVideoId,
  isPlaying,
  isSaved,
  onSelectPlaylist,
  onOpenNewPlaylistModal,
  onPlayPlaylist,
  onDeletePlaylist,
  onNavigate,
  onChooseTrack,
  onPlayNext,
  onAddToQueue,
  onOpenAddToPlaylist,
  onToggleFavorite,
  onDownload,
  onRemoveTrackFromPlaylist,
}: PlaylistViewProps) {
  return (
    <>
      <div className="page-intro">
        <div>
          <p className="overline">YOUR SOUNDTRACKS</p>
          <h1>
            Playlists<em>.</em>
          </h1>
          <p className="intro-description">
            Stream curated YouTube mixes or create and play your custom collections.
          </p>
        </div>
        <div className="page-intro-actions">
          <button
            className="primary-button new-playlist-header-btn"
            onClick={onOpenNewPlaylistModal}
          >
            <Plus size={16} /> New Playlist
          </button>
        </div>
      </div>

      <div className="playlist-tabs-row" role="tablist" aria-label="Playlists">
        {curatedPlaylists.map((pl) => (
          <button
            key={pl.id}
            role="tab"
            aria-selected={activePlaylist.id === pl.id}
            className={`playlist-nav-card ${activePlaylist.id === pl.id ? "active" : ""}`}
            onClick={() => onSelectPlaylist(pl.id)}
          >
            <div className="playlist-nav-thumb">
              <img src={pl.cover} alt={pl.title} />
            </div>
            <div className="playlist-nav-meta">
              <strong>{pl.title}</strong>
              <span>
                {pl.trackCount} songs · {Math.round(pl.totalDuration / 60)} min
              </span>
            </div>
          </button>
        ))}

        {customPlaylists.map((pl) => (
          <button
            key={pl.id}
            role="tab"
            aria-selected={activePlaylist.id === pl.id}
            className={`playlist-nav-card custom-nav-card ${
              activePlaylist.id === pl.id ? "active" : ""
            }`}
            onClick={() => onSelectPlaylist(pl.id)}
          >
            <div className="playlist-nav-thumb">
              {pl.tracks[0]?.cover || pl.cover ? (
                <img src={pl.tracks[0]?.cover || pl.cover} alt={pl.title} />
              ) : (
                <div
                  className="playlist-placeholder-thumb"
                  style={{ background: pl.accent || "#e0a82e" }}
                >
                  <ListMusic size={22} />
                </div>
              )}
            </div>
            <div className="playlist-nav-meta">
              <strong>{pl.title}</strong>
              <span>
                {pl.tracks.length} songs ·{" "}
                {Math.round(
                  pl.tracks.reduce((s, t) => s + (t.duration || 180), 0) / 60
                )}{" "}
                min
              </span>
            </div>
          </button>
        ))}

        <button
          className="playlist-nav-card add-new-playlist-card"
          onClick={onOpenNewPlaylistModal}
          aria-label="Create new playlist"
        >
          <div className="add-playlist-card-icon">
            <Plus size={22} />
          </div>
          <div className="playlist-nav-meta">
            <strong>+ New Playlist</strong>
            <span>Create custom mix</span>
          </div>
        </button>
      </div>

      <section
        className="playlist-hero-banner"
        style={{ "--playlist-accent": activePlaylist.accent } as CSSProperties}
      >
        <div className="playlist-hero-artwork">
          <img src={activePlaylist.cover} alt={activePlaylist.title} />
          <span className="playlist-pill-tag">
            {activePlaylist.isCustom ? "CUSTOM PLAYLIST" : "CURATED PLAYLIST"}
          </span>
        </div>
        <div className="playlist-hero-body">
          <span className="playlist-caption-pill">
            <Sparkles size={13} /> {activePlaylist.title}
          </span>
          <h2>{activePlaylist.title}</h2>
          <p>{activePlaylist.tagline}</p>
          <div className="playlist-specs">
            <span>
              <strong>{activePlaylist.trackCount}</strong> recordings
            </span>
            <i />
            <span>
              <strong>{Math.round(activePlaylist.totalDuration / 60)}</strong> minutes
            </span>
            {activePlaylist.isCustom && activePlaylist.url ? (
              <>
                <i />
                <a
                  href={activePlaylist.url}
                  target="_blank"
                  rel="noreferrer"
                  className="playlist-ext-link"
                >
                  Open on YouTube <ArrowUpRight size={13} />
                </a>
              </>
            ) : null}
          </div>
          <div className="playlist-cta-row">
            {activePlaylist.trackCount > 0 && (
              <>
                <button
                  className="primary-button"
                  onClick={() => onPlayPlaylist(activePlaylist, false)}
                >
                  <Play size={16} fill="currentColor" /> Play all ({activePlaylist.trackCount})
                </button>
                <button
                  className="quiet-button"
                  onClick={() => onPlayPlaylist(activePlaylist, true)}
                >
                  <Shuffle size={16} /> Shuffle
                </button>
              </>
            )}
            {activePlaylist.isCustom && (
              <button
                className="quiet-button delete-custom-pl-btn"
                onClick={() => onDeletePlaylist(activePlaylist.id)}
              >
                <Trash2 size={15} /> Delete Playlist
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="playlist-tracks-section">
        <div className="section-header">
          <div>
            <h2>
              Tracklist <span className="small-count">{activePlaylist.tracks.length}</span>
            </h2>
            <p>
              {activePlaylist.tracks.length
                ? "Click any song to play immediately."
                : "This playlist is currently empty."}
            </p>
          </div>
        </div>
        {activePlaylist.tracks.length > 0 ? (
          <div className="recording-list playlist-recording-list">
            {activePlaylist.tracks.map((track, index) => (
              <TrackRow
                key={`${track.id}-${activePlaylist.id}-${index}`}
                track={track}
                index={index}
                list={activePlaylist.tracks}
                suffix={activePlaylist.id}
                isCustomPlaylist={activePlaylist.isCustom}
                activePlaylistId={activePlaylist.id}
                isPlayingCurrent={currentTrackVideoId === track.videoId}
                isPlaying={isPlaying}
                isSaved={isSaved(track)}
                onChoose={onChooseTrack}
                onPlayNext={onPlayNext}
                onAddToQueue={onAddToQueue}
                onOpenAddToPlaylist={onOpenAddToPlaylist}
                onToggleFavorite={onToggleFavorite}
                onDownload={onDownload}
                onRemoveFromPlaylist={onRemoveTrackFromPlaylist}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state custom-empty-state">
            <ListMusic size={38} strokeWidth={1.3} />
            <h3>No songs in this playlist yet</h3>
            <p>
              Find songs in Search, Curated Playlists, or your Collection and click the Add to
              Playlist icon to add them.
            </p>
            <button className="primary-button" onClick={() => onNavigate("explore")}>
              Explore Songs <ArrowRight size={15} />
            </button>
          </div>
        )}
      </section>
    </>
  );
}
