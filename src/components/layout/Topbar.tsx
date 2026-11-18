"use client";

import React, { type RefObject } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Command,
  Copy,
  CircleUserRound,
  Minus,
  Search,
  Shuffle,
  Square,
  X,
} from "lucide-react";
import type { View, ActivePlaylistDisplay } from "@/types/music";
import { isTauriEnvironment } from "@/lib/tauri-audio";

interface TopbarProps {
  view: View;
  query: string;
  setQuery: (q: string) => void;
  activePlaylist: ActivePlaylistDisplay;
  isMaximized: boolean;
  isElectron: boolean;
  totalTracksCount: number;
  canGoBack: boolean;
  canGoForward: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onNavigate: (view: View) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onOpenCommandPalette: () => void;
  onRunSearch: (query: string, autoplay?: boolean) => void;
  onShuffleAll: () => void;
  onMinimize: (e?: React.MouseEvent) => void;
  onToggleMaximize: (e?: React.MouseEvent) => void;
  onClose: (e?: React.MouseEvent) => void;
}

const navLabels: Record<View, string> = {
  explore: "Explore",
  playlists: "Playlists",
  collection: "My Collection",
  memories: "History",
  downloads: "Downloads",
  stats: "Listening Stats",
  search: "Search",
  settings: "Settings",
  artist: "Artist Hub",
};

export function Topbar({
  view,
  query,
  setQuery,
  activePlaylist,
  isMaximized,
  isElectron,
  totalTracksCount,
  canGoBack,
  canGoForward,
  searchInputRef,
  onNavigate,
  onGoBack,
  onGoForward,
  onOpenCommandPalette,
  onRunSearch,
  onShuffleAll,
  onMinimize,
  onToggleMaximize,
  onClose,
}: TopbarProps) {
  const isDesktop = isElectron || isTauriEnvironment();

  return (
    <header className="rewind-topbar unified-top-menu">
      {/* Full-width drag surface behind controls */}
      <div
        className="topbar-drag-surface"
        data-tauri-drag-region
        onDoubleClick={onToggleMaximize}
      />

      <div className="topbar-left">
        <div className="topbar-nav-arrows" role="group" aria-label="Navigation history">
          <button
            type="button"
            className="topbar-icon-button"
            onClick={onGoBack}
            disabled={!canGoBack}
            aria-label="Go back"
            title="Back"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className="topbar-icon-button"
            onClick={onGoForward}
            disabled={!canGoForward}
            aria-label="Go forward"
            title="Forward"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="page-breadcrumb">
          <span>{navLabels[view] || "Explore"}</span>
          <strong>
            {view === "explore"
              ? "Trending Music"
              : view === "playlists"
              ? activePlaylist.title
              : view === "settings"
              ? "Preferences & EQ"
              : view === "artist"
              ? "Artist Spotlight"
              : "Your Music"}
          </strong>
        </div>
      </div>

      {/* Drag handle spacer between left and center */}
      <div
        className="topbar-drag-spacer"
        data-tauri-drag-region
        onDoubleClick={onToggleMaximize}
      />

      <div className="topbar-center">
        <form
          className="global-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            onRunSearch(query, true);
          }}
        >
          <Search size={15} />
          <input
            ref={searchInputRef}
            value={query}
            maxLength={120}
            placeholder="Search any artist, song, or video on YouTube…"
            aria-label="Search songs and artists"
            onChange={(event) => {
              const val = event.target.value;
              setQuery(val);
              if (val.trim().length >= 2 && view !== "search") {
                onNavigate("search");
              }
            }}
          />
          {query ? (
            <button
              className="clear-search"
              type="button"
              onClick={() => {
                setQuery("");
                onNavigate("explore");
              }}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          ) : (
            <button
              type="button"
              className="search-cmd-hint"
              onClick={onOpenCommandPalette}
              title="Open Command Palette (Ctrl+K)"
            >
              <Command size={11} />K
            </button>
          )}
        </form>
      </div>

      {/* Drag handle spacer between center and right */}
      <div
        className="topbar-drag-spacer"
        data-tauri-drag-region
        onDoubleClick={onToggleMaximize}
      />

      <div className="topbar-right">
        <button
          type="button"
          className="topbar-profile-button"
          onClick={() => onNavigate("settings")}
          aria-label="Open profile settings"
        >
          <span><CircleUserRound size={17} /></span>
          <strong>Rewind listener</strong>
        </button>
        <button
          type="button"
          className="today-button"
          onClick={onShuffleAll}
        >
          <Shuffle size={14} />
          Shuffle All ({totalTracksCount})
        </button>

        {isDesktop ? (
          <div className="window-controls-deck">
            <button
              type="button"
              className="win-ctrl-btn win-minimize-btn"
              onClick={onMinimize}
              title="Minimize Window"
              aria-label="Minimize Window"
            >
              <Minus size={13} strokeWidth={2} />
            </button>
            <button
              type="button"
              className="win-ctrl-btn win-maximize-btn"
              onClick={onToggleMaximize}
              title={isMaximized ? "Restore Window" : "Maximize Window"}
              aria-label={isMaximized ? "Restore Window" : "Maximize Window"}
            >
              {isMaximized ? (
                <Copy size={11} strokeWidth={2} />
              ) : (
                <Square size={11} strokeWidth={2} />
              )}
            </button>
            <button
              type="button"
              className="win-ctrl-btn win-close-btn"
              onClick={onClose}
              title="Close Window"
              aria-label="Close Window"
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        ) : (
          <div className="web-stream-pill">WEB</div>
        )}
      </div>
    </header>
  );
}
