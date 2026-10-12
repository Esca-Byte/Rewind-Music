"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  ExternalLink,
  Heart,
  LoaderCircle,
  Maximize2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { emit, listen } from "@tauri-apps/api/event";
import { Artwork, getTrackCoverUrl } from "@/components/time/album-object";
import {
  MINI_PLAYER_COMMAND_EVENT,
  MINI_PLAYER_READY_EVENT,
  MINI_PLAYER_STATE_EVENT,
  type MiniPlayerCommand,
  type MiniPlayerSnapshot,
} from "@/lib/mini-player";
import type { AppTheme } from "@/types/music";

function sendCommand(command: MiniPlayerCommand) {
  void emit(MINI_PLAYER_COMMAND_EVENT, command);
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

export function MiniPlayer() {
  const [snapshot, setSnapshot] = useState<MiniPlayerSnapshot | null>(null);
  const [localTheme, setLocalTheme] = useState<AppTheme>(() => {
    if (typeof window === "undefined") return "analog";
    try {
      return (localStorage.getItem("rewind-app-theme") as AppTheme | null) || "analog";
    } catch {
      return "analog";
    }
  });
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPosition, setScrubPosition] = useState<number | null>(null);

  useEffect(() => {
    // Ensure document is completely transparent for smooth rounded OS corners
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.overflow = "hidden";

    let unlistenState: (() => void) | undefined;

    const connect = async () => {
      unlistenState = await listen<MiniPlayerSnapshot>(
        MINI_PLAYER_STATE_EVENT,
        ({ payload }) => {
          setSnapshot(payload);
          if (payload.theme) {
            setLocalTheme(payload.theme);
          }
        }
      );
      await emit(MINI_PLAYER_READY_EVENT);
    };

    void connect();
    return () => unlistenState?.();
  }, []);

  const activeTheme = snapshot?.theme || localTheme;
  const isDark = activeTheme === "midnight" || activeTheme === "cyberpunk";

  const track = snapshot?.track;
  const duration = snapshot?.duration || 0;
  const currentPosition =
    isScrubbing && scrubPosition !== null
      ? scrubPosition
      : snapshot?.position || 0;

  const progressPercent = duration > 0
    ? Math.min(100, Math.max(0, (currentPosition / duration) * 100))
    : 0;

  const isFavorited = Boolean(snapshot?.isSaved);
  const isMuted = Boolean(snapshot?.muted);
  const isVolumeZero = snapshot?.volume === 0;
  const artworkUrl = track ? getTrackCoverUrl(track) : "";
  const miniPlayerStyle = {
    "--mini-player-artwork": artworkUrl ? `url(${JSON.stringify(artworkUrl)})` : "none",
  } as CSSProperties;

  return (
    <main
      className={`mini-player-window theme-${activeTheme} ${isDark ? "dark-theme" : ""}`}
      style={miniPlayerStyle}
      aria-label="Rewind mini player"
      data-tauri-drag-region
    >
      {/* Header bar with draggable area, live status badge, and window controls */}
      <header className="mini-player-header" data-tauri-drag-region>
        <div className="mini-player-badge-pill" data-tauri-drag-region>
          <span
            className={`mini-player-pulse-dot ${snapshot?.playing ? "is-playing" : ""}`}
            aria-hidden="true"
          />
          <span className="mini-player-kicker">
            {snapshot?.playing ? "Playing" : "Mini Player"}
          </span>
        </div>

        <div className="mini-player-window-actions">
          <button
            type="button"
            className="mini-player-window-button"
            onClick={() => sendCommand({ command: "restore" })}
            aria-label="Expand to full Rewind player"
            title="Expand to full player"
          >
            <Maximize2 size={12} />
          </button>
          <button
            type="button"
            className="mini-player-window-button close-btn"
            onClick={() => sendCommand({ command: "restore" })}
            aria-label="Restore full Rewind player"
            title="Restore full player"
          >
            <X size={13} />
          </button>
        </div>
      </header>

      {/* Spotify-inspired focus: large square artwork, then a compact now-playing row */}
      <section className="mini-player-content" data-tauri-drag-region>
        <div className="mini-player-artwork-wrap">
          {track ? (
            <Artwork track={track} className="mini-player-artwork" eager />
          ) : (
            <div className="mini-player-artwork mini-player-artwork-empty">
              <span>R</span>
            </div>
          )}
        </div>

        <div className="mini-player-track-row" data-tauri-drag-region>
          <div className="mini-player-copy" data-tauri-drag-region>
            <strong title={track?.title}>{track?.title || "Nothing playing"}</strong>
            <span title={track?.artist}>
              {track?.artist || "Choose a track in Rewind"}
            </span>
            {track?.year && (
              <div className="mini-player-meta-row">
                <span className="mini-player-badge">{track.year}</span>
                {track.genre && (
                  <span className="mini-player-badge">{track.genre}</span>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            className={`mini-player-heart-btn ${isFavorited ? "is-saved" : ""}`}
            onClick={() => sendCommand({ command: "toggleFavorite" })}
            disabled={!track}
            aria-label={isFavorited ? "Remove from collection" : "Save to collection"}
            title={isFavorited ? "In your collection" : "Save to collection"}
          >
            <Heart
              size={16}
              fill={isFavorited ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={isFavorited ? 1 : 2}
            />
          </button>
        </div>
      </section>

      {/* Timeline scrubber with timestamps */}
      <div className="mini-player-timeline" aria-label="Playback timeline">
        <span className="mini-player-time">{formatTime(currentPosition)}</span>

        <div className="mini-player-bar-container">
          <div className="mini-player-track-bg">
            <div
              className="mini-player-track-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <input
            className="mini-player-seek-slider"
            type="range"
            min={0}
            max={duration || 1}
            step={0.5}
            value={Math.min(currentPosition, duration || 1)}
            disabled={!track}
            aria-label="Seek track position"
            onMouseDown={() => setIsScrubbing(true)}
            onTouchStart={() => setIsScrubbing(true)}
            onChange={(e) => {
              const val = Number(e.target.value);
              setScrubPosition(val);
              if (!isScrubbing) {
                sendCommand({ command: "seek", position: val });
              }
            }}
            onMouseUp={(e) => {
              setIsScrubbing(false);
              const val = Number((e.target as HTMLInputElement).value);
              sendCommand({ command: "seek", position: val });
              setScrubPosition(null);
            }}
            onTouchEnd={(e) => {
              setIsScrubbing(false);
              const val = Number((e.target as HTMLInputElement).value);
              sendCommand({ command: "seek", position: val });
              setScrubPosition(null);
            }}
          />
        </div>

        <span className="mini-player-time">{formatTime(duration)}</span>
      </div>

      {/* Bottom controls row */}
      <footer className="mini-player-controls-row">
        <div style={{ width: 26 }} />

        <div className="mini-player-controls-cluster">
          <button
            type="button"
            className="mini-player-control"
            onClick={() => sendCommand({ command: "previous" })}
            disabled={!track}
            aria-label="Previous track"
            title="Previous"
          >
            <SkipBack size={16} fill="currentColor" />
          </button>

          <button
            type="button"
            className="mini-player-play"
            onClick={() => sendCommand({ command: "toggle" })}
            disabled={!track}
            aria-label={snapshot?.playing ? "Pause playback" : "Play playback"}
            title={snapshot?.playing ? "Pause" : "Play"}
          >
            {snapshot?.status === "loading" ? (
              <LoaderCircle size={18} className="spinner" />
            ) : snapshot?.playing ? (
              <Pause size={17} fill="currentColor" />
            ) : (
              <Play size={17} fill="currentColor" style={{ marginLeft: 2 }} />
            )}
          </button>

          <button
            type="button"
            className="mini-player-control"
            onClick={() => sendCommand({ command: "next" })}
            disabled={!track}
            aria-label="Next track"
            title="Next"
          >
            <SkipForward size={16} fill="currentColor" />
          </button>
        </div>

        <div className="mini-player-footer-actions">
          <button
            type="button"
            className={`mini-player-sub-action ${isMuted ? "is-muted" : ""}`}
            onClick={() => sendCommand({ command: "toggleMute" })}
            aria-label={isMuted ? "Unmute playback" : "Mute playback"}
            aria-pressed={Boolean(snapshot?.muted)}
            title={isMuted ? "Unmute playback" : "Mute playback"}
          >
            {isMuted || isVolumeZero ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <button
            type="button"
            className="mini-player-sub-action"
            onClick={() => sendCommand({ command: "restore" })}
            aria-label="Restore full window"
            title="Restore full window"
          >
            <ExternalLink size={13} />
          </button>
        </div>
      </footer>
    </main>
  );
}
