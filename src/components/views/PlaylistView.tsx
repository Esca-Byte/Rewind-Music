"use client";

import React, { useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  Download,
  FileUp,
  LoaderCircle,
  Pencil,
  RefreshCw,
  ListMusic,
  Play,
  Plus,
  Shuffle,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { TrackRow } from "@/components/track/TrackRow";
import { YoutubeIcon } from "@/components/common/YoutubeIcon";
import { SpotifyIcon } from "@/components/common/SpotifyIcon";
import type { Playlist } from "@/lib/time/playlists";
import type { TimeTrack } from "@/lib/time/types";
import type { UserPlaylist, ActivePlaylistDisplay, View } from "@/types/music";

type TrackSortOrder = "default" | "title" | "artist" | "duration";

export interface BatchDownloadProgress {
  playlistId: string;
  title: string;
  completed: number;
  total: number;
  active: boolean;
}

interface PlaylistViewProps {
  activePlaylist: ActivePlaylistDisplay;
  selectedPlaylistId: string;
  customPlaylists: UserPlaylist[];
  curatedPlaylists: Playlist[];
  currentTrackVideoId?: string;
  isPlaying: boolean;
  isSaved: (track: TimeTrack) => boolean;
  batchDownload: BatchDownloadProgress | null;
  onSelectPlaylist: (id: string) => void;
  onOpenNewPlaylistModal: () => void;
  onPlayPlaylist: (pl: { title: string; tracks: TimeTrack[] }, shuffle?: boolean) => void;
  onDeletePlaylist: (id: string) => void;
  onRenamePlaylist: (id: string, nextTitle: string) => void;
  onBatchDownloadPlaylist: (playlist: ActivePlaylistDisplay) => void;
  onCancelBatchDownload: () => void;
  onNavigate: (view: View) => void;
  onChooseTrack: (track: TimeTrack, list: TimeTrack[]) => void;
  onPlayNext: (track: TimeTrack) => void;
  onAddToQueue: (track: TimeTrack) => void;
  onStartRadio: (track: TimeTrack) => void;
  onOpenAddToPlaylist: (track: TimeTrack) => void;
  onToggleFavorite: (track: TimeTrack) => void;
  onDownload: (track: TimeTrack) => void;
  onOpenDetails: (track: TimeTrack) => void;
  onOpenArtist: (artist: string) => void;
  onRemoveTrackFromPlaylist: (playlistId: string, trackIndex: number) => void;
  onExportPlaylists: () => void;
  onImportPlaylists: (file: File) => void;
  onRefreshPlaylist: (id: string) => void;
  refreshingPlaylistId: string | null;
}

export function PlaylistView({
  activePlaylist,
  selectedPlaylistId,
  customPlaylists,
  curatedPlaylists,
  currentTrackVideoId,
  isPlaying,
  isSaved,
  batchDownload,
  onSelectPlaylist,
  onOpenNewPlaylistModal,
  onPlayPlaylist,
  onDeletePlaylist,
  onRenamePlaylist,
  onBatchDownloadPlaylist,
  onCancelBatchDownload,
  onNavigate,
  onChooseTrack,
  onPlayNext,
  onAddToQueue,
  onStartRadio,
  onOpenAddToPlaylist,
  onToggleFavorite,
  onDownload,
  onOpenDetails,
  onOpenArtist,
  onRemoveTrackFromPlaylist,
  onExportPlaylists,
  onImportPlaylists,
  onRefreshPlaylist,
  refreshingPlaylistId,
}: PlaylistViewProps) {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [sortOrder, setSortOrder] = useState<TrackSortOrder>("default");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const isRenaming = renamingId === activePlaylist.id;

  const sortedTracks = useMemo(() => {
    const items = activePlaylist.tracks.map((track, originalIndex) => ({ track, originalIndex }));
    if (sortOrder === "title") {
      items.sort((a, b) => a.track.title.localeCompare(b.track.title));
    } else if (sortOrder === "artist") {
      items.sort((a, b) => a.track.artist.localeCompare(b.track.artist));
    } else if (sortOrder === "duration") {
      items.sort((a, b) => (a.track.duration || 0) - (b.track.duration || 0));
    }
    return items;
  }, [activePlaylist.tracks, sortOrder]);

  const orderedList = useMemo(() => sortedTracks.map((item) => item.track), [sortedTracks]);
  const isBatchDownloadingThis = Boolean(batchDownload?.active && batchDownload.playlistId === activePlaylist.id);
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
          <div className="playlist-header-actions">
          <button
            className="primary-button new-playlist-header-btn"
            onClick={onOpenNewPlaylistModal}
          >
            <Plus size={16} /> New Playlist
          </button>
          <button className="quiet-button" onClick={onExportPlaylists} title="Export your custom playlists">
            <Download size={15} /> Backup
          </button>
          <button className="quiet-button" onClick={() => importInputRef.current?.click()} title="Import a Rewind playlist backup">
            <FileUp size={15} /> Restore
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImportPlaylists(file);
              event.target.value = "";
            }}
          />
          </div>
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
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                {pl.spotifyId ? (
                  <SpotifyIcon size={12} className="text-[#1db954] flex-shrink-0" />
                ) : pl.youtubeId ? (
                  <YoutubeIcon size={12} className="text-[#ef4444] flex-shrink-0" />
                ) : null}
                <span>
                  {pl.tracks.length} songs ·{" "}
                  {Math.round(
                    pl.tracks.reduce((s, t) => s + (t.duration || 180), 0) / 60
                  )}{" "}
                  min
                </span>
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
            {activePlaylist.url?.includes("spotify.com")
              ? "SPOTIFY PLAYLIST"
              : activePlaylist.url?.includes("youtube.com")
              ? "YOUTUBE PLAYLIST"
              : activePlaylist.isCustom
              ? "CUSTOM PLAYLIST"
              : "CURATED PLAYLIST"}
          </span>
        </div>
        <div className="playlist-hero-body">
          <span className="playlist-caption-pill">
            <Sparkles size={13} /> {activePlaylist.title}
          </span>
          {isRenaming ? (
            <form
              className="playlist-rename-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (renameDraft.trim()) onRenamePlaylist(activePlaylist.id, renameDraft.trim());
                setRenamingId(null);
              }}
            >
              <input
                type="text"
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
                maxLength={60}
                autoFocus
                aria-label="Rename playlist"
              />
              <button type="submit" className="primary-button">
                <Check size={14} /> Save
              </button>
              <button type="button" className="quiet-button" onClick={() => setRenamingId(null)}>
                <X size={14} />
              </button>
            </form>
          ) : (
            <h2>{activePlaylist.title}</h2>
          )}
          <p>{activePlaylist.tagline}</p>
          <div className="playlist-specs">
            <span>
              <strong>{activePlaylist.trackCount}</strong> tracks
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
                  {activePlaylist.url.includes("spotify.com") ? (
                    <>
                      <SpotifyIcon size={13} className="text-[#1db954]" /> Open on Spotify{" "}
                      <ArrowUpRight size={13} />
                    </>
                  ) : (
                    <>
                      <YoutubeIcon size={13} className="text-[#ef4444]" /> Open on YouTube{" "}
                      <ArrowUpRight size={13} />
                    </>
                  )}
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
                {isBatchDownloadingThis ? (
                  <button
                    type="button"
                    className="quiet-button"
                    onClick={onCancelBatchDownload}
                  >
                    <LoaderCircle size={14} className="spinner" />
                    Downloading {batchDownload?.completed}/{batchDownload?.total} · Cancel
                  </button>
                ) : (
                  <button
                    type="button"
                    className="quiet-button"
                    onClick={() => onBatchDownloadPlaylist(activePlaylist)}
                    disabled={Boolean(batchDownload?.active)}
                    title="Download all songs in this playlist for offline playback"
                  >
                    <ArrowDownToLine size={15} /> Download All
                  </button>
                )}
              </>
            )}
            {activePlaylist.isCustom && (
              <>
                <button
                  type="button"
                  className="quiet-button"
                  onClick={() => {
                    setRenameDraft(activePlaylist.title);
                    setRenamingId(activePlaylist.id);
                  }}
                >
                  <Pencil size={14} /> Rename
                </button>
                <button
                  className="quiet-button delete-custom-pl-btn"
                  onClick={() => onDeletePlaylist(activePlaylist.id)}
                >
                  <Trash2 size={15} /> Delete Playlist
                </button>
              </>
            )}
            {activePlaylist.spotifyId && (
              <button
                className="quiet-button"
                onClick={() => onRefreshPlaylist(activePlaylist.id)}
                disabled={refreshingPlaylistId === activePlaylist.id}
              >
                <RefreshCw size={15} className={refreshingPlaylistId === activePlaylist.id ? "spin" : ""} />
                {refreshingPlaylistId === activePlaylist.id ? "Refreshing…" : "Refresh from Spotify"}
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
                ? "Click any song to play immediately, or right-click for quick actions."
                : "This playlist is currently empty."}
            </p>
          </div>
          {activePlaylist.tracks.length > 1 && (
            <div className="playlist-sort-chips" role="group" aria-label="Sort tracklist">
              {(
                [
                  { id: "default", label: "Default" },
                  { id: "title", label: "Title A–Z" },
                  { id: "artist", label: "Artist" },
                  { id: "duration", label: "Duration" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`queue-vibe-chip ${sortOrder === opt.id ? "active" : ""}`}
                  onClick={() => setSortOrder(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {activePlaylist.tracks.length > 0 ? (
          <div className="recording-list playlist-recording-list">
            {sortedTracks.map(({ track, originalIndex }, displayIndex) => (
              <TrackRow
                key={`${track.id}-${activePlaylist.id}-${originalIndex}`}
                track={track}
                index={displayIndex}
                list={orderedList}
                suffix={activePlaylist.id}
                isCustomPlaylist={activePlaylist.isCustom}
                activePlaylistId={activePlaylist.id}
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
                onRemoveFromPlaylist={(plId) => onRemoveTrackFromPlaylist(plId, originalIndex)}
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
