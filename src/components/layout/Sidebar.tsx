"use client";

import React from "react";
import {
  ArrowDownToLine,
  ChevronRight,
  Compass,
  Heart,
  History,
  ListMusic,
  Plus,
  Settings,
} from "lucide-react";
import type { View, UserPlaylist } from "@/types/music";
import { playlists as curatedPlaylists } from "@/lib/time/playlists";

interface SidebarProps {
  view: View;
  selectedPlaylistId: string;
  customPlaylists: UserPlaylist[];
  favoritesCount: number;
  onNavigate: (view: View) => void;
  onOpenPlaylist: (id: string) => void;
  onOpenNewPlaylistModal: () => void;
  onOpenInfoModal: () => void;
}

const navItems = [
  { id: "explore", label: "Home", icon: Compass },
  { id: "playlists", label: "Playlists", icon: ListMusic },
  { id: "collection", label: "My collection", icon: Heart },
  { id: "memories", label: "History", icon: History },
  { id: "downloads", label: "Downloads", icon: ArrowDownToLine },
] as const;

export function Sidebar({
  view,
  selectedPlaylistId,
  customPlaylists,
  favoritesCount,
  onNavigate,
  onOpenPlaylist,
  onOpenNewPlaylistModal,
  onOpenInfoModal,
}: SidebarProps) {
  return (
    <aside className="rewind-sidebar">
      <div className="sidebar-section">
        <span className="sidebar-label">MENU</span>
        <nav aria-label="Main navigation">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`sidebar-link ${view === id ? "active" : ""}`}
              onClick={() => onNavigate(id as View)}
            >
              <Icon size={18} strokeWidth={1.65} />
              <span>{label}</span>
              {id === "collection" && favoritesCount > 0 && (
                <b>{favoritesCount}</b>
              )}
              {id === "playlists" && (
                <b>{curatedPlaylists.length + customPlaylists.length}</b>
              )}
            </button>
          ))}
        </nav>
      </div>

      <div className="sidebar-section playlist-shortcuts-section">
        <div className="sidebar-section-header">
          <span className="sidebar-label">YOUR PLAYLISTS</span>
          <button
            className="icon-button sidebar-add-pl-btn"
            onClick={onOpenNewPlaylistModal}
            title="Create new playlist"
            aria-label="Create new playlist"
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="sidebar-playlist-links">
          {customPlaylists.map((pl) => (
            <button
              key={pl.id}
              className={`sidebar-playlist-item ${
                view === "playlists" && selectedPlaylistId === pl.id ? "active" : ""
              }`}
              onClick={() => onOpenPlaylist(pl.id)}
            >
              <span
                className="sidebar-pl-dot"
                style={{ background: pl.accent || "#e0a82e" }}
              />
              <span className="sidebar-pl-name">{pl.title}</span>
              <small>{pl.tracks.length}</small>
            </button>
          ))}
          {curatedPlaylists.map((pl) => (
            <button
              key={pl.id}
              className={`sidebar-playlist-item ${
                view === "playlists" && selectedPlaylistId === pl.id ? "active" : ""
              }`}
              onClick={() => onOpenPlaylist(pl.id)}
            >
              <span className="sidebar-pl-dot" style={{ background: pl.accent }} />
              <span className="sidebar-pl-name">{pl.title}</span>
              <small>{pl.trackCount}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-bottom">
        <div className="sidebar-record">
          <span />
          <i />
        </div>
        <p>
          Full recordings.
          <br />
          <em>Never previews.</em>
        </p>
        <span className="sidebar-footnote">OFFICIAL YOUTUBE STREAMS</span>
        <button
          className={`listening-profile sidebar-settings-btn ${view === "settings" ? "active" : ""}`}
          onClick={() => onNavigate("settings")}
          aria-label="Open Settings"
        >
          <span className="profile-avatar settings-avatar">
            <Settings size={15} />
          </span>
          <span>
            <strong>Settings</strong>
            <small>Themes & preferences</small>
          </span>
          <ChevronRight size={14} />
        </button>
      </div>
    </aside>
  );
}
