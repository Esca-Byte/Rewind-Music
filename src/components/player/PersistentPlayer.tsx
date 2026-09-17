"use client";

import React, { type CSSProperties } from "react";
import {
  ArrowDownToLine,
  Heart,
  ListMusic,
  LoaderCircle,
  Pause,
  Play,
  Repeat2,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { clock, type TimeTrack } from "@/lib/time/types";
import { Artwork } from "@/components/time/album-object";

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
}: PersistentPlayerProps) {
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
            aria-label={playing ? "Pause playback" : "Play full recording"}
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

        <div className="player-timeline">
          <span>{clock(position)}</span>
          <input
            type="range"
            aria-label="Seek through full recording"
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
