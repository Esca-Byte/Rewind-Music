"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  LoaderCircle,
  Pause,
  Play,
  SkipBack,
  SkipForward,
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
      {/* A quiet visual stage keeps the widget recognizable without extra text. */}
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

      {/* Minimal transport dock */}
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
    </main>
  );
}
