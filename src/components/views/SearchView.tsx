"use client";

import React from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { TrackRow } from "@/components/track/TrackRow";
import type { TimeTrack } from "@/lib/time/types";

interface SearchViewProps {
  query: string;
  searchedFor: string;
  searching: boolean;
  searchError: string;
  results: TimeTrack[];
  currentTrackVideoId?: string;
  isPlaying: boolean;
  isSaved: (track: TimeTrack) => boolean;
  onSetQuery: (q: string) => void;
  onRunSearch: (q: string) => void;
  onChooseTrack: (track: TimeTrack, list: TimeTrack[]) => void;
  onPlayNext: (track: TimeTrack) => void;
  onAddToQueue: (track: TimeTrack) => void;
  onOpenAddToPlaylist: (track: TimeTrack) => void;
  onToggleFavorite: (track: TimeTrack) => void;
  onDownload: (track: TimeTrack) => void;
}

export function SearchView({
  query,
  searchedFor,
  searching,
  searchError,
  results,
  currentTrackVideoId,
  isPlaying,
  isSaved,
  onSetQuery,
  onRunSearch,
  onChooseTrack,
  onPlayNext,
  onAddToQueue,
  onOpenAddToPlaylist,
  onToggleFavorite,
  onDownload,
}: SearchViewProps) {
  return (
    <>
      <div className="page-intro">
        <div>
          <p className="overline">YOUTUBE MUSIC SEARCH</p>
          <h1>{searching ? "Finding your song…" : "Search results."}</h1>
          <p className="intro-description">
            Search any artist or song. Press Enter to play immediately.
          </p>
        </div>
        <span className="full-length-badge">
          <span />
          FULL RECORDINGS
        </span>
      </div>

      {searchError && (
        <div className="rewind-alert" role="alert">
          {searchError}
          <button onClick={() => void onRunSearch(query)}>Try again</button>
        </div>
      )}

      {searching ? (
        <div className="search-skeletons" aria-label="Searching full recordings">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i}>
              <i />
              <span />
              <b />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="results-caption">
            <span>
              {results.length} results{" "}
              {searchedFor && (
                <>
                  for <strong>“{searchedFor}”</strong>
                </>
              )}
            </span>
            <span>YouTube catalog</span>
          </div>

          <div className="recording-list search-list">
            {results.map((track, index) => (
              <TrackRow
                key={`${track.id}-${index}`}
                track={track}
                index={index}
                list={results}
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

          {results.length === 0 && !searchError && (
            <div className="empty-state">
              <Search size={34} />
              <h2>Search millions of songs on YouTube.</h2>
              <p>Type any song name, artist, or band to start streaming.</p>
              <div>
                {[
                  "Arz Kiya Hai Anuv Jain",
                  "Die With A Smile Bruno Mars",
                  "TREASURE NALLY-NA",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      onSetQuery(suggestion);
                      void onRunSearch(suggestion);
                    }}
                  >
                    {suggestion}
                    <ArrowUpRight size={13} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
