"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, LoaderCircle, Play, Radio, Shuffle, Sparkles, Users } from "lucide-react";
import { TrackRow } from "@/components/track/TrackRow";
import { getTrackCoverUrl } from "@/components/time/album-object";
import { fetchGenreRadioTracks, isTauriEnvironment } from "@/lib/tauri-audio";
import { getCuratedScenePeers, primaryArtistName } from "@/lib/time/smart-queue";
import type { TimeTrack } from "@/lib/time/types";

interface ArtistViewProps {
  artistName: string;
  localTracks: TimeTrack[];
  currentTrackVideoId?: string;
  isPlaying: boolean;
  isSaved: (track: TimeTrack) => boolean;
  onBack: () => void;
  onOpenArtist: (artist: string) => void;
  onChooseTrack: (track: TimeTrack, list: TimeTrack[]) => void;
  onPlayNext: (track: TimeTrack) => void;
  onAddToQueue: (track: TimeTrack) => void;
  onStartRadio: (track: TimeTrack) => void;
  onOpenAddToPlaylist: (track: TimeTrack) => void;
  onToggleFavorite: (track: TimeTrack) => void;
  onDownload: (track: TimeTrack) => void;
}

export function ArtistView({
  artistName,
  localTracks,
  currentTrackVideoId,
  isPlaying,
  isSaved,
  onBack,
  onOpenArtist,
  onChooseTrack,
  onPlayNext,
  onAddToQueue,
  onStartRadio,
  onOpenAddToPlaylist,
  onToggleFavorite,
  onDownload,
}: ArtistViewProps) {
  const cleanName = primaryArtistName(artistName) || artistName;
  const [remoteState, setRemoteState] = useState<{ artist: string; tracks: TimeTrack[] }>({
    artist: "",
    tracks: [],
  });

  useEffect(() => {
    if (!cleanName || !isTauriEnvironment()) return;
    let cancelled = false;
    void fetchGenreRadioTracks(`${cleanName} top songs`, cleanName, 18)
      .then((results) => {
        if (!cancelled) setRemoteState({ artist: cleanName, tracks: results });
      })
      .catch(() => {
        if (!cancelled) setRemoteState({ artist: cleanName, tracks: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [cleanName]);

  const loading = isTauriEnvironment() && remoteState.artist !== cleanName;

  const combinedTracks = useMemo(() => {
    const lower = cleanName.toLowerCase();
    const localMatches = localTracks.filter((track) =>
      track.artist.toLowerCase().includes(lower)
    );
    const remoteMatches = remoteState.artist === cleanName ? remoteState.tracks : [];
    const seen = new Set<string>();
    return [...localMatches, ...remoteMatches].filter((track) => {
      const key = track.videoId || track.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [cleanName, localTracks, remoteState]);

  const heroTrack = combinedTracks[0];
  const similarArtists = useMemo(() => {
    if (heroTrack) return getCuratedScenePeers(heroTrack);
    return getCuratedScenePeers({
      id: "seed",
      videoId: "",
      title: "",
      artist: cleanName,
      album: "",
      genre: "",
      year: null,
      duration: 180,
      cover: "",
      source: "youtube",
    });
  }, [heroTrack, cleanName]);

  const playAll = (shuffled = false) => {
    if (!combinedTracks.length) return;
    const list = shuffled
      ? [...combinedTracks].sort(() => Math.random() - 0.5)
      : combinedTracks;
    onChooseTrack(list[0], list);
  };

  return (
    <div className="artist-hub-view">
      <button type="button" className="quiet-button artist-back-btn" onClick={onBack}>
        <ArrowLeft size={14} /> Back
      </button>

      <section className="artist-hero-card">
        <div className="artist-hero-avatar">
          {heroTrack ? (
            <img src={getTrackCoverUrl(heroTrack)} alt={cleanName} />
          ) : (
            <Users size={38} />
          )}
        </div>
        <div className="artist-hero-copy">
          <p className="overline">ARTIST HUB</p>
          <h1>{cleanName}</h1>
          <p className="intro-description">
            {combinedTracks.length} track{combinedTracks.length === 1 ? "" : "s"} ready to stream
          </p>
          <div className="artist-hero-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => playAll(false)}
              disabled={!combinedTracks.length}
            >
              <Play size={16} fill="currentColor" /> Play Top Songs
            </button>
            <button
              type="button"
              className="quiet-button"
              onClick={() => playAll(true)}
              disabled={!combinedTracks.length}
            >
              <Shuffle size={15} /> Shuffle
            </button>
            {heroTrack && (
              <button
                type="button"
                className="quiet-button"
                onClick={() => onStartRadio(heroTrack)}
              >
                <Radio size={15} /> Artist Radio
              </button>
            )}
          </div>
        </div>
      </section>

      {similarArtists.length > 0 && (
        <section className="artist-peers-section">
          <div className="section-header">
            <div>
              <h2><Sparkles size={17} /> Similar Artists</h2>
              <p>Jump straight into peer artists from the same scene.</p>
            </div>
          </div>
          <div className="artist-peers-row">
            {similarArtists.map((peer) => (
              <button
                key={peer}
                type="button"
                className="artist-peer-pill"
                onClick={() => onOpenArtist(peer)}
              >
                <Users size={13} /> {peer}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="artist-tracks-section">
        <div className="section-header">
          <div>
            <h2>
              Top Tracks <span className="small-count">{combinedTracks.length}</span>
            </h2>
            <p>Library favorites blended with YouTube Music songs.</p>
          </div>
          {loading && (
            <span className="artist-loading-badge">
              <LoaderCircle size={13} className="spinner" /> Loading catalog…
            </span>
          )}
        </div>

        <div className="recording-list">
          {combinedTracks.map((track, index) => (
            <TrackRow
              key={`${track.id}-${index}`}
              track={track}
              index={index}
              list={combinedTracks}
              suffix="artist"
              isPlayingCurrent={currentTrackVideoId === track.videoId}
              isPlaying={isPlaying}
              isSaved={isSaved(track)}
              onChoose={onChooseTrack}
              onPlayNext={onPlayNext}
              onAddToQueue={onAddToQueue}
              onStartRadio={onStartRadio}
              onOpenAddToPlaylist={onOpenAddToPlaylist}
              onToggleFavorite={onToggleFavorite}
              onDownload={onDownload}
              onOpenArtist={onOpenArtist}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
