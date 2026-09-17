"use client";

import React from "react";
import { AudioLines, X } from "lucide-react";
import { clock, type TimeTrack } from "@/lib/time/types";
import { Artwork } from "@/components/time/album-object";

interface QueueDrawerProps {
  currentTrack: TimeTrack;
  queue: TimeTrack[];
  onClose: () => void;
  onClearQueue: () => void;
  onChooseTrack: (track: TimeTrack, queue: TimeTrack[]) => void;
  onRemoveFromQueue: (index: number) => void;
}

export function QueueDrawer({
  currentTrack,
  queue,
  onClose,
  onClearQueue,
  onChooseTrack,
  onRemoveFromQueue,
}: QueueDrawerProps) {
  return (
    <aside className="queue-window" aria-label="Play queue">
      <div className="section-header">
        <div>
          <h2>Playback Queue</h2>
          <span className="queue-count-badge">{queue.length} songs</span>
        </div>
        <div className="queue-header-actions">
          {queue.length > 1 && (
            <button
              className="quiet-button clear-queue-btn"
              onClick={onClearQueue}
              title="Clear upcoming songs"
            >
              Clear Queue
            </button>
          )}
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close queue"
          >
            <X size={17} />
          </button>
        </div>
      </div>

      <div className="queue-sections">
        <div className="queue-group">
          <span className="queue-subheading">NOW PLAYING</span>
          <div className="queue-record now-playing-record">
            <Artwork track={currentTrack} />
            <div className="queue-item-meta">
              <strong>{currentTrack.title}</strong>
              <small>{currentTrack.artist}</small>
            </div>
            <AudioLines size={17} className="queue-playing-icon" />
          </div>
        </div>

        <div className="queue-group">
          <span className="queue-subheading">UP NEXT</span>
          {queue.length <= 1 ? (
            <p className="queue-empty-note">
              No more songs in queue. Use &quot;Play Next&quot; or &quot;Add to Queue&quot; on any track.
            </p>
          ) : (
            queue.map((track, index) => {
              const isCurrent = track.videoId === currentTrack.videoId;
              return (
                <div
                  key={`${track.id}-${index}`}
                  className={`queue-record ${isCurrent ? "active" : ""}`}
                >
                  <button
                    className="queue-item-main"
                    onClick={() => onChooseTrack(track, queue)}
                  >
                    <Artwork track={track} />
                    <div className="queue-item-meta">
                      <strong>{track.title}</strong>
                      <small>{track.artist}</small>
                    </div>
                    <span className="queue-item-dur">{clock(track.duration)}</span>
                  </button>
                  <button
                    className="icon-button queue-remove-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveFromQueue(index);
                    }}
                    title="Remove from queue"
                    aria-label={`Remove ${track.title} from queue`}
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}
