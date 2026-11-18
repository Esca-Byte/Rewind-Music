"use client";

import React, { useMemo, useState } from "react";
import { ArrowUpRight, Clock3, Search, Users, X } from "lucide-react";
import { TrackRow } from "@/components/track/TrackRow";
import { primaryArtistName } from "@/lib/time/smart-queue";
import type { TimeTrack } from "@/lib/time/types";

type SearchFilterTab = "all" | "songs" | "artists";

interface SearchViewProps {
  query: string;
  searchedFor: string;
  searching: boolean;
  searchError: string;
  results: TimeTrack[];
  recentSearches: string[];
  currentTrackVideoId?: string;
  isPlaying: boolean;
  isSaved: (track: TimeTrack) => boolean;
  onSetQuery: (q: string) => void;
  onRunSearch: (q: string) => void;
  onRemoveRecentSearch: (q: string) => void;
  onClearRecentSearches: () => void;
  onChooseTrack: (track: TimeTrack, list: TimeTrack[]) => void;
  onPlayNext: (track: TimeTrack) => void;
  onAddToQueue: (track: TimeTrack) => void;
  onStartRadio: (track: TimeTrack) => void;
  onOpenAddToPlaylist: (track: TimeTrack) => void;
  onToggleFavorite: (track: TimeTrack) => void;
  onDownload: (track: TimeTrack) => void;
  onOpenDetails: (track: TimeTrack) => void;
  onOpenArtist: (artist: string) => void;
}

export function SearchView({
  query,
  searchedFor,
  searching,
  searchError,
  results,
  recentSearches,
  currentTrackVideoId,
  isPlaying,
  isSaved,
  onSetQuery,
  onRunSearch,
  onRemoveRecentSearch,
  onClearRecentSearches,
  onChooseTrack,
  onPlayNext,
  onAddToQueue,
  onStartRadio,
  onOpenAddToPlaylist,
  onToggleFavorite,
  onDownload,
  onOpenDetails,
  onOpenArtist,
}: SearchViewProps) {
  const [filterTab, setFilterTab] = useState<SearchFilterTab>("all");

  const matchedArtists = useMemo(() => {
    const seen = new Map<string, { name: string; count: number; cover: string }>();
    for (const track of results) {
      const name = primaryArtistName(track.artist);
      if (!name || name === "YouTube Artist") continue;
      const key = name.toLowerCase();
      const prev = seen.get(key);
      if (prev) {
        prev.count += 1;
      } else {
        seen.set(key, { name, count: 1, cover: track.cover });
      }
    }
    return Array.from(seen.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [results]);

  return (
    <>
      <div className="page-intro">
        <div>
          <p className="overline">YOUTUBE MUSIC SEARCH</p>
          <h1>{searching ? "Finding your song…" : "Search results."}</h1>
          <p className="intro-description">
            Fast InnerTube music catalog search. Press Enter to play immediately.
          </p>
        </div>
        <span className="full-length-badge">
          <span />
          FULL RECORDINGS
        </span>
      </div>

      {recentSearches.length > 0 && (
        <section className="recent-searches-bar" aria-label="Recent searches">
          <span className="recent-searches-label">
            <Clock3 size={12} /> Recent
          </span>
          <div className="recent-searches-pills">
            {recentSearches.map((term) => (
              <div key={term} className="recent-search-chip">
                <button
                  type="button"
                  onClick={() => {
                    onSetQuery(term);
                    void onRunSearch(term);
                  }}
                >
                  {term}
                </button>
                <button
                  type="button"
                  className="recent-search-remove"
                  onClick={() => onRemoveRecentSearch(term)}
                  aria-label={`Remove ${term}`}
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="text-link recent-clear-btn" onClick={onClearRecentSearches}>
            Clear
          </button>
        </section>
      )}

      {searchError && (
        <div className="rewind-alert" role="alert">
          {searchError}
          <button onClick={() => void onRunSearch(query)}>Try again</button>
        </div>
      )}

      {searching ? (
        <div className="search-skeletons" aria-label="Searching music tracks">
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
          {results.length > 0 && (
            <div className="search-filter-row" role="tablist" aria-label="Filter search results">
              {(
                [
                  { id: "all", label: `All (${results.length})` },
                  { id: "songs", label: `Songs (${results.length})` },
                  { id: "artists", label: `Artists (${matchedArtists.length})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={filterTab === tab.id}
                  className={`queue-vibe-chip ${filterTab === tab.id ? "active" : ""}`}
                  onClick={() => setFilterTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {matchedArtists.length > 0 && (filterTab === "all" || filterTab === "artists") && (
            <section className="search-artists-strip">
              <div className="results-caption">
                <span>Artists</span>
                <span>Click to open Artist Hub</span>
              </div>
              <div className="search-artists-grid">
                {matchedArtists.map((artist) => (
                  <button
                    key={artist.name}
                    type="button"
                    className="search-artist-card"
                    onClick={() => onOpenArtist(artist.name)}
                  >
                    <img src={artist.cover} alt={artist.name} loading="lazy" />
                    <span>
                      <strong>{artist.name}</strong>
                      <small>
                        <Users size={11} /> {artist.count} matched song{artist.count === 1 ? "" : "s"}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {filterTab !== "artists" && (
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
                <span>YouTube Music</span>
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
                    onStartRadio={onStartRadio}
                    onOpenAddToPlaylist={onOpenAddToPlaylist}
                    onToggleFavorite={onToggleFavorite}
                    onDownload={onDownload}
                    onOpenDetails={onOpenDetails}
                    onOpenArtist={onOpenArtist}
                  />
                ))}
              </div>
            </>
          )}

          {results.length === 0 && !searchError && (
            <div className="empty-state">
              <Search size={34} />
              <h2>Search millions of songs on YouTube Music.</h2>
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
