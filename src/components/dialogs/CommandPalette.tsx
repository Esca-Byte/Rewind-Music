"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Compass,
  Heart,
  ListMusic,
  Palette,
  Radio,
  ScrollText,
  Search,
  Settings,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import type { AppTheme, UserPlaylist, View } from "@/types/music";
import type { Playlist } from "@/lib/time/playlists";
import { SMART_QUEUE_MODES, type SmartQueueModeId } from "@/lib/time/smart-queue";
import { APP_THEMES } from "@/components/views/SettingsView";

interface CommandItem {
  id: string;
  group: string;
  label: string;
  subtitle?: string;
  icon: React.ReactNode;
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  curatedPlaylists: Playlist[];
  customPlaylists: UserPlaylist[];
  onClose: () => void;
  onNavigate: (view: View) => void;
  onOpenPlaylist: (id: string) => void;
  onLaunchSmartQueueMode: (mode: SmartQueueModeId) => void;
  onSelectTheme: (theme: AppTheme) => void;
  onToggleQueue: () => void;
  onOpenLyrics: () => void;
  onShuffleAll: () => void;
  onRunSearch: (query: string) => void;
}

export function CommandPalette({
  open,
  curatedPlaylists,
  customPlaylists,
  onClose,
  onNavigate,
  onOpenPlaylist,
  onLaunchSmartQueueMode,
  onSelectTheme,
  onToggleQueue,
  onOpenLyrics,
  onShuffleAll,
  onRunSearch,
}: CommandPaletteProps) {
  const [filter, setFilter] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const items = useMemo<CommandItem[]>(() => {
    const list: CommandItem[] = [
      {
        id: "act-lyrics",
        group: "Quick Actions",
        label: "Open Synced Lyrics Theater",
        subtitle: "Shortcut: L",
        icon: <ScrollText size={15} />,
        action: onOpenLyrics,
      },
      {
        id: "act-queue",
        group: "Quick Actions",
        label: "Toggle Play Queue & Smart Radio",
        subtitle: "Shortcut: Q",
        icon: <ListMusic size={15} />,
        action: onToggleQueue,
      },
      {
        id: "act-shuffle",
        group: "Quick Actions",
        label: "Shuffle All Library Tracks",
        subtitle: "Instant mix across all playlists",
        icon: <Shuffle size={15} />,
        action: onShuffleAll,
      },
      {
        id: "nav-home",
        group: "Navigate",
        label: "Go to Home / Explore",
        icon: <Compass size={15} />,
        action: () => onNavigate("explore"),
      },
      {
        id: "nav-collection",
        group: "Navigate",
        label: "Go to My Collection (Liked Songs)",
        icon: <Heart size={15} />,
        action: () => onNavigate("collection"),
      },
      {
        id: "nav-settings",
        group: "Navigate",
        label: "Open Settings & Studio Equalizer",
        icon: <SlidersHorizontal size={15} />,
        action: () => onNavigate("settings"),
      },
      {
        id: "nav-downloads",
        group: "Navigate",
        label: "Go to Offline Downloads",
        icon: <Settings size={15} />,
        action: () => onNavigate("downloads"),
      },
    ];

    SMART_QUEUE_MODES.forEach((mode) => {
      list.push({
        id: `radio-${mode.id}`,
        group: "Smart Queue Radio",
        label: `Start ${mode.label} Auto-Queue`,
        subtitle: mode.description,
        icon: <Radio size={15} />,
        action: () => onLaunchSmartQueueMode(mode.id),
      });
    });

    [...customPlaylists, ...curatedPlaylists].slice(0, 12).forEach((pl) => {
      list.push({
        id: `pl-${pl.id}`,
        group: "Playlists",
        label: pl.title,
        subtitle: `${pl.tracks.length} tracks`,
        icon: <Sparkles size={15} />,
        action: () => onOpenPlaylist(pl.id),
      });
    });

    APP_THEMES.forEach((theme) => {
      list.push({
        id: `theme-${theme.id}`,
        group: "Themes",
        label: `Switch Theme: ${theme.name}`,
        subtitle: theme.subtitle,
        icon: <Palette size={15} />,
        action: () => onSelectTheme(theme.id),
      });
    });

    return list;
  }, [
    curatedPlaylists,
    customPlaylists,
    onLaunchSmartQueueMode,
    onNavigate,
    onOpenLyrics,
    onOpenPlaylist,
    onSelectTheme,
    onShuffleAll,
    onToggleQueue,
  ]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items.slice(0, 16);
    const matched = items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q) ||
        (item.subtitle || "").toLowerCase().includes(q)
    );
    return [
      ...matched.slice(0, 14),
      {
        id: "live-search",
        group: "Search YouTube Music",
        label: `Search for “${filter.trim()}”`,
        subtitle: "Find songs & artists live",
        icon: <Search size={15} />,
        action: () => onRunSearch(filter.trim()),
      },
    ];
  }, [filter, items, onRunSearch]);

  const safeSelected = Math.min(selectedIndex, Math.max(0, filtered.length - 1));

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + Math.max(1, filtered.length)) % Math.max(1, filtered.length));
      } else if (event.key === "Enter" && filtered[safeSelected]) {
        event.preventDefault();
        filtered[safeSelected].action();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, filtered, safeSelected, onClose]);

  if (!open) return null;

  return (
    <div
      className="command-palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="command-palette-box">
        <div className="command-palette-input-row">
          <Search size={16} />
          <input
            type="text"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Jump to Smart Radio, playlist, theme, or search a song…"
            autoFocus
            aria-label="Command search"
          />
          <kbd>ESC</kbd>
        </div>

        <div className="command-palette-list">
          {filtered.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`command-palette-item ${index === safeSelected ? "active" : ""}`}
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={() => {
                item.action();
                onClose();
              }}
            >
              <span className="command-item-icon">{item.icon}</span>
              <span className="command-item-copy">
                <strong>{item.label}</strong>
                {item.subtitle && <small>{item.subtitle}</small>}
              </span>
              <span className="command-item-group">{item.group}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
