"use client";

import React from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Disc3,
  Download,
  FolderOpen,
  Pause,
  Play,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { TimeTrack } from "@/lib/time/types";
import type { DownloadedSong, View } from "@/types/music";
import {
  isTauriEnvironment,
  openDownloadsFolder,
  deleteDownloadedTrack,
} from "@/lib/tauri-audio";

interface DownloadsViewProps {
  downloadedSongs: DownloadedSong[];
  syncingDownloads: boolean;
  electronDownloadsPath: string;
  isElectron: boolean;
  currentTrackId?: string;
  currentTrackVideoId?: string;
  isPlaying: boolean;
  onNavigate: (view: View) => void;
  onSyncDownloads: (silent?: boolean) => void;
  onTriggerDownload: (track: TimeTrack) => void;
  onChooseTrack: (track: TimeTrack, list: TimeTrack[]) => void;
  onTogglePlay: () => void;
  onClearAllDownloads: () => void;
  onDeleteSingleDownload: (song: DownloadedSong) => void;
  onNotify: (msg: string) => void;
}

export function DownloadsView({
  downloadedSongs,
  syncingDownloads,
  electronDownloadsPath,
  isElectron,
  currentTrackId,
  currentTrackVideoId,
  isPlaying,
  onNavigate,
  onSyncDownloads,
  onTriggerDownload,
  onChooseTrack,
  onTogglePlay,
  onClearAllDownloads,
  onDeleteSingleDownload,
  onNotify,
}: DownloadsViewProps) {
  return (
    <>
      <div className="page-intro">
        <div>
          <p className="overline">OFFLINE MUSIC</p>
          <h1>
            Downloaded Songs<em>.</em>
          </h1>
          <p className="intro-description">
            {downloadedSongs.length === 0
              ? "No downloaded songs yet."
              : `${downloadedSongs.length} song${
                  downloadedSongs.length === 1 ? "" : "s"
                } downloaded for offline listening.`}
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
            <span
              className="folder-path"
              title={electronDownloadsPath || "%USERPROFILE%\\Music\\Rewind Downloads"}
            >
              {electronDownloadsPath ||
                (isElectron
                  ? "Music\\Rewind Downloads"
                  : "Music\\Rewind Downloads (Default folder in Rewind App)")}
            </span>
          </div>
        </div>
        {isElectron ? (
          <div className="folder-banner-actions">
            <button
              type="button"
              className="sync-folder-button"
              onClick={() => void onSyncDownloads(false)}
              title="Scan and synchronize with folder"
              disabled={syncingDownloads}
            >
              <RefreshCw size={13} className={syncingDownloads ? "spin" : ""} />
              {syncingDownloads ? "Scanning..." : "Sync Folder"}
            </button>
            <button
              type="button"
              className="open-folder-button"
              onClick={() => {
                openDownloadsFolder();
                onNotify("Opened Rewind Downloads folder.");
              }}
              title="Open folder in File Explorer"
            >
              <FolderOpen size={15} /> Open Folder
            </button>
          </div>
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
              onClick={onClearAllDownloads}
            >
              <Trash2 size={13} /> Clear All
            </button>
          </div>
          <div className="download-list">
            {downloadedSongs.map((song) => {
              const track: TimeTrack = {
                id: song.id,
                videoId: song.videoId,
                title: song.title,
                artist: song.artist,
                album: song.album || "Rewind Downloads",
                year: song.year ?? null,
                genre: song.genre || "Offline Music",
                duration: song.duration || 180,
                cover:
                  song.cover ||
                  (song.videoId && !song.videoId.startsWith("local-")
                    ? `https://i.ytimg.com/vi/${song.videoId}/hqdefault.jpg`
                    : "/time/palm-sunset.jpg"),
                source: song.filePath ? "local" : "youtube",
                filePath: song.filePath,
              };
              const isCurrent =
                currentTrackId === track.id ||
                (currentTrackVideoId && currentTrackVideoId === track.videoId);
              const fileExt =
                song.fileName?.split(".").pop()?.toUpperCase() ||
                song.filePath?.split(".").pop()?.toUpperCase();
              const fileSizeMb = song.fileSize
                ? `${(song.fileSize / (1024 * 1024)).toFixed(1)} MB`
                : null;

              return (
                <div key={song.id} className="download-item">
                  <button
                    type="button"
                    className="download-play-btn"
                    onClick={() => {
                      if (isCurrent) {
                        onTogglePlay();
                      } else {
                        onChooseTrack(track, [track]);
                      }
                    }}
                    aria-label={`Play ${song.title}`}
                  >
                    {isCurrent && isPlaying ? (
                      <Pause size={17} fill="currentColor" />
                    ) : (
                      <Play size={17} fill="currentColor" />
                    )}
                  </button>
                  <div className="download-meta">
                    <div>
                      <strong>{song.title}</strong>
                      {fileExt && <span className="download-file-badge">{fileExt}</span>}
                      {fileSizeMb && <span className="download-size-badge">{fileSizeMb}</span>}
                    </div>
                    <small>
                      {song.artist}{" "}
                      {song.downloadedAt
                        ? `· Downloaded ${new Date(song.downloadedAt).toLocaleDateString()}`
                        : ""}
                    </small>
                  </div>
                  <div className="download-item-actions">
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => onTriggerDownload(track)}
                      title="Download again"
                      aria-label={`Download ${song.title} again`}
                    >
                      <ArrowDownToLine size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-button delete-download-btn"
                      onClick={() => onDeleteSingleDownload(song)}
                      title="Delete from computer"
                      aria-label={`Delete ${song.title} from computer`}
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
            Browse your playlists or search for songs, then click the download button on any
            track to save it here for offline listening.
          </p>
          <button
            type="button"
            className="primary-button"
            onClick={() => onNavigate("playlists")}
          >
            Browse Playlists <ArrowRight size={15} />
          </button>
        </div>
      )}
    </>
  );
}
