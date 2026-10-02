"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clipboard,
  FolderPlus,
  ListMusic,
  LoaderCircle,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { Dialog } from "@/components/common/Dialog";
import { YoutubeIcon } from "@/components/common/YoutubeIcon";
import { SpotifyIcon } from "@/components/common/SpotifyIcon";
import { clock, type TimeTrack } from "@/lib/time/types";
import {
  fetchYouTubePlaylist,
  fetchSpotifyPlaylist,
  matchTrackToYouTube,
  type ImportedYouTubePlaylist,
} from "@/lib/tauri-audio";
import type { SpotifyPlaylistResult, SpotifyTrackItem } from "@/types/music";

interface AddPlaylistDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreatePlaylist: (
    title: string,
    description?: string,
    initialTrack?: TimeTrack,
    initialTracks?: TimeTrack[],
    cover?: string,
    youtubeId?: string,
    spotifyId?: string
  ) => void;
}

type PlaylistMode = "spotify" | "youtube" | "manual";

interface MatchingState {
  active: boolean;
  currentTrackIndex: number;
  totalTracks: number;
  currentTrackTitle: string;
  currentTrackArtist: string;
  matchedCount: number;
  failedCount: number;
}

export function AddPlaylistDialog({
  isOpen,
  onClose,
  onCreatePlaylist,
}: AddPlaylistDialogProps) {
  const [playlistMode, setPlaylistMode] = useState<PlaylistMode>("spotify");

  // Manual mode state
  const [newPlaylistTitle, setNewPlaylistTitle] = useState("");
  const [newPlaylistDesc, setNewPlaylistDesc] = useState("");

  // YouTube mode state
  const [youtubePlaylistUrl, setYoutubePlaylistUrl] = useState("");
  const [importingYt, setImportingYt] = useState(false);
  const [importedPreview, setImportedPreview] = useState<ImportedYouTubePlaylist | null>(null);
  const [importError, setImportError] = useState("");

  // Spotify mode state
  const [spotifyPlaylistUrl, setSpotifyPlaylistUrl] = useState("");
  const [importingSpotify, setImportingSpotify] = useState(false);
  const [spotifyPreview, setSpotifyPreview] = useState<SpotifyPlaylistResult | null>(null);
  const [spotifyError, setSpotifyError] = useState("");
  const [matchingState, setMatchingState] = useState<MatchingState | null>(null);

  const ytInputRef = useRef<HTMLInputElement>(null);
  const spotifyInputRef = useRef<HTMLInputElement>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const cancelMatchingRef = useRef(false);

  // Maintain immediate focus when dialog is opened or mode switched
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      if (playlistMode === "spotify") {
        spotifyInputRef.current?.focus();
      } else if (playlistMode === "youtube") {
        ytInputRef.current?.focus();
      } else {
        manualInputRef.current?.focus();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [isOpen, playlistMode]);

  // Handle YouTube playlist fetch
  const handleFetchYouTube = useCallback(async (urlOrId: string) => {
    const trimmed = urlOrId.trim();
    if (!trimmed) return;
    setImportingYt(true);
    setImportError("");
    try {
      const pl = await fetchYouTubePlaylist(trimmed);
      setImportedPreview(pl);
      setNewPlaylistTitle(pl.title);
      setNewPlaylistDesc(pl.description || `Imported YouTube playlist with ${pl.trackCount} tracks`);
    } catch (err: any) {
      setImportError(
        err?.message || "Failed to load YouTube playlist. Please check the URL/ID and try again."
      );
    } finally {
      setImportingYt(false);
    }
  }, []);

  // Handle Spotify playlist fetch
  const handleFetchSpotify = useCallback(async (urlOrId: string) => {
    const trimmed = urlOrId.trim();
    if (!trimmed) return;
    setImportingSpotify(true);
    setSpotifyError("");
    setSpotifyPreview(null);
    setMatchingState(null);
    try {
      const pl = await fetchSpotifyPlaylist(trimmed);
      setSpotifyPreview(pl);
      setNewPlaylistTitle(pl.title);
      setNewPlaylistDesc(pl.description || `Imported Spotify playlist with ${pl.trackCount} tracks`);
    } catch (err: any) {
      setSpotifyError(
        err?.message ||
          "Failed to load Spotify playlist. Please ensure the link is public and try again."
      );
    } finally {
      setImportingSpotify(false);
    }
  }, []);

  // Handle matching Spotify tracks to YouTube
  const handleMatchAndImportSpotify = useCallback(async () => {
    if (!spotifyPreview || !spotifyPreview.tracks.length) return;

    cancelMatchingRef.current = false;
    const total = spotifyPreview.tracks.length;
    const tracksToMatch = spotifyPreview.tracks;

    setMatchingState({
      active: true,
      currentTrackIndex: 0,
      totalTracks: total,
      currentTrackTitle: tracksToMatch[0]?.title || "",
      currentTrackArtist: tracksToMatch[0]?.artist || "",
      matchedCount: 0,
      failedCount: 0,
    });

    const matchedTracks: (TimeTrack | null)[] = new Array(total).fill(null);
    let completed = 0;
    let successfulCount = 0;
    let failedCount = 0;
    let nextIndex = 0;
    const CONCURRENCY = 3;

    async function worker() {
      while (nextIndex < total && !cancelMatchingRef.current) {
        const idx = nextIndex++;
        const item = tracksToMatch[idx];

        setMatchingState({
          active: true,
          currentTrackIndex: completed + 1,
          totalTracks: total,
          currentTrackTitle: item.title,
          currentTrackArtist: item.artist,
          matchedCount: successfulCount,
          failedCount,
        });

        try {
          const matched = await matchTrackToYouTube(item.artist, item.title);
          if (matched && matched.videoId) {
            matchedTracks[idx] = {
              id: `sp-${matched.videoId}`,
              videoId: matched.videoId,
              title: item.title,
              artist: item.artist,
              album: spotifyPreview?.title || "Spotify Import",
              genre: "Spotify Import",
              year: 2026,
              duration: matched.duration || item.duration || 180,
              cover:
                matched.cover ||
                spotifyPreview?.cover ||
                `https://i.ytimg.com/vi/${matched.videoId}/hqdefault.jpg`,
              source: "youtube",
            };
            successfulCount++;
          } else {
            failedCount++;
          }
        } catch {
          failedCount++;
        } finally {
          completed++;
          setMatchingState((prev) =>
            prev
              ? {
                  ...prev,
                  currentTrackIndex: Math.min(completed, total),
                  matchedCount: successfulCount,
                  failedCount,
                }
              : null
          );
        }
      }
    }

    const workers = Array.from(
      { length: Math.min(CONCURRENCY, total) },
      () => worker()
    );

    await Promise.all(workers);

    const finalMatched = matchedTracks.filter((t): t is TimeTrack => t !== null);

    if (finalMatched.length > 0) {
      onCreatePlaylist(
        spotifyPreview.title,
        spotifyPreview.description,
        undefined,
        finalMatched,
        spotifyPreview.cover,
        undefined,
        spotifyPreview.spotifyId
      );
      handleCloseDialog();
    } else {
      setSpotifyError("Could not match any tracks to playable YouTube audio. Please try again.");
      setMatchingState(null);
    }
  }, [spotifyPreview, onCreatePlaylist]);

  const handleCancelMatching = () => {
    cancelMatchingRef.current = true;
    setMatchingState(null);
  };

  const handleCloseDialog = useCallback(() => {
    cancelMatchingRef.current = true;
    onClose();
    setImportedPreview(null);
    setSpotifyPreview(null);
    setMatchingState(null);
    setImportError("");
    setSpotifyError("");
  }, [onClose]);

  const handlePasteClipboard = async (target: "youtube" | "spotify") => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        const val = text.trim();
        if (target === "youtube") {
          setYoutubePlaylistUrl(val);
          if (importError) setImportError("");
          ytInputRef.current?.focus();
        } else {
          setSpotifyPlaylistUrl(val);
          if (spotifyError) setSpotifyError("");
          spotifyInputRef.current?.focus();
        }
      }
    } catch {
      if (target === "youtube") {
        ytInputRef.current?.focus();
      } else {
        spotifyInputRef.current?.focus();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog title="Add Playlist" onClose={handleCloseDialog}>
      <div className="playlist-dialog-header">
        <div className={`playlist-dialog-icon ${playlistMode === "spotify" ? "spotify-icon-container" : ""}`}>
          {playlistMode === "spotify" ? (
            <SpotifyIcon size={28} className="spotify-dialog-svg" />
          ) : playlistMode === "youtube" ? (
            <YoutubeIcon size={28} />
          ) : (
            <ListMusic size={28} />
          )}
        </div>
        <div>
          <p className="overline">YOUR SOUNDTRACKS</p>
          <h2 className="dialog-title">
            {playlistMode === "spotify"
              ? "Import Spotify Playlist"
              : playlistMode === "youtube"
              ? "Import YouTube Playlist"
              : "New Custom Playlist"}
          </h2>
          <p className="dialog-subtitle">
            {playlistMode === "spotify"
              ? "Paste any Spotify playlist link. We'll find each track on YouTube for full offline streaming."
              : playlistMode === "youtube"
              ? "Import any YouTube playlist or mix directly into Rewind."
              : "Create an empty custom collection and curate your favorite songs."}
          </p>
        </div>
      </div>

      <div className="playlist-mode-switcher" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={playlistMode === "spotify"}
          className={`mode-tab-btn spotify-tab ${playlistMode === "spotify" ? "active" : ""}`}
          onClick={() => {
            setPlaylistMode("spotify");
            setSpotifyError("");
            setMatchingState(null);
          }}
        >
          <SpotifyIcon size={15} />
          <span>Spotify Playlist</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={playlistMode === "youtube"}
          className={`mode-tab-btn ${playlistMode === "youtube" ? "active" : ""}`}
          onClick={() => {
            setPlaylistMode("youtube");
            setImportError("");
          }}
        >
          <YoutubeIcon size={15} />
          <span>YouTube Playlist</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={playlistMode === "manual"}
          className={`mode-tab-btn ${playlistMode === "manual" ? "active" : ""}`}
          onClick={() => {
            setPlaylistMode("manual");
            setImportError("");
            setSpotifyError("");
          }}
        >
          <FolderPlus size={15} />
          <span>Blank Playlist</span>
        </button>
      </div>

      {playlistMode === "spotify" ? (
        <div className="youtube-import-section">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleFetchSpotify(spotifyPlaylistUrl);
            }}
            className="youtube-url-form"
          >
            <div className="input-group">
              <label htmlFor="spotify-url">Spotify Playlist Link or ID</label>
              <div className="yt-input-wrapper">
                <input
                  ref={spotifyInputRef}
                  id="spotify-url"
                  type="text"
                  autoFocus
                  disabled={matchingState?.active}
                  placeholder="e.g. https://open.spotify.com/playlist/... or 37i9dQZF1DXcBWIGoYBM5M"
                  value={spotifyPlaylistUrl}
                  onChange={(e) => {
                    setSpotifyPlaylistUrl(e.target.value);
                    if (spotifyError) setSpotifyError("");
                  }}
                  required
                />
                <button
                  type="button"
                  className="quiet-button yt-paste-btn"
                  onClick={() => void handlePasteClipboard("spotify")}
                  disabled={matchingState?.active}
                  title="Paste link from clipboard"
                >
                  <Clipboard size={14} />
                  <span>Paste</span>
                </button>
                <button
                  type="submit"
                  className="primary-button yt-fetch-btn spotify-action-btn"
                  disabled={importingSpotify || matchingState?.active || !spotifyPlaylistUrl.trim()}
                >
                  {importingSpotify ? (
                    <LoaderCircle size={15} className="spinner" />
                  ) : (
                    <Search size={15} />
                  )}
                  {importingSpotify ? "Loading..." : "Inspect"}
                </button>
              </div>
              <span className="input-hint">
                Supports all public Spotify playlist links. Rewind will match every track with its full audio stream.
              </span>
            </div>
          </form>

          {spotifyError && (
            <div className="import-error-banner" role="alert">
              <AlertCircle size={15} />
              <span>{spotifyError}</span>
            </div>
          )}

          {/* SPOTIFY MATCHING PROGRESS MODAL / OVERLAY */}
          {matchingState && matchingState.active && (
            <div className="spotify-matching-card">
              <div className="matching-header">
                <div className="matching-spinner-badge">
                  <LoaderCircle size={18} className="spinner text-spotify" />
                </div>
                <div className="matching-meta">
                  <h4>Matching Tracks with YouTube...</h4>
                  <p>
                    Matching {matchingState.currentTrackIndex} of {matchingState.totalTracks} (
                    {Math.round(
                      (matchingState.currentTrackIndex / matchingState.totalTracks) * 100
                    )}
                    %)
                  </p>
                </div>
              </div>

              <div className="matching-progress-track">
                <div
                  className="matching-progress-bar"
                  style={{
                    width: `${Math.round(
                      (matchingState.currentTrackIndex / matchingState.totalTracks) * 100
                    )}%`,
                  }}
                />
              </div>

              <div className="matching-current-song">
                <span className="current-song-label">SEARCHING:</span>
                <span className="current-song-title">
                  {matchingState.currentTrackArtist} – {matchingState.currentTrackTitle}
                </span>
              </div>

              <div className="matching-stats-row">
                <span className="stat-matched">
                  <CheckCircle2 size={13} /> {matchingState.matchedCount} songs matched
                </span>
                {matchingState.failedCount > 0 && (
                  <span className="stat-skipped">
                    {matchingState.failedCount} skipped
                  </span>
                )}
                <button
                  type="button"
                  className="quiet-button cancel-matching-btn"
                  onClick={handleCancelMatching}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* SPOTIFY PREVIEW CARD */}
          {spotifyPreview && !matchingState?.active && (
            <div className="imported-preview-card spotify-preview-card">
              <div className="preview-card-header">
                <div className="preview-cover spotify-cover-art">
                  <img src={spotifyPreview.cover} alt={spotifyPreview.title} />
                </div>
                <div className="preview-meta">
                  <span className="preview-badge spotify-badge">
                    <SpotifyIcon size={11} className="badge-spotify-icon" /> SPOTIFY PLAYLIST READY
                  </span>
                  <h3>{spotifyPreview.title}</h3>
                  <p>
                    {spotifyPreview.trackCount} tracks · ~
                    {Math.round(spotifyPreview.totalDuration / 60)} minutes
                  </p>
                  {spotifyPreview.description && (
                    <small className="preview-desc-text">{spotifyPreview.description}</small>
                  )}
                </div>
              </div>

              <div className="preview-tracks-peek">
                <span className="peek-label">TRACKLIST PREVIEW</span>
                <div className="peek-tracks-list">
                  {spotifyPreview.tracks.slice(0, 5).map((track, i) => (
                    <div key={track.id} className="peek-track-row">
                      <span className="peek-idx">{String(i + 1).padStart(2, "0")}</span>
                      {spotifyPreview.cover ? (
                        <img src={spotifyPreview.cover} alt={track.title} className="peek-art" />
                      ) : (
                        <div className="peek-art-placeholder" />
                      )}
                      <div className="peek-info">
                        <strong>{track.title}</strong>
                        <small>{track.artist}</small>
                      </div>
                      <span className="peek-dur">{clock(track.duration)}</span>
                    </div>
                  ))}
                  {spotifyPreview.tracks.length > 5 && (
                    <div className="peek-more-hint">
                      + {spotifyPreview.tracks.length - 5} more tracks to match & import
                    </div>
                  )}
                </div>
              </div>

              <div className="dialog-footer-actions">
                <button
                  type="button"
                  className="quiet-button"
                  onClick={() => {
                    setSpotifyPreview(null);
                    setSpotifyPlaylistUrl("");
                  }}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="primary-button spotify-import-confirm-btn"
                  onClick={() => void handleMatchAndImportSpotify()}
                >
                  <Sparkles size={16} />
                  Match & Import ({spotifyPreview.trackCount} tracks)
                </button>
              </div>
            </div>
          )}
        </div>
      ) : playlistMode === "youtube" ? (
        <div className="youtube-import-section">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleFetchYouTube(youtubePlaylistUrl);
            }}
            className="youtube-url-form"
          >
            <div className="input-group">
              <label htmlFor="yt-url">YouTube Playlist Link or ID</label>
              <div className="yt-input-wrapper">
                <input
                  ref={ytInputRef}
                  id="yt-url"
                  type="text"
                  autoFocus
                  placeholder="e.g. https://www.youtube.com/playlist?list=PL... or PL..."
                  value={youtubePlaylistUrl}
                  onChange={(e) => {
                    setYoutubePlaylistUrl(e.target.value);
                    if (importError) setImportError("");
                  }}
                  required
                />
                <button
                  type="button"
                  className="quiet-button yt-paste-btn"
                  onClick={() => void handlePasteClipboard("youtube")}
                  title="Paste link from clipboard"
                >
                  <Clipboard size={14} />
                  <span>Paste</span>
                </button>
                <button
                  type="submit"
                  className="primary-button yt-fetch-btn"
                  disabled={importingYt || !youtubePlaylistUrl.trim()}
                >
                  {importingYt ? (
                    <LoaderCircle size={15} className="spinner" />
                  ) : (
                    <Search size={15} />
                  )}
                  {importingYt ? "Loading..." : "Inspect"}
                </button>
              </div>
              <span className="input-hint">
                Paste any YouTube music playlist URL to import all its full recordings into Rewind.
              </span>
            </div>
          </form>

          {importError && (
            <div className="import-error-banner" role="alert">
              <X size={15} />
              <span>{importError}</span>
            </div>
          )}

          {importedPreview && (
            <div className="imported-preview-card">
              <div className="preview-card-header">
                <div className="preview-cover">
                  <img src={importedPreview.cover} alt={importedPreview.title} />
                </div>
                <div className="preview-meta">
                  <span className="preview-badge">YOUTUBE PLAYLIST READY</span>
                  <h3>{importedPreview.title}</h3>
                  <p>
                    {importedPreview.trackCount} tracks · ~
                    {Math.round(importedPreview.totalDuration / 60)} minutes
                  </p>
                </div>
              </div>

              <div className="preview-tracks-peek">
                <span className="peek-label">TRACKLIST PREVIEW</span>
                <div className="peek-tracks-list">
                  {importedPreview.tracks.slice(0, 5).map((track, i) => (
                    <div key={track.id} className="peek-track-row">
                      <span className="peek-idx">{String(i + 1).padStart(2, "0")}</span>
                      <img src={track.cover} alt={track.title} className="peek-art" />
                      <div className="peek-info">
                        <strong>{track.title}</strong>
                        <small>{track.artist}</small>
                      </div>
                      <span className="peek-dur">{clock(track.duration)}</span>
                    </div>
                  ))}
                  {importedPreview.tracks.length > 5 && (
                    <div className="peek-more-hint">
                      + {importedPreview.tracks.length - 5} more tracks ready to import
                    </div>
                  )}
                </div>
              </div>

              <div className="dialog-footer-actions">
                <button
                  type="button"
                  className="quiet-button"
                  onClick={() => {
                    setImportedPreview(null);
                    setYoutubePlaylistUrl("");
                  }}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    onCreatePlaylist(
                      importedPreview.title,
                      importedPreview.description,
                      undefined,
                      importedPreview.tracks,
                      importedPreview.cover,
                      importedPreview.youtubeId
                    );
                    handleCloseDialog();
                  }}
                >
                  <Plus size={16} />
                  Import to Rewind ({importedPreview.trackCount} songs)
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onCreatePlaylist(newPlaylistTitle, newPlaylistDesc);
            setNewPlaylistTitle("");
            setNewPlaylistDesc("");
            handleCloseDialog();
          }}
          className="new-playlist-form"
        >
          <div className="input-group">
            <label htmlFor="pl-name">Playlist Name</label>
            <input
              ref={manualInputRef}
              id="pl-name"
              type="text"
              autoFocus
              placeholder="e.g. Late Night Lo-Fi, Workout Energy..."
              value={newPlaylistTitle}
              onChange={(e) => setNewPlaylistTitle(e.target.value)}
              required
            />
          </div>
          <div className="input-group">
            <label htmlFor="pl-desc">Description (optional)</label>
            <input
              id="pl-desc"
              type="text"
              placeholder="Give your playlist a vibe or summary"
              value={newPlaylistDesc}
              onChange={(e) => setNewPlaylistDesc(e.target.value)}
            />
          </div>
          <div className="dialog-footer-actions">
            <button type="button" className="quiet-button" onClick={handleCloseDialog}>
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={!newPlaylistTitle.trim()}
            >
              Create Blank Playlist
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
