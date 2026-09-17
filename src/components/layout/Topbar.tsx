"use client";

import React, { type RefObject } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Minus,
  Rewind,
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
  historyIndex: number;
  viewHistoryLength: number;
  isMaximized: boolean;
  isElectron: boolean;
  totalTracksCount: number;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onNavigate: (view: View) => void;
  onGoBack: () => void;
  onGoForward: () => void;
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
  search: "Search",
  settings: "Settings",
};

export function Topbar({
  view,
  query,
  setQuery,
  activePlaylist,
  historyIndex,
  viewHistoryLength,
  isMaximized,
  isElectron,
  totalTracksCount,
  searchInputRef,
  onNavigate,
  onGoBack,
  onGoForward,
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
        <button
          type="button"
          className="topbar-brand-btn"
          onClick={() => onNavigate("explore")}
          aria-label="Rewind home"
          title="Rewind Music Player"
        >
          <span className="topbar-brand-icon">
            <img
              src="/rewindlogo.png"
              alt="Rewind Logo"
              className="topbar-brand-img"
              onError={(e) => {
                e.currentTarget.style.display = "none";
                const fallback = e.currentTarget.parentElement?.querySelector(
                  ".topbar-brand-fallback"
                ) as HTMLElement;
                if (fallback) fallback.style.display = "flex";
              }}
            />
            <span className="topbar-brand-fallback" style={{ display: "none" }}>
              <Rewind size={15} fill="currentColor" />
            </span>
          </span>
          <strong>
            rewind<span>.</span>
          </strong>
        </button>

        <div className="nav-history-controls">
          <button
            type="button"
            className="nav-arrow-btn"
            onClick={onGoBack}
            disabled={historyIndex === 0}
            title="Go back"
            aria-label="Back"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className="nav-arrow-btn"
            onClick={onGoForward}
            disabled={historyIndex >= viewHistoryLength - 1}
            title="Go forward"
            aria-label="Forward"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="page-breadcrumb">
          <span>{navLabels[view] || "Explore"}</span>
          <ChevronRight size={12} />
          <strong>
            {view === "explore"
              ? "Trending Music"
              : view === "playlists"
              ? activePlaylist.title
              : view === "settings"
              ? "Preferences & Themes"
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
              setQuery(event.target.value);
              if (event.target.value.trim().length >= 2) onNavigate("search");
            }}
          />
          <kbd>⌘ K</kbd>
          {query && (
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
