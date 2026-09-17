"use client";

import React from "react";
import { ArrowRight, CalendarDays, Heart, History, Play, X } from "lucide-react";
import { TrackRow } from "@/components/track/TrackRow";
import type { TimeTrack } from "@/lib/time/types";
import type { View } from "@/types/music";

interface LibraryViewProps {
  mode: "collection" | "memories";
  favorites: TimeTrack[];
  history: Array<{ id: string; playedAt: number | string | Date; track: TimeTrack }>;
  memoryDate: string;
  today: string;
  currentTrackVideoId?: string;
  isPlaying: boolean;
  isSaved: (track: TimeTrack) => boolean;
  onSetMemoryDate: (date: string) => void;
  onNavigate: (view: View) => void;
  onChooseTrack: (track: TimeTrack, list: TimeTrack[]) => void;
  onPlayNext: (track: TimeTrack) => void;
  onAddToQueue: (track: TimeTrack) => void;
  onOpenAddToPlaylist: (track: TimeTrack) => void;
  onToggleFavorite: (track: TimeTrack) => void;
  onDownload: (track: TimeTrack) => void;
}

function localDay(value: string | Date | number) {
  const date = typeof value === "string" || typeof value === "number" ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function LibraryView({
  mode,
  favorites,
  history,
  memoryDate,
  today,
  currentTrackVideoId,
  isPlaying,
  isSaved,
  onSetMemoryDate,
  onNavigate,
  onChooseTrack,
  onPlayNext,
  onAddToQueue,
  onOpenAddToPlaylist,
  onToggleFavorite,
  onDownload,
}: LibraryViewProps) {
  if (mode === "collection") {
    return (
      <>
        <div className="page-intro">
          <div>
            <p className="overline">YOUR FAVORITE MUSIC</p>
            <h1>
              Your collection<em>.</em>
            </h1>
            <p className="intro-description">
              {favorites.length} saved songs ready to replay anytime.
            </p>
          </div>
          <Heart size={28} strokeWidth={1.3} />
        </div>

        {favorites.length ? (
          <div className="recording-list collection-list">
            {favorites.map((track, index) => (
              <TrackRow
                key={`${track.id}-${index}`}
                track={track}
                index={index}
                list={favorites}
                isPlayingCurrent={currentTrackVideoId === track.videoId}
                isPlaying={isPlaying}
                isSaved={isSaved(track)}
                onChoose={onChooseTrack}
                onPlayNext={onPlayNext}
                onAddToQueue={onAddToQueue}
                onOpenAddToPlaylist={onOpenAddToPlaylist}
                onToggleFavorite={onToggleFavorite}
                onDownload={onDownload}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Heart size={34} />
            <h2>Make room for your favorites.</h2>
            <p>Click the heart icon on any song to add it to your personal collection.</p>
            <button className="primary-button" onClick={() => onNavigate("playlists")}>
              Browse Playlists <ArrowRight size={15} />
            </button>
          </div>
        )}
      </>
    );
  }

  // mode === "memories"
  const filteredHistory = history.filter(
    (item) => !memoryDate || localDay(item.playedAt) === memoryDate
  );
  const memoryGroups = filteredHistory.reduce<Record<string, typeof filteredHistory>>(
    (groups, item) => {
      const day = localDay(item.playedAt);
      (groups[day] ??= []).push(item);
      return groups;
    },
    {}
  );

  return (
    <>
      <div className="page-intro">
        <div>
          <p className="overline">LISTENING LOG</p>
          <h1>
            Listening history<em>.</em>
          </h1>
          <p className="intro-description">Every song you’ve played in this browser.</p>
        </div>
      </div>

      <div className="memory-date-picker">
        <CalendarDays size={20} />
        <div>
          <strong>Filter by day</strong>
          <span>Pick a date to view past listening</span>
        </div>
        <input
          type="date"
          value={memoryDate}
          max={today || undefined}
          onChange={(event) => onSetMemoryDate(event.target.value)}
          aria-label="Filter memories by date"
        />
        {memoryDate && (
          <button className="quiet-button" onClick={() => onSetMemoryDate("")}>
            All history
            <X size={14} />
          </button>
        )}
      </div>

      {Object.entries(memoryGroups).map(([day, memories]) => (
        <section className="memory-day" key={day}>
          <div className="memory-day-heading">
            <i />
            <h2>
              {new Date(`${day}T12:00:00`).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </h2>
            <span>
              {memories.length} {memories.length === 1 ? "song" : "songs"}
            </span>
          </div>
          <div className="recording-list">
            {memories.map((memory, index) => (
              <TrackRow
                key={`${memory.track.id}-${memory.id}-${index}`}
                track={memory.track}
                index={index}
                list={memories.map((m) => m.track)}
                suffix={memory.id}
                isPlayingCurrent={currentTrackVideoId === memory.track.videoId}
                isPlaying={isPlaying}
                isSaved={isSaved(memory.track)}
                onChoose={onChooseTrack}
                onPlayNext={onPlayNext}
                onAddToQueue={onAddToQueue}
                onOpenAddToPlaylist={onOpenAddToPlaylist}
                onToggleFavorite={onToggleFavorite}
                onDownload={onDownload}
              />
            ))}
          </div>
        </section>
      ))}

      {!filteredHistory.length && (
        <div className="empty-state">
          <History size={34} />
          <h2>{memoryDate ? "No listening on this date." : "Your history starts now."}</h2>
          <p>Songs are recorded here as soon as you press play.</p>
          <button className="primary-button" onClick={() => onNavigate("explore")}>
            Start Listening <Play size={14} fill="currentColor" />
          </button>
        </div>
      )}
    </>
  );
}
