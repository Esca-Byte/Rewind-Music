"use client";

import React from "react";
import {
  ArrowDownToLine,
  Compass,
  Heart,
  History,
  ListMusic,
  Search,
} from "lucide-react";
import type { View } from "@/types/music";

interface MobileNavProps {
  view: View;
  onNavigate: (view: View) => void;
  onFocusSearch: () => void;
}

const navItems = [
  { id: "explore", label: "Home", icon: Compass },
  { id: "playlists", label: "Playlists", icon: ListMusic },
  { id: "collection", label: "Collection", icon: Heart },
  { id: "memories", label: "History", icon: History },
  { id: "downloads", label: "Downloads", icon: ArrowDownToLine },
] as const;

export function MobileNav({ view, onNavigate, onFocusSearch }: MobileNavProps) {
  return (
    <nav className="mobile-navigation" aria-label="Mobile navigation">
      {navItems.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          className={view === id ? "active" : ""}
          onClick={() => onNavigate(id as View)}
        >
          <Icon size={18} />
          <span>{label}</span>
        </button>
      ))}
      <button
        className={view === "search" ? "active" : ""}
        onClick={onFocusSearch}
      >
        <Search size={18} />
        <span>Search</span>
      </button>
    </nav>
  );
}
