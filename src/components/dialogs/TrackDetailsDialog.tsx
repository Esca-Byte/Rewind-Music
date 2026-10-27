"use client";

import React, { useEffect, useState } from "react";
import { ArrowDownToLine, Heart, LoaderCircle, Play, ScrollText } from "lucide-react";
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
  currentPosition: number;
}

type LyricLine = { time: number; text: string };

function parseSyncedLyrics(value: string): LyricLine[] {
  return value.split("\n").flatMap((line) => {
    const match = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
    if (!match) return [];
    return [{ time: Number(match[1]) * 60 + Number(match[2]), text: match[3] || " " }];
  });
}

export function TrackDetailsDialog({
  track,
  isSaved,
  onClose,
  onPlay,
  onToggleFavorite,
  onDownload,
  currentPosition,
}: TrackDetailsDialogProps) {
  const [lyricsState, setLyricsState] = useState<{
    trackId: string;
    loading: boolean;
    synced: LyricLine[];
    plain: string;
    error: string;
  }>({ trackId: "", loading: false, synced: [], plain: "", error: "" });

  useEffect(() => {
    if (!track) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ track_name: track.title, artist_name: track.artist });
    void fetch(`https://lrclib.net/api/get?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Lyrics not found");
        return response.json() as Promise<{ syncedLyrics?: string; plainLyrics?: string }>;
      })
      .then((data) => {
        const plain = data.plainLyrics?.trim() || "";
        const synced = data.syncedLyrics ? parseSyncedLyrics(data.syncedLyrics) : [];
        if (!plain && !synced.length) throw new Error("Lyrics not found");
        setLyricsState({ trackId: track.id, loading: false, plain, synced, error: "" });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLyricsState({ trackId: track.id, loading: false, plain: "", synced: [], error: error instanceof Error ? error.message : "Lyrics unavailable" });
        }
      });
    return () => controller.abort();
  }, [track]);

  if (!track) return null;

  const lyricsLoading = lyricsState.trackId !== track.id;
  const lyrics = lyricsState.trackId === track.id ? lyricsState : null;
  const activeLyricIndex = lyrics?.synced.reduce(
    (active, line, index) => (line.time <= currentPosition ? index : active),
    -1
  ) ?? -1;

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
          <small>Full track · {clock(track.duration)}</small>
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
      <section className="lyrics-panel" aria-label="Lyrics">
        <div className="lyrics-panel-heading"><span><ScrollText size={15} /> Lyrics</span><small>Powered by LRCLIB</small></div>
        {lyricsLoading ? (
          <div className="lyrics-state"><LoaderCircle size={16} className="spinner" /> Finding lyrics…</div>
        ) : lyrics?.error ? (
          <div className="lyrics-state">Lyrics are not available for this track.</div>
        ) : lyrics?.synced.length ? (
          <div className="lyrics-lines">
            {lyrics.synced.map((line, index) => <p key={`${line.time}-${index}`} className={index === activeLyricIndex ? "active" : ""}>{line.text}</p>)}
          </div>
        ) : (
          <pre className="lyrics-plain">{lyrics?.plain}</pre>
        )}
      </section>
    </Dialog>
  );
}
