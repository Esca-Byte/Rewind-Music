"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  Clipboard,
  FolderPlus,
  ListMusic,
  LoaderCircle,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Dialog } from "@/components/common/Dialog";
import { YoutubeIcon } from "@/components/common/YoutubeIcon";
import { clock, type TimeTrack } from "@/lib/time/types";
import { fetchYouTubePlaylist, type ImportedYouTubePlaylist } from "@/lib/tauri-audio";

interface AddPlaylistDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreatePlaylist: (
    title: string,
    description?: string,
    initialTrack?: TimeTrack,
    initialTracks?: TimeTrack[],
    cover?: string,
    youtubeId?: string
  ) => void;
}

export function AddPlaylistDialog({
  isOpen,
  onClose,
  onCreatePlaylist,
}: AddPlaylistDialogProps) {
  const [playlistMode, setPlaylistMode] = useState<"youtube" | "manual">("youtube");
  const [newPlaylistTitle, setNewPlaylistTitle] = useState("");
  const [newPlaylistDesc, setNewPlaylistDesc] = useState("");
  const [youtubePlaylistUrl, setYoutubePlaylistUrl] = useState("");
  const [importingYt, setImportingYt] = useState(false);
  const [importedPreview, setImportedPreview] = useState<ImportedYouTubePlaylist | null>(null);
  const [importError, setImportError] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);

  // Maintain immediate input focus when dialog is opened or mode switched
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      if (playlistMode === "youtube") {
        inputRef.current?.focus();
      } else {
        manualInputRef.current?.focus();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [isOpen, playlistMode]);

  const handleFetch = useCallback(async (urlOrId: string) => {
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
      setImportError(err?.message || "Failed to load YouTube playlist. Please check the URL/ID and try again.");
    } finally {
      setImportingYt(false);
    }
  }, []);

  const handleCloseDialog = useCallback(() => {
    onClose();
    setImportedPreview(null);
    setImportError("");
  }, [onClose]);

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        const val = text.trim();
        setYoutubePlaylistUrl(val);
        if (importError) setImportError("");
        inputRef.current?.focus();
      }
    } catch {
      inputRef.current?.focus();
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog title="Add Playlist" onClose={handleCloseDialog}>
      <div className="playlist-dialog-header">
        <div className="playlist-dialog-icon">
          {playlistMode === "youtube" ? <YoutubeIcon size={28} /> : <ListMusic size={28} />}
        </div>
        <div>
          <p className="overline">YOUR SOUNDTRACKS</p>
          <h2 className="dialog-title">Add Playlist</h2>
          <p className="dialog-subtitle">
            Import any YouTube playlist or create an empty custom collection.
          </p>
        </div>
      </div>

      <div className="playlist-mode-switcher" role="tablist">
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
          <span>Import YouTube Playlist</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={playlistMode === "manual"}
          className={`mode-tab-btn ${playlistMode === "manual" ? "active" : ""}`}
          onClick={() => {
            setPlaylistMode("manual");
            setImportError("");
          }}
        >
          <FolderPlus size={15} />
          <span>Blank Custom Playlist</span>
        </button>
      </div>

      {playlistMode === "youtube" ? (
        <div className="youtube-import-section">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleFetch(youtubePlaylistUrl);
            }}
            className="youtube-url-form"
          >
            <div className="input-group">
              <label htmlFor="yt-url">YouTube Playlist Link or ID</label>
              <div className="yt-input-wrapper">
                <input
                  ref={inputRef}
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
                  onClick={handlePasteClipboard}
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
                    {importedPreview.trackCount} tracks · ~{Math.round(importedPreview.totalDuration / 60)} minutes
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
