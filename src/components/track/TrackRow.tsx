"use client";

import React from "react";
import { AudioLines, Play, ListPlus, Plus, FolderPlus, Heart, ArrowDownToLine, Trash2 } from "lucide-react";
import { clock, type TimeTrack } from "@/lib/time/types";
import { Artwork } from "@/components/time/album-object";

interface TrackRowProps {
  track: TimeTrack;
  index: number;
  list: TimeTrack[];
  suffix?: string;
  isCustomPlaylist?: boolean;
  activePlaylistId?: string;
  isPlayingCurrent: boolean;
  isPlaying: boolean;
  isSaved: boolean;
  onChoose: (track: TimeTrack, list: TimeTrack[]) => void;
  onPlayNext: (track: TimeTrack) => void;
  onAddToQueue: (track: TimeTrack) => void;
  onOpenAddToPlaylist: (track: TimeTrack) => void;
  onToggleFavorite: (track: TimeTrack) => void;
  onDownload: (track: TimeTrack) => void;
  onRemoveFromPlaylist?: (playlistId: string, index: number) => void;
}

export function TrackRow({
  track,
  index,
  list,
  suffix,
  isCustomPlaylist,
  activePlaylistId,
  isPlayingCurrent,
  isPlaying,
  isSaved,
  onChoose,
  onPlayNext,
  onAddToQueue,
  onOpenAddToPlaylist,
  onToggleFavorite,
  onDownload,
  onRemoveFromPlaylist,
}: TrackRowProps) {
  return (
    <div
      className={`recording-row ${isPlayingCurrent ? "current" : ""}`}
      key={`${track.id}-${suffix ?? index}`}
    >
      <button
        className="row-number"
        onClick={() => onChoose(track, list)}
        aria-label={`${isPlayingCurrent && isPlaying ? "Pause" : "Play"} ${track.title}`}
      >
        <span>{String(index + 1).padStart(2, "0")}</span>
        {isPlayingCurrent && isPlaying ? (
          <AudioLines size={17} />
        ) : (
          <Play size={15} fill="currentColor" />
        )}
      </button>

      <button
        className="recording-identity"
        onClick={() => onChoose(track, list)}
      >
        <Artwork track={track} />
        <span>
          <strong>{track.title}</strong>
          <small>{track.artist}</small>
        </span>
      </button>

      <span className="row-album">{track.album}</span>
      <span className="row-year">{track.year ?? "—"}</span>
      <span className="row-length">{clock(track.duration)}</span>

      <div className="row-actions">
        <button
          type="button"
          className="icon-button"
          onClick={(e) => {
            e.stopPropagation();
            onPlayNext(track);
          }}
          aria-label={`Play ${track.title} next`}
          title="Play next"
        >
          <ListPlus size={16} />
        </button>

        <button
          type="button"
          className="icon-button"
          onClick={(e) => {
            e.stopPropagation();
            onAddToQueue(track);
          }}
          aria-label={`Add ${track.title} to queue`}
          title="Add to queue"
        >
          <Plus size={16} />
        </button>

        <button
          type="button"
          className="icon-button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenAddToPlaylist(track);
          }}
          aria-label={`Add ${track.title} to playlist`}
          title="Add to playlist"
        >
          <FolderPlus size={16} />
        </button>

        <button
          className={`icon-button save-button ${isSaved ? "saved" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(track);
          }}
          aria-label={`${isSaved ? "Remove" : "Save"} ${track.title}`}
          aria-pressed={isSaved}
          title={isSaved ? "Remove from collection" : "Save to collection"}
        >
          <Heart size={16} fill={isSaved ? "currentColor" : "none"} />
        </button>

        {track.videoId && (
          <button
            type="button"
            className="icon-button download-track-btn"
            onClick={(e) => {
              e.stopPropagation();
              onDownload(track);
            }}
            aria-label={`Download ${track.title}`}
            title={`Download audio for ${track.title}`}
          >
            <ArrowDownToLine size={16} />
          </button>
        )}

        {isCustomPlaylist && activePlaylistId && onRemoveFromPlaylist && (
          <button
            type="button"
            className="icon-button delete-download-btn"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveFromPlaylist(activePlaylistId, index);
            }}
            title="Remove from playlist"
            aria-label={`Remove ${track.title} from playlist`}
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
