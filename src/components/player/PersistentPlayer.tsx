"use client";

import React, { type CSSProperties } from "react";
import {
  ArrowDownToLine,
  Clock3,
  Heart,
  ListMusic,
  LoaderCircle,
  Moon,
  Pause,
  Play,
  Repeat2,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import { clock, type TimeTrack } from "@/lib/time/types";
import { Artwork } from "@/components/time/album-object";
import type { SleepTimerMinutes } from "@/components/time/use-sleep-timer";

interface PersistentPlayerProps {
  track: TimeTrack;
  playing: boolean;
  status: "idle" | "loading" | "playing" | "paused" | "error";
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: boolean;
  isSaved: boolean;
  queueOpen: boolean;
  onTogglePlay: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (position: number) => void;
  onSetVolume: (vol: number) => void;
  onSetMuted: (muted: boolean) => void;
  onSetShuffle: (shuffle: boolean) => void;
  onSetRepeat: (repeat: boolean) => void;
  onToggleFavorite: (track: TimeTrack) => void;
  onDownload: (track: TimeTrack) => void;
  onOpenDetails: (track: TimeTrack) => void;
  onToggleQueue: () => void;
  similarTrackCount: number;
  onPlaySimilar: () => void;
  sleepTimerActive: boolean;
  sleepTimerRemainingSeconds: number;
  sleepTimerDurations: readonly SleepTimerMinutes[];
  onStartSleepTimer: (minutes: SleepTimerMinutes) => void;
  onCancelSleepTimer: () => void;
}

export function PersistentPlayer({
  track,
  playing,
  status,
  position,
  duration,
  volume,
  muted,
  shuffle,
  repeat,
  isSaved,
  queueOpen,
  onTogglePlay,
  onPrevious,
  onNext,
  onSeek,
  onSetVolume,
  onSetMuted,
  onSetShuffle,
  onSetRepeat,
  onToggleFavorite,
  onDownload,
  onOpenDetails,
  onToggleQueue,
  similarTrackCount,
  onPlaySimilar,
  sleepTimerActive,
  sleepTimerRemainingSeconds,
  sleepTimerDurations,
  onStartSleepTimer,
  onCancelSleepTimer,
}: PersistentPlayerProps) {
  const [sleepMenuOpen, setSleepMenuOpen] = React.useState(false);
  const sleepTimerControlRef = React.useRef<HTMLDivElement>(null);
  const sleepClock = `${Math.floor(sleepTimerRemainingSeconds / 60)}:${String(
    sleepTimerRemainingSeconds % 60
  ).padStart(2, "0")}`;

  React.useEffect(() => {
    if (!sleepMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!sleepTimerControlRef.current?.contains(event.target as Node)) {
        setSleepMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSleepMenuOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [sleepMenuOpen]);

  return (
    <section className="persistent-player" aria-label="Music player">
      <div className="player-current">
        <button
          className="player-artwork"
          onClick={() => onOpenDetails(track)}
          aria-label="View current album"
        >
          <Artwork track={track} eager />
        </button>
        <div>
          <strong>{track.title}</strong>
          <span>{track.artist}</span>
        </div>
        <div className="player-current-actions">
          <button
            className={`icon-button player-save ${isSaved ? "saved" : ""}`}
            onClick={() => onToggleFavorite(track)}
            aria-label={`${isSaved ? "Remove" : "Save"} current song`}
            title={isSaved ? "Remove from collection" : "Save to collection"}
          >
            <Heart size={17} fill={isSaved ? "currentColor" : "none"} />
          </button>
          {track.videoId && (
            <button
              type="button"
              className="icon-button player-download-btn"
              onClick={() => onDownload(track)}
              aria-label={`Download ${track.title}`}
              title={`Download audio for ${track.title}`}
            >
              <ArrowDownToLine size={17} />
            </button>
          )}
        </div>
      </div>

      <div className="player-center">
        <div className="player-transport">
          <button
            className={`icon-button ${shuffle ? "enabled" : ""}`}
            onClick={() => onSetShuffle(!shuffle)}
            aria-label="Shuffle"
            aria-pressed={shuffle}
          >
            <Shuffle size={16} />
          </button>
          <button
            className="icon-button"
            onClick={onPrevious}
            aria-label="Previous track"
          >
            <SkipBack size={19} fill="currentColor" />
          </button>
          <button
            className="main-play-button"
            onClick={onTogglePlay}
             aria-label={playing ? "Pause playback" : "Play current track"}
          >
            {status === "loading" ? (
              <LoaderCircle size={21} className="spinner" />
            ) : playing ? (
              <Pause size={20} fill="currentColor" />
            ) : (
              <Play size={20} fill="currentColor" />
            )}
          </button>
          <button
            className="icon-button"
            onClick={onNext}
            aria-label="Next track"
          >
            <SkipForward size={19} fill="currentColor" />
          </button>
          <button
            className={`icon-button ${repeat ? "enabled" : ""}`}
            onClick={() => onSetRepeat(!repeat)}
            aria-label="Repeat track"
            aria-pressed={repeat}
          >
            <Repeat2 size={17} />
          </button>
        </div>

        <div className={`player-visualizer ${playing ? "is-active" : ""}`} aria-label={playing ? "Audio visualizer active" : "Audio visualizer paused"}>
          {[1, 2, 3, 4, 5, 6, 7].map((bar) => <i key={bar} style={{ "--bar-delay": `${bar * 0.08}s` } as React.CSSProperties} />)}
        </div>

        <div className="player-timeline">
          <span>{clock(position)}</span>
          <input
            type="range"
             aria-label="Seek through current track"
            min={0}
            max={duration || 1}
            value={Math.min(position, duration || 1)}
            disabled={!track}
            onChange={(event) => onSeek(Number(event.target.value))}
            style={
              {
                "--played": `${duration ? (position / duration) * 100 : 0}%`,
              } as CSSProperties
            }
          />
          <span>{clock(duration)}</span>
        </div>
      </div>

      <div className="player-extra">
        <span className="source-label">
          <i />
          FULL TRACK
        </span>
        <button
          className={`icon-button ${queueOpen ? "enabled" : ""}`}
          onClick={onToggleQueue}
          aria-label="Toggle play queue"
          aria-expanded={queueOpen}
          title="Play Queue"
        >
          <ListMusic size={19} />
        </button>
        <button
          className={`icon-button ${similarTrackCount ? "enabled" : ""}`}
          onClick={onPlaySimilar}
          aria-label="Play similar tracks"
          title={`Play similar tracks${similarTrackCount ? ` (${similarTrackCount})` : ""}`}
        >
          <Sparkles size={17} />
        </button>
        <div className="sleep-timer-control" ref={sleepTimerControlRef}>
          <button
            type="button"
            className={`icon-button ${sleepTimerActive ? "enabled" : ""}`}
            onClick={() => setSleepMenuOpen((open) => !open)}
            aria-label={sleepTimerActive ? `Sleep timer ${sleepClock} remaining` : "Set sleep timer"}
            aria-expanded={sleepMenuOpen}
            aria-controls="sleep-timer-options"
            aria-haspopup="dialog"
            title="Sleep timer"
          >
            {sleepTimerActive ? <Clock3 size={18} /> : <Moon size={17} />}
          </button>
          {sleepMenuOpen && (
            <div
              id="sleep-timer-options"
              className="sleep-timer-menu"
              role="dialog"
              aria-label="Sleep timer options"
            >
              <strong aria-live="polite">
                {sleepTimerActive ? `Stops in ${sleepClock}` : "Sleep timer"}
              </strong>
              {sleepTimerDurations.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => {
                    onStartSleepTimer(minutes);
                    setSleepMenuOpen(false);
                  }}
                >
                  {minutes} minutes
                </button>
              ))}
              {sleepTimerActive && (
                <button
                  type="button"
                  className="sleep-timer-cancel"
                  onClick={() => {
                    onCancelSleepTimer();
                    setSleepMenuOpen(false);
                  }}
                >
                  Cancel timer
                </button>
              )}
            </div>
          )}
        </div>
        <div className="player-volume">
          <button
            className="icon-button"
            onClick={() => onSetMuted(!muted)}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <input
            type="range"
            aria-label="Playback volume"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(event) => {
              onSetMuted(false);
              onSetVolume(Number(event.target.value));
            }}
          />
        </div>
      </div>
    </section>
  );
}
