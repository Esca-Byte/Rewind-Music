"use client";

import React, { useMemo, useState } from "react";
import {
  AudioLines,
  BookmarkPlus,
  Check,
  GripVertical,
  Infinity as InfinityIcon,
  ListPlus,
  LoaderCircle,
  Radio,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { clock, type TimeTrack } from "@/lib/time/types";
import { Artwork } from "@/components/time/album-object";
import { trackIdentityKey } from "@/components/time/use-time-player";
import {
  getSmartQueueMode,
  SMART_QUEUE_MODES,
  type SmartQueueModeId,
} from "@/lib/time/smart-queue";

interface QueueDrawerProps {
  currentTrack: TimeTrack;
  queue: TimeTrack[];
  autoQueuedIds: Set<string>;
  autoQueueEnabled: boolean;
  smartQueueMode: SmartQueueModeId;
  isRefillingAutoQueue: boolean;
  onClose: () => void;
  onClearQueue: () => void;
  onChooseTrack: (track: TimeTrack, queue: TimeTrack[]) => void;
  onPlayNext: (track: TimeTrack) => void;
  onRemoveFromQueue: (index: number) => void;
  onReorderQueue: (fromIndex: number, toIndex: number) => void;
  onToggleAutoQueue: (enabled: boolean) => void;
  onSelectSmartQueueMode: (mode: SmartQueueModeId) => void;
  onStartSongRadio: (track: TimeTrack) => void;
  onRefreshAutoQueue: () => void;
  onSaveQueueAsPlaylist: (title: string, tracks: TimeTrack[]) => void;
}

interface IndexedQueueItem {
  track: TimeTrack;
  index: number;
}

export function QueueDrawer({
  currentTrack,
  queue,
  autoQueuedIds,
  autoQueueEnabled,
  smartQueueMode,
  isRefillingAutoQueue,
  onClose,
  onClearQueue,
  onChooseTrack,
  onPlayNext,
  onRemoveFromQueue,
  onReorderQueue,
  onToggleAutoQueue,
  onSelectSmartQueueMode,
  onStartSongRadio,
  onRefreshAutoQueue,
  onSaveQueueAsPlaylist,
}: QueueDrawerProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState("");

  const activeMode = getSmartQueueMode(smartQueueMode);

  const { explicitUpcoming, autoUpcoming, upcomingCount } = useMemo(() => {
    const activeIndex = queue.findIndex(
      (candidate) =>
        (candidate.videoId && candidate.videoId === currentTrack.videoId) ||
        candidate.id === currentTrack.id
    );
    const startIdx = activeIndex >= 0 ? activeIndex + 1 : 0;

    const explicit: IndexedQueueItem[] = [];
    const auto: IndexedQueueItem[] = [];

    for (let i = startIdx; i < queue.length; i += 1) {
      const item = queue[i];
      if (!item) continue;
      const isCurrent =
        (item.videoId && item.videoId === currentTrack.videoId) ||
        item.id === currentTrack.id;
      if (isCurrent) continue;

      const key = trackIdentityKey(item);
      if (autoQueuedIds.has(key)) {
        auto.push({ track: item, index: i });
      } else {
        explicit.push({ track: item, index: i });
      }
    }

    return {
      explicitUpcoming: explicit,
      autoUpcoming: auto,
      upcomingCount: explicit.length + auto.length,
    };
  }, [queue, currentTrack, autoQueuedIds]);

  const openSaveForm = () => {
    const baseTitle = currentTrack.title.replace(/\s*\([^)]*\)|\s*\[[^\]]*\]/g, "").trim().slice(0, 26);
    setPlaylistName(baseTitle ? `${baseTitle} Radio Mix` : "Rewind Queue Mix");
    setSaveOpen(true);
  };

  const handleSaveSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const cleaned = playlistName.trim() || "Rewind Queue Mix";
    const snapshot = [
      currentTrack,
      ...explicitUpcoming.map((item) => item.track),
      ...autoUpcoming.map((item) => item.track),
    ];
    onSaveQueueAsPlaylist(cleaned, snapshot);
    setSaveOpen(false);
  };

  const renderRow = (entry: IndexedQueueItem, isAuto: boolean) => {
    const { track, index } = entry;
    const isDragged = draggedIndex === index;
    const isDragOver = dragOverIndex === index && draggedIndex !== null && draggedIndex !== index;

    return (
      <div
        key={`${track.id}-${track.videoId}-${index}`}
        className={`queue-record ${isAuto ? "is-auto-queued" : ""} ${isDragged ? "is-dragging" : ""} ${isDragOver ? "is-drag-over" : ""}`}
        draggable
        onDragStart={() => setDraggedIndex(index)}
        onDragEnd={() => {
          setDraggedIndex(null);
          setDragOverIndex(null);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (dragOverIndex !== index) setDragOverIndex(index);
        }}
        onDragLeave={() => {
          if (dragOverIndex === index) setDragOverIndex(null);
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (draggedIndex !== null && draggedIndex !== index) {
            onReorderQueue(draggedIndex, index);
          }
          setDraggedIndex(null);
          setDragOverIndex(null);
        }}
      >
        <span
          className="queue-drag-handle"
          aria-hidden="true"
          title={isAuto ? "Drag up to promote into Up Next" : "Drag to reorder"}
        >
          <GripVertical size={14} />
        </span>
        <button
          type="button"
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
        <div className="queue-item-actions">
          {isAuto && (
            <button
              type="button"
              className="icon-button queue-promote-btn"
              onClick={(event) => {
                event.stopPropagation();
                onPlayNext(track);
              }}
              title="Play next (promote to Up Next)"
              aria-label={`Play ${track.title} next`}
            >
              <ListPlus size={14} />
            </button>
          )}
          <button
            type="button"
            className="icon-button queue-remove-btn"
            onClick={(event) => {
              event.stopPropagation();
              onRemoveFromQueue(index);
            }}
            title="Remove from queue"
            aria-label={`Remove ${track.title} from queue`}
          >
            <X size={14} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <aside className="queue-window smart-queue-drawer" aria-label="Play queue">
      <div className="queue-drawer-top">
        <div className="queue-title-block">
          <h2>Play Queue</h2>
          <span className="queue-count-badge">
            {upcomingCount} up next · {queue.length} total
          </span>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close queue"
        >
          <X size={17} />
        </button>
      </div>

      {/* Echoic-inspired Action Bar */}
      <div className="queue-action-pills" role="toolbar" aria-label="Queue controls">
        <button
          type="button"
          className={`queue-pill-btn ${autoQueueEnabled ? "is-active" : ""}`}
          onClick={() => onToggleAutoQueue(!autoQueueEnabled)}
          aria-pressed={autoQueueEnabled}
          title={autoQueueEnabled ? "Auto-Queue is active (endless playback)" : "Turn on endless Auto-Queue"}
        >
          <InfinityIcon size={13} />
          <span>Auto</span>
        </button>

        <button
          type="button"
          className="queue-pill-btn is-radio"
          onClick={() => onStartSongRadio(currentTrack)}
          title={`Start fresh radio seeded by "${currentTrack.title}"`}
        >
          <Radio size={13} />
          <span>Song Radio</span>
        </button>

        <button
          type="button"
          className={`queue-pill-btn ${saveOpen ? "is-active" : ""}`}
          onClick={() => (saveOpen ? setSaveOpen(false) : openSaveForm())}
          title="Save current queue as a custom playlist"
        >
          <BookmarkPlus size={13} />
          <span>Save</span>
        </button>

        <button
          type="button"
          className="queue-pill-btn"
          onClick={onRefreshAutoQueue}
          disabled={isRefillingAutoQueue}
          title="Generate fresh auto-queued tracks"
        >
          <RefreshCw size={12} className={isRefillingAutoQueue ? "spin" : ""} />
          <span>Refresh</span>
        </button>

        {upcomingCount > 0 && (
          <button
            type="button"
            className="queue-pill-btn is-danger"
            onClick={onClearQueue}
            title="Clear upcoming songs"
          >
            <Trash2 size={12} />
            <span>Clear</span>
          </button>
        )}
      </div>

      {/* Inline Save Queue as Playlist Form */}
      {saveOpen && (
        <form className="queue-save-form" onSubmit={handleSaveSubmit}>
          <input
            type="text"
            value={playlistName}
            onChange={(event) => setPlaylistName(event.target.value)}
            placeholder="Playlist name…"
            maxLength={60}
            autoFocus
            aria-label="New playlist title"
          />
          <button type="submit" className="queue-save-confirm" aria-label="Confirm save queue">
            <Check size={14} />
            Save
          </button>
        </form>
      )}

      {/* Smart Queue Genre & Mood Vibe Selector */}
      <div className="queue-vibe-strip-wrap">
        <div className="queue-vibe-label">
          <span>SMART VIBE</span>
          <small>{activeMode.description}</small>
        </div>
        <div className="queue-vibe-chips" role="tablist" aria-label="Smart queue genre and mood">
          {SMART_QUEUE_MODES.map((mode) => {
            const active = smartQueueMode === mode.id && autoQueueEnabled;
            return (
              <button
                key={mode.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`queue-vibe-chip ${active ? "active" : ""}`}
                onClick={() => onSelectSmartQueueMode(mode.id)}
                title={mode.description}
              >
                {mode.shortLabel}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable Queue Body */}
      <div className="queue-sections">
        <div className="queue-group">
          <span className="queue-subheading">NOW PLAYING</span>
          <div className="queue-record now-playing-record active">
            <Artwork track={currentTrack} />
            <div className="queue-item-meta">
              <strong>{currentTrack.title}</strong>
              <small>
                {currentTrack.artist}
                {currentTrack.genre ? ` · ${currentTrack.genre}` : ""}
              </small>
            </div>
            <AudioLines size={16} className="queue-playing-icon" />
          </div>
        </div>

        {/* Tier 1: Explicit Up Next */}
        <div className="queue-group">
          <div className="queue-group-header">
            <span className="queue-subheading">UP NEXT</span>
            {explicitUpcoming.length > 0 && (
              <span className="queue-tier-count">{explicitUpcoming.length}</span>
            )}
          </div>
          {explicitUpcoming.length === 0 ? (
            <p className="queue-empty-note">
              {autoQueueEnabled
                ? "Your added tracks will appear here ahead of Auto-Queue."
                : "No songs queued. Use Play Next or Add to Queue on any track."}
            </p>
          ) : (
            explicitUpcoming.map((entry) => renderRow(entry, false))
          )}
        </div>

        {/* Tier 2: Auto-Queued Evolving Mix */}
        {(autoQueueEnabled || autoUpcoming.length > 0 || isRefillingAutoQueue) && (
          <div className="queue-group queue-auto-group">
            <div className="queue-auto-divider" role="separator">
              <i />
              <span>
                <InfinityIcon size={12} />
                AUTO-QUEUED · {activeMode.shortLabel.toUpperCase()}
              </span>
              <i />
            </div>

            {autoUpcoming.map((entry) => renderRow(entry, true))}

            {isRefillingAutoQueue && (
              <div className="queue-refilling-row" role="status" aria-live="polite">
                <LoaderCircle size={14} className="spinner" />
                <span>Curating {activeMode.label.toLowerCase()} tracks…</span>
              </div>
            )}

            {!isRefillingAutoQueue && autoUpcoming.length === 0 && autoQueueEnabled && (
              <div className="queue-empty-auto">
                <p>Ready to keep the music flowing when your queue winds down.</p>
                <button
                  type="button"
                  className="queue-pill-btn is-active"
                  onClick={onRefreshAutoQueue}
                >
                  <RefreshCw size={12} /> Fill {activeMode.shortLabel} Mix
                </button>
              </div>
            )}
          </div>
        )}

        {!autoQueueEnabled && autoUpcoming.length === 0 && (
          <div className="queue-auto-off-card">
            <div>
              <strong>Auto-Queue is paused</strong>
              <span>Turn it on for endless genre &amp; vibe-matched playback.</span>
            </div>
            <button
              type="button"
              className="queue-pill-btn is-active"
              onClick={() => onToggleAutoQueue(true)}
            >
              <InfinityIcon size={13} /> Enable
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
