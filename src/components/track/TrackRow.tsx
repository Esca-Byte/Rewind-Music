"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  AudioLines,
  FolderPlus,
  Heart,
  Info,
  ListPlus,
  MoreHorizontal,
  Play,
  Plus,
  Radio,
  Trash2,
  Users,
} from "lucide-react";
import { clock, type TimeTrack } from "@/lib/time/types";
import { Artwork } from "@/components/time/album-object";
import { prefetchAudioStreamUrl } from "@/lib/tauri-audio";

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
  onStartRadio?: (track: TimeTrack) => void;
  onOpenAddToPlaylist: (track: TimeTrack) => void;
  onToggleFavorite: (track: TimeTrack) => void;
  onDownload: (track: TimeTrack) => void;
  onOpenDetails?: (track: TimeTrack) => void;
  onOpenArtist?: (artist: string) => void;
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
  onStartRadio,
  onOpenAddToPlaylist,
  onToggleFavorite,
  onDownload,
  onOpenDetails,
  onOpenArtist,
  onRemoveFromPlaylist,
}: TrackRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const handlePointerEnter = () => {
    if (!track.videoId || track.filePath) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      prefetchAudioStreamUrl(track.videoId);
    }, 350);
  };

  const handlePointerLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };

  return (
    <div
      className={`recording-row ${isPlayingCurrent ? "current" : ""} ${menuOpen ? "has-open-menu" : ""}`}
      key={`${track.id}-${suffix ?? index}`}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setMenuOpen(true);
      }}
    >
      <button
        type="button"
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

      <div className="recording-identity" onClick={() => onChoose(track, list)} role="button" tabIndex={0} onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onChoose(track, list);
        }
      }}>
        <Artwork track={track} />
        <span>
          <strong>{track.title}</strong>
          {onOpenArtist ? (
            <button
              type="button"
              className="row-artist-link"
              onClick={(event) => {
                event.stopPropagation();
                onOpenArtist(track.artist);
              }}
              title={`Open ${track.artist}`}
            >
              {track.artist}
            </button>
          ) : (
            <small>{track.artist}</small>
          )}
        </span>
      </div>

      <span className="row-album">{track.album}</span>
      <span className="row-year">{track.year ?? "—"}</span>
      <span className="row-length">{clock(track.duration)}</span>

      <div className="row-actions" ref={menuRef}>
        <button
          type="button"
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

        {onStartRadio && (
          <button
            type="button"
            className="icon-button"
            onClick={(e) => {
              e.stopPropagation();
              onStartRadio(track);
            }}
            aria-label={`Start song radio from ${track.title}`}
            title="Start Song Radio"
          >
            <Radio size={15} />
          </button>
        )}

        <div className="row-more-wrap">
          <button
            type="button"
            className={`icon-button ${menuOpen ? "enabled" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((open) => !open);
            }}
            aria-label={`More actions for ${track.title}`}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            title="More actions (or right-click row)"
          >
            <MoreHorizontal size={16} />
          </button>

          {menuOpen && (
            <div className="row-context-menu" role="menu" aria-label={`${track.title} actions`}>
              <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  onPlayNext(track);
                  setMenuOpen(false);
                }}
              >
                <ListPlus size={14} /> Play Next
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToQueue(track);
                  setMenuOpen(false);
                }}
              >
                <Plus size={14} /> Add to Queue
              </button>
              {onStartRadio && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartRadio(track);
                    setMenuOpen(false);
                  }}
                >
                  <Radio size={14} /> Start Song Radio
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenAddToPlaylist(track);
                  setMenuOpen(false);
                }}
              >
                <FolderPlus size={14} /> Add to Playlist
              </button>
              {onOpenArtist && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenArtist(track.artist);
                    setMenuOpen(false);
                  }}
                >
                  <Users size={14} /> Go to Artist
                </button>
              )}
              {onOpenDetails && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDetails(track);
                    setMenuOpen(false);
                  }}
                >
                  <Info size={14} /> Details &amp; Lyrics
                </button>
              )}
              {track.videoId && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownload(track);
                    setMenuOpen(false);
                  }}
                >
                  <ArrowDownToLine size={14} /> Download Offline
                </button>
              )}
              {isCustomPlaylist && activePlaylistId && onRemoveFromPlaylist && (
                <button
                  type="button"
                  role="menuitem"
                  className="is-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveFromPlaylist(activePlaylistId, index);
                    setMenuOpen(false);
                  }}
                >
                  <Trash2 size={14} /> Remove from Playlist
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
