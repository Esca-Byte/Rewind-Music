"use client";

import React from "react";
import {
  Check,
  ExternalLink,
  Palette,
  Sparkles,
  Download,
  FolderOpen,
  Keyboard,
  ListMusic,
  ShieldCheck,
  Zap,
} from "lucide-react";
import type { AppTheme, ThemeOption, View } from "@/types/music";
import { openDownloadsFolder } from "@/lib/tauri-audio";

function GithubIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

export const APP_THEMES: ThemeOption[] = [
  {
    id: "analog",
    name: "Warm Analog",
    subtitle: "Original Parchment",
    description: "Classic vintage paper tones with burnt crimson accents and warm golden highlights.",
    primaryColor: "#e11d48",
    bgColor: "#f7f5ef",
    cardColor: "#ffffff",
    isDark: false,
  },
  {
    id: "midnight",
    name: "Midnight Vinyl",
    subtitle: "Sleek Obsidian",
    description: "Deep space obsidian black with dark glass surfaces and radiant neon ruby accents.",
    primaryColor: "#ff3366",
    bgColor: "#0e1117",
    cardColor: "#161b22",
    isDark: true,
  },
  {
    id: "nordic",
    name: "Nordic Forest",
    subtitle: "Sage & Pine",
    description: "Calming botanical sage paper with evergreen ink and energetic emerald highlights.",
    primaryColor: "#10b981",
    bgColor: "#f0f4ee",
    cardColor: "#ffffff",
    isDark: false,
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk Neon",
    subtitle: "Electric Synthwave",
    description: "Deep cosmic violet nightscape with electric cyan glowing trails and neon vibes.",
    primaryColor: "#06b6d4",
    bgColor: "#0f0c20",
    cardColor: "#1b1735",
    isDark: true,
  },
  {
    id: "sunset",
    name: "Tokyo Sunset",
    subtitle: "Terracotta & Peach",
    description: "Golden hour blush cream with warm terracotta ink and golden peach accents.",
    primaryColor: "#f97316",
    bgColor: "#faf4ed",
    cardColor: "#ffffff",
    isDark: false,
  },
];

interface SettingsViewProps {
  currentTheme: AppTheme;
  onSelectTheme: (theme: AppTheme) => void;
  onNavigate: (view: View) => void;
}

export function SettingsView({
  currentTheme,
  onSelectTheme,
  onNavigate,
}: SettingsViewProps) {
  const currentThemeObj = APP_THEMES.find((t) => t.id === currentTheme) || APP_THEMES[0];

  return (
    <div className="settings-page">
      <div className="page-intro">
        <div>
          <p className="overline">PREFERENCES & CUSTOMIZATION</p>
          <h1>
            Settings<em>.</em>
          </h1>
          <p className="intro-description">
            Customize the player theme, explore repository details, and discover built-in power features.
          </p>
        </div>
        <div className="settings-current-theme-pill">
          <span
            className="theme-dot"
            style={{ background: currentThemeObj.primaryColor }}
          />
          <strong>{currentThemeObj.name}</strong>
        </div>
      </div>

      {/* 1. THEME PICKER SECTION */}
      <section className="settings-section">
        <div className="section-header">
          <div>
            <h2>
              <Palette size={18} /> Color Themes
            </h2>
            <p>Select your favorite visual atmosphere for Rewind.</p>
          </div>
          <span className="small-count">{APP_THEMES.length} Available</span>
        </div>

        <div className="themes-compact-grid">
          {APP_THEMES.map((theme) => {
            const isSelected = currentTheme === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                className={`compact-theme-tile ${isSelected ? "active" : ""}`}
                onClick={() => onSelectTheme(theme.id)}
                aria-pressed={isSelected}
                title={`${theme.name} - ${theme.subtitle}`}
              >
                <div
                  className="compact-theme-swatch"
                  style={{
                    background: theme.bgColor,
                    borderColor: isSelected ? theme.primaryColor : "transparent",
                  }}
                >
                  <div
                    className="compact-swatch-card"
                    style={{ background: theme.cardColor }}
                  >
                    <span
                      className="compact-swatch-accent"
                      style={{ background: theme.primaryColor }}
                    />
                  </div>
                </div>

                <div className="compact-theme-meta">
                  <div className="compact-theme-title-row">
                    <span className="compact-theme-name">{theme.name}</span>
                    <span className={`compact-theme-tag ${theme.isDark ? "dark" : "light"}`}>
                      {theme.isDark ? "DARK" : "LIGHT"}
                    </span>
                  </div>
                  <span className="compact-theme-sub">{theme.subtitle}</span>
                </div>

                {isSelected && (
                  <span
                    className="compact-theme-check"
                    style={{ background: theme.primaryColor }}
                  >
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. PROJECT REPOSITORY SECTION */}
      <section className="settings-section">
        <div className="section-header">
          <div>
            <h2>
              <GithubIcon size={18} /> Project Repository
            </h2>
            <p>Rewind Music Player is open source on GitHub.</p>
          </div>
        </div>

        <div className="github-project-card">
          <div className="github-card-left">
            <div className="github-icon-badge">
              <GithubIcon size={28} />
            </div>
            <div className="github-meta">
              <div className="repo-title-row">
                <h3>Esca-Byte / Rewind-Music</h3>
                <span className="github-version-pill">v1.0.1</span>
                <span className="github-tauri-pill">Tauri v2 Native</span>
              </div>
              <p>
                Desktop music player streaming official YouTube full recordings with high-fidelity sound, custom playlists, and native offline downloads.
              </p>
              <div className="repo-badges-deck">
                <span><ShieldCheck size={13} /> 100% Full Recordings</span>
                <span><Zap size={13} /> Fast Rust Native Backend</span>
                <span><Palette size={13} /> 5 Curated Themes</span>
              </div>
            </div>
          </div>
          <div className="github-card-right">
            <a
              href="https://github.com/Esca-Byte/Rewind-Music"
              target="_blank"
              rel="noreferrer"
              className="primary-button github-open-btn"
            >
              <span>View on GitHub</span>
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </section>

      {/* 3. SUGGESTIONS & POWER TIPS */}
      <section className="settings-section">
        <div className="section-header">
          <div>
            <h2>
              <Sparkles size={18} /> Player Suggestions & Tips
            </h2>
            <p>Helpful recommendations to get the most out of your listening experience.</p>
          </div>
        </div>

        <div className="suggestions-grid">
          <div className="suggestion-card">
            <div className="suggestion-icon">
              <ListMusic size={20} />
            </div>
            <div className="suggestion-body">
              <strong>Import Any YouTube Playlist</strong>
              <p>
                Go to <em>Playlists &rarr; + New Playlist &rarr; Import YouTube Playlist</em> and paste any link or playlist ID (e.g. <code>PL...</code>) to instantly import all tracks into your library.
              </p>
            </div>
          </div>

          <div className="suggestion-card">
            <div className="suggestion-icon">
              <Download size={20} />
            </div>
            <div className="suggestion-body">
              <strong>True Offline Music Downloads</strong>
              <p>
                Click the download arrow on any song to save high-quality audio directly to your computer. Access your files anytime in the Downloads tab or open the local folder directly.
              </p>
              <button
                type="button"
                className="quiet-button folder-quick-open-btn"
                onClick={() => openDownloadsFolder()}
              >
                <FolderOpen size={13} /> Open Downloads Folder
              </button>
            </div>
          </div>

          <div className="suggestion-card">
            <div className="suggestion-icon">
              <Palette size={20} />
            </div>
            <div className="suggestion-body">
              <strong>Personalize Your Atmosphere</strong>
              <p>
                Switch between 5 bespoke themes—including Midnight Vinyl, Cyberpunk Neon, and Warm Analog—to tailor the player's visual atmosphere to your listening mood.
              </p>
            </div>
          </div>

          <div className="suggestion-card">
            <div className="suggestion-icon">
              <Keyboard size={20} />
            </div>
            <div className="suggestion-body">
              <strong>Handy Keyboard Shortcuts</strong>
              <div className="keyboard-shortcuts-list">
                <div>
                  <kbd>Space</kbd>
                  <span>Play or pause current playback</span>
                </div>
                <div>
                  <kbd>⌘ K</kbd> / <kbd>Ctrl K</kbd>
                  <span>Instant YouTube global search</span>
                </div>
                <div>
                  <kbd>Esc</kbd>
                  <span>Dismiss open modals & dialogs</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
