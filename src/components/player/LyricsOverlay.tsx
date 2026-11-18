"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Heart,
  LoaderCircle,
  Pause,
  Play,
  Radio,
  ScrollText,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";
import { Artwork, getTrackCoverUrl } from "@/components/time/album-object";
import { clock, type TimeTrack } from "@/lib/time/types";

interface LyricsOverlayProps {
  open: boolean;
  track: TimeTrack;
  playing: boolean;
  position: number;
  duration: number;
  isSaved: boolean;
  onClose: () => void;
  onTogglePlay: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (seconds: number) => void;
  onToggleFavorite: (track: TimeTrack) => void;
  onDownload: (track: TimeTrack) => void;
  onStartRadio: (track: TimeTrack) => void;
  onOpenArtist?: (artist: string) => void;
}

type LyricLine = { time: number; text: string };

function parseSyncedLyrics(value: string): LyricLine[] {
  return value.split("\n").flatMap((line) => {
    const match = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
    if (!match) return [];
    const text = match[3].trim();
    if (!text) return [];
    return [{ time: Number(match[1]) * 60 + Number(match[2]), text }];
  });
}

function cleanQueryTitle(title: string): string {
  return title
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\b(official|music|video|audio|lyric|lyrics|mv|m\/v|hd|4k)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function LyricsOverlay({
  open,
  track,
  playing,
  position,
  duration,
  isSaved,
  onClose,
  onTogglePlay,
  onPrevious,
  onNext,
  onSeek,
  onToggleFavorite,
  onDownload,
  onStartRadio,
  onOpenArtist,
}: LyricsOverlayProps) {
  const [lyricsState, setLyricsState] = useState<{
    trackId: string;
    synced: LyricLine[];
    plain: string;
    error: string;
  }>({ trackId: "", synced: [], plain: "", error: "" });

  const activeLineRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open || !track) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, track, onClose]);

  useEffect(() => {
    if (!open || !track) return;
    if (lyricsState.trackId === track.id) return;

    const controller = new AbortController();
    const cleanedTitle = cleanQueryTitle(track.title) || track.title;
    const primaryArtist = track.artist.split(/[,&/]|\b(?:feat|ft)\b/i)[0]?.trim() || track.artist;

    const params = new URLSearchParams({
      track_name: cleanedTitle,
      artist_name: primaryArtist,
    });

    void fetch(`https://lrclib.net/api/get?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (res.ok) {
          return res.json() as Promise<{ syncedLyrics?: string; plainLyrics?: string }>;
        }
        // Fallback: LRCLIB search endpoint for fuzzier matches
        const searchParams = new URLSearchParams({ q: `${cleanedTitle} ${primaryArtist}` });
        const searchRes = await fetch(`https://lrclib.net/api/search?${searchParams.toString()}`, {
          signal: controller.signal,
        });
        if (!searchRes.ok) throw new Error("Lyrics not found");
        const list = (await searchRes.json()) as Array<{ syncedLyrics?: string; plainLyrics?: string }>;
        const best = list.find((item) => item.syncedLyrics) || list[0];
        if (!best) throw new Error("Lyrics not found");
        return best;
      })
      .then((data) => {
        const plain = data.plainLyrics?.trim() || "";
        const synced = data.syncedLyrics ? parseSyncedLyrics(data.syncedLyrics) : [];
        if (!plain && !synced.length) throw new Error("Lyrics not found");
        setLyricsState({ trackId: track.id, synced, plain, error: "" });
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setLyricsState({
            trackId: track.id,
            synced: [],
            plain: "",
            error: err instanceof Error ? err.message : "Lyrics unavailable",
          });
        }
      });

    return () => controller.abort();
  }, [open, track, lyricsState.trackId]);

  const isLoading = open && lyricsState.trackId !== track.id;
  const activeIndex =
    lyricsState.trackId === track.id
      ? lyricsState.synced.reduce((acc, line, idx) => (line.time <= position + 0.35 ? idx : acc), -1)
      : -1;

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    activeLineRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [open, activeIndex]);

  if (!open) return null;

  const coverUrl = getTrackCoverUrl(track);
  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0;

  return (
    <div
      className="lyrics-theater-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Now playing lyrics for ${track.title}`}
    >
      <div
        className="lyrics-theater-ambient"
        style={{ backgroundImage: coverUrl ? `url(${JSON.stringify(coverUrl)})` : undefined }}
        aria-hidden="true"
      />
      <div className="lyrics-theater-shell">
        <header className="lyrics-theater-header">
          <span className="lyrics-theater-badge">
            <ScrollText size={14} /> SYNCED LYRICS THEATER
          </span>
          <button
            type="button"
            className="icon-button lyrics-theater-close"
            onClick={onClose}
            aria-label="Close lyrics theater"
          >
            <X size={20} />
          </button>
        </header>

        <div className="lyrics-theater-grid">
          <section className="lyrics-theater-left">
            <div className="lyrics-theater-cover">
              <Artwork track={track} eager />
            </div>
            <div className="lyrics-theater-meta">
              <h2>{track.title}</h2>
              {onOpenArtist ? (
                <button
                  type="button"
                  className="lyrics-artist-link"
                  onClick={() => {
                    onOpenArtist(track.artist);
                    onClose();
                  }}
                >
                  {track.artist}
                </button>
              ) : (
                <p>{track.artist}</p>
              )}
              <small>
                {track.album}
                {track.genre ? ` · ${track.genre}` : ""}
              </small>
            </div>

            <div className="lyrics-theater-timeline">
              <span>{clock(position)}</span>
              <input
                type="range"
                min={0}
                max={duration || 1}
                value={Math.min(position, duration || 1)}
                onChange={(event) => onSeek(Number(event.target.value))}
                style={{ "--played": `${progressPct}%` } as React.CSSProperties}
                aria-label="Seek track position"
              />
              <span>{clock(duration)}</span>
            </div>

            <div className="lyrics-theater-controls">
              <button
                type="button"
                className={`icon-button ${isSaved ? "saved" : ""}`}
                onClick={() => onToggleFavorite(track)}
                title={isSaved ? "Remove from collection" : "Save to collection"}
              >
                <Heart size={18} fill={isSaved ? "currentColor" : "none"} />
              </button>
              <button type="button" className="icon-button" onClick={onPrevious} aria-label="Previous">
                <SkipBack size={20} fill="currentColor" />
              </button>
              <button type="button" className="main-play-button" onClick={onTogglePlay} aria-label={playing ? "Pause" : "Play"}>
                {playing ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}
              </button>
              <button type="button" className="icon-button" onClick={onNext} aria-label="Next">
                <SkipForward size={20} fill="currentColor" />
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={() => onStartRadio(track)}
                title="Start Song Radio"
              >
                <Radio size={18} />
              </button>
              {track.videoId && (
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => onDownload(track)}
                  title="Download offline"
                >
                  <ArrowDownToLine size={18} />
                </button>
              )}
            </div>
          </section>

          <section className="lyrics-theater-right" aria-label="Lyrics lines">
            {isLoading ? (
              <div className="lyrics-theater-empty">
                <LoaderCircle size={22} className="spinner" />
                <p>Fetching synced lyrics…</p>
              </div>
            ) : lyricsState.synced.length > 0 ? (
              <div className="lyrics-theater-scroll">
                {lyricsState.synced.map((line, index) => {
                  const isActive = index === activeIndex;
                  const isPast = index < activeIndex;
                  return (
                    <button
                      key={`${line.time}-${index}`}
                      ref={isActive ? activeLineRef : null}
                      type="button"
                      className={`lyrics-theater-line ${isActive ? "is-active" : ""} ${isPast ? "is-past" : ""}`}
                      onClick={() => onSeek(line.time)}
                      title={`Jump to ${clock(line.time)}`}
                    >
                      {line.text}
                    </button>
                  );
                })}
              </div>
            ) : lyricsState.plain ? (
              <pre className="lyrics-theater-plain">{lyricsState.plain}</pre>
            ) : (
              <div className="lyrics-theater-empty">
                <ScrollText size={28} />
                <p>No synced lyrics found for this track yet.</p>
                <small>Try playing the official studio recording for best LRCLIB matches.</small>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
