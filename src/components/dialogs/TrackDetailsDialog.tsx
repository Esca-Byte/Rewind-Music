"use client";

import React from "react";
import { ArrowDownToLine, Heart, Play } from "lucide-react";
import { Dialog } from "@/components/common/Dialog";
import { AlbumObject } from "@/components/time/album-object";
import { clock, type TimeTrack } from "@/lib/time/types";

interface TrackDetailsDialogProps {
  track: TimeTrack | null;
  isSaved: boolean;
  onClose: () => void;
  onPlay: (track: TimeTrack) => void;
  onToggleFavorite: (track: TimeTrack) => void;
  onDownload: (track: TimeTrack) => void;
}

export function TrackDetailsDialog({
  track,
  isSaved,
  onClose,
  onPlay,
  onToggleFavorite,
  onDownload,
}: TrackDetailsDialogProps) {
  if (!track) return null;

  return (
    <Dialog title={`${track.album} details`} onClose={onClose}>
      <div className="album-detail-art">
        <AlbumObject track={track} format="digital" hero />
      </div>
      <p className="overline">{track.album}</p>
      <h2 className="dialog-title">{track.title}</h2>
      <p className="dialog-subtitle">{track.artist}</p>
      <div className="dialog-track">
        <span>
          <strong>{track.title}</strong>
          <small>Full recording · {clock(track.duration)}</small>
        </span>
        <button
          className="primary-button"
          onClick={() => {
            onPlay(track);
            onClose();
          }}
        >
          <Play size={16} fill="currentColor" />
          Play
        </button>
      </div>
      <div className="dialog-actions-row">
        <button className="text-link" onClick={() => onToggleFavorite(track)}>
          <Heart size={15} fill={isSaved ? "currentColor" : "none"} />
          {isSaved ? "Saved in your collection" : "Save to collection"}
        </button>
        {track.videoId && (
          <button
            type="button"
            className="text-link"
            onClick={() => onDownload(track)}
          >
            <ArrowDownToLine size={15} />
            Download audio (.m4a)
          </button>
        )}
      </div>
    </Dialog>
  );
}
