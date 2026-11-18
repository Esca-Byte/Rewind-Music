"use client";

import { useEffect, useState, type CSSProperties, type PointerEvent } from "react";
import {
  Heart,
  LoaderCircle,
  Maximize2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
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

function beginWindowDrag(event: PointerEvent<HTMLElement>) {
  if (event.button !== 0) return;
  const target = event.target as HTMLElement;
  if (target.closest("button")) return;
  void getCurrentWindow().startDragging().catch(() => {
    // The mini-player can also be previewed in a normal browser window.
  });
}

export function MiniPlayer() {
  const [snapshot, setSnapshot] = useState<MiniPlayerSnapshot | null>(null);
  const [localTheme, setLocalTheme] = useState<AppTheme>(() => {
    if (typeof window === "undefined") return "aurora";
    try {
      return (localStorage.getItem("rewind-app-theme") as AppTheme | null) || "aurora";
    } catch {
      return "aurora";
    }
  });
  useEffect(() => {
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
  const isDark = activeTheme === "aurora" || activeTheme === "midnight" || activeTheme === "cyberpunk";

  const track = snapshot?.track;
  const artworkUrl = track ? getTrackCoverUrl(track) : "";
  const progressPct =
    snapshot && snapshot.duration > 0
      ? Math.min(100, Math.max(0, (snapshot.position / snapshot.duration) * 100))
      : 0;
  const miniPlayerStyle = {
    "--mini-player-artwork": artworkUrl ? `url(${JSON.stringify(artworkUrl)})` : "none",
  } as CSSProperties;

  return (
    <main
      className={`mini-player-window theme-${activeTheme} ${isDark ? "dark-theme" : ""}`}
      style={miniPlayerStyle}
      aria-label="Rewind mini player"
      data-tauri-drag-region
      onPointerDown={beginWindowDrag}
    >
      {/* Top hover HUD: Track info + Heart + Return to main window */}
      <header className="mini-player-hud" data-tauri-drag-region>
        <div className="mini-player-hud-copy" data-tauri-drag-region>
          <strong>{track?.title || "Rewind"}</strong>
          <span>{track?.artist || "Ready to play"}</span>
        </div>
        <div className="mini-player-hud-actions">
          <button
            type="button"
            className={`mini-player-hud-btn ${snapshot?.isSaved ? "saved" : ""}`}
            onClick={() => sendCommand({ command: "toggleFavorite" })}
            disabled={!track}
            aria-label={snapshot?.isSaved ? "Remove favorite" : "Save favorite"}
            title={snapshot?.isSaved ? "Saved" : "Save to collection"}
          >
            <Heart size={13} fill={snapshot?.isSaved ? "currentColor" : "none"} />
          </button>
          <button
            type="button"
            className="mini-player-hud-btn"
            onClick={() => sendCommand({ command: "restoreMain" })}
            aria-label="Return to main window"
            title="Expand to main window"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </header>

      <section className="mini-player-content" data-tauri-drag-region>
        <div
          className="mini-player-artwork-wrap"
          title={track ? `${track.title} — ${track.artist}` : "Nothing playing"}
          aria-label={track ? `${track.title} by ${track.artist}` : "Nothing playing"}
        >
          {track ? (
            <Artwork track={track} className="mini-player-artwork" eager />
          ) : (
            <div className="mini-player-artwork mini-player-artwork-empty">
              <span>R</span>
            </div>
          )}
        </div>
      </section>

      <footer className="mini-player-controls-row">
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
      </footer>

      {/* Hairline live playback progress indicator */}
      <div className="mini-player-progress-bar" aria-hidden="true">
        <i style={{ width: `${progressPct}%` }} />
      </div>
    </main>
  );
}
