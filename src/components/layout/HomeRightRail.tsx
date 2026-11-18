"use client";

import React, { useMemo } from "react";
import {
  AudioLines,
  ChevronRight,
  Heart,
  Infinity as InfinityIcon,
  ListMusic,
  Play,
  Radio,
  ScrollText,
  Users,
} from "lucide-react";
import { Artwork, getTrackCoverUrl } from "@/components/time/album-object";
import { clock, type TimeTrack } from "@/lib/time/types";
import type { Playlist } from "@/lib/time/playlists";
import type { View } from "@/types/music";

type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";

interface HomeRightRailProps {
  allTracks: TimeTrack[];
  currentTrack: TimeTrack;
  queue: TimeTrack[];
  autoQueuedIds: Set<string>;
  autoQueueEnabled: boolean;
  playerStatus: PlayerStatus;
  isPlaying: boolean;
  position: number;
  duration: number;
  isSaved: boolean;
  featuredPlaylist?: Playlist;
  onChooseTrack: (track: TimeTrack, list: TimeTrack[]) => void;
  onSeek: (seconds: number) => void;
  onToggleFavorite: (track: TimeTrack) => void;
  onOpenQueue: () => void;
  onOpenLyrics: () => void;
  onStartRadio: (track: TimeTrack) => void;
  onOpenArtist: (artist: string) => void;
  onNavigate: (view: View) => void;
  onPlayPlaylist: (playlist: { title: string; tracks: TimeTrack[] }, shuffle?: boolean) => void;
}

export function HomeRightRail({
  allTracks,
  currentTrack,
  queue,
  autoQueuedIds,
  autoQueueEnabled,
  playerStatus,
  isPlaying,
  position,
  duration,
  isSaved,
  featuredPlaylist,
  onChooseTrack,
  onSeek,
  onToggleFavorite,
  onOpenQueue,
  onOpenLyrics,
  onStartRadio,
  onOpenArtist,
  onNavigate,
  onPlayPlaylist,
}: HomeRightRailProps) {
  const artists = useMemo(() => {
    const grouped = new Map<string, { name: string; count: number; track: TimeTrack }>();
    allTracks.forEach((track) => {
      const existing = grouped.get(track.artist);
      if (existing) {
        existing.count += 1;
      } else {
        grouped.set(track.artist, { name: track.artist, count: 1, track });
      }
    });
    return Array.from(grouped.values())
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
      .slice(0, 5);
  }, [allTracks]);

  const upcomingTracks = useMemo(() => {
    const activeIndex = queue.findIndex(
      (candidate) =>
        (candidate.videoId && candidate.videoId === currentTrack.videoId) ||
        candidate.id === currentTrack.id
    );
    const start = activeIndex >= 0 ? activeIndex + 1 : 1;
    return queue.slice(start, start + 4);
  }, [queue, currentTrack]);

  const progress = duration > 0 ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0;
  const readyTrack = currentTrack || allTracks[0];
  const isReady = playerStatus !== "idle";

  return (
    <aside className="home-right-rail" aria-label="Home listening sidebar">
      {/* Live Now Playing & Up Next Queue Panel (no duplicated transport bar!) */}
      <section className="home-rail-panel now-playing-panel">
        <div className="home-rail-heading">
          <h2><ListMusic size={17} /> Live Queue</h2>
          <span className={`home-playing-light ${isPlaying ? "active" : ""}`} />
        </div>

        {readyTrack ? (
          <>
            <div className="home-rail-current">
              <div className="home-rail-current-artwork">
                <Artwork track={readyTrack} eager />
                {!isReady && <span className="home-rail-ready-label">READY</span>}
              </div>
              <div className="home-rail-current-copy">
                <strong title={readyTrack.title}>{readyTrack.title.replace(/\s+(Official|MV|M\/V).*$/i, "")}</strong>
                <button
                  type="button"
                  className="home-rail-artist-btn"
                  onClick={() => onOpenArtist(readyTrack.artist)}
                  title={`Open ${readyTrack.artist}`}
                >
                  {readyTrack.artist}
                </button>
              </div>
              <button
                type="button"
                className={`home-rail-heart ${isSaved ? "saved" : ""}`}
                onClick={() => onToggleFavorite(readyTrack)}
                aria-label={isSaved ? "Remove from collection" : "Save current track"}
              >
                <Heart size={17} fill={isSaved ? "currentColor" : "none"} />
              </button>
            </div>

            <div
              className="home-rail-progress is-interactive"
              role="slider"
              tabIndex={0}
              aria-label="Seek playback progress"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration || 0)}
              aria-valuenow={Math.round(position)}
              onClick={(event) => {
                if (!duration) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
                onSeek(ratio * duration);
              }}
              onKeyDown={(event) => {
                if (!duration) return;
                if (event.key === "ArrowRight") onSeek(Math.min(duration, position + 5));
                else if (event.key === "ArrowLeft") onSeek(Math.max(0, position - 5));
              }}
            >
              <i style={{ width: `${progress}%` }} />
            </div>
            <div className="home-rail-times">
              <span>{clock(position)}</span>
              <span>{clock(duration)}</span>
            </div>

            <div className="home-rail-quick-actions">
              <button type="button" onClick={onOpenLyrics} title="Open Synced Lyrics Theater (L)">
                <ScrollText size={13} /> Lyrics
              </button>
              <button type="button" onClick={() => onStartRadio(readyTrack)} title="Start Song Radio">
                <Radio size={13} /> Radio
              </button>
              <button type="button" onClick={onOpenQueue} title="Open Full Queue (Q)">
                <ListMusic size={13} /> Queue
              </button>
            </div>

            <div className="home-rail-upnext-list">
              <div className="home-rail-upnext-head">
                <span>UP NEXT</span>
                {autoQueueEnabled && (
                  <small>
                    <InfinityIcon size={11} /> Auto
                  </small>
                )}
              </div>
              {upcomingTracks.length > 0 ? (
                upcomingTracks.map((track, idx) => {
                  const key = track.videoId || track.id;
                  const isAuto = autoQueuedIds.has(key);
                  return (
                    <button
                      key={`${track.id}-${idx}`}
                      type="button"
                      className={`home-rail-upnext-row ${isAuto ? "is-auto" : ""}`}
                      onClick={() => onChooseTrack(track, queue)}
                      title={`Play ${track.title}`}
                    >
                      <img src={getTrackCoverUrl(track)} alt="" loading="lazy" />
                      <span>
                        <strong>{track.title}</strong>
                        <small>{track.artist}</small>
                      </span>
                      {isAuto ? <InfinityIcon size={11} className="upnext-infinity" /> : <AudioLines size={11} />}
                    </button>
                  );
                })
              ) : (
                <button type="button" className="home-rail-upnext-strip" onClick={onOpenQueue}>
                  <ListMusic size={13} />
                  <span>{autoQueueEnabled ? "Auto-Queue ready — open to pick a vibe" : "Open Play Queue"}</span>
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="home-rail-empty">Choose a track to start listening.</div>
        )}
      </section>

      <section className="home-rail-panel home-artists-panel">
        <div className="home-rail-heading">
          <h2><Users size={17} /> Top Artists</h2>
          <button type="button" onClick={() => onNavigate("stats")}>See All <ChevronRight size={13} /></button>
        </div>
        <div className="home-artist-list">
          {artists.map((artist, index) => (
            <button
              type="button"
              className="home-artist-row"
              key={artist.name}
              onClick={() => onOpenArtist(artist.name)}
              title={`Open ${artist.name} Artist Hub`}
            >
              <b>{index + 1}</b>
              <img src={getTrackCoverUrl(artist.track)} alt="" loading="lazy" />
              <span><strong>{artist.name}</strong><small>{artist.count} track{artist.count === 1 ? "" : "s"} in library</small></span>
            </button>
          ))}
          {!artists.length && <p className="home-rail-empty">Your artists will appear here.</p>}
        </div>
      </section>

      {featuredPlaylist && (
        <button
          type="button"
          className="home-rail-promo"
          onClick={() => onPlayPlaylist(featuredPlaylist, false)}
        >
          <img src={featuredPlaylist.cover} alt="" loading="lazy" />
          <span className="home-rail-promo-overlay" />
          <span className="home-rail-promo-copy"><em>Good music</em><strong>better days</strong></span>
          <span className="home-rail-promo-play"><Play size={16} fill="currentColor" /></span>
        </button>
      )}
    </aside>
  );
}
