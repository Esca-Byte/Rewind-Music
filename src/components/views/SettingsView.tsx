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
  RefreshCw,
  DownloadCloud,
  Infinity as InfinityIcon,
  SlidersHorizontal,
  Gauge,
} from "lucide-react";
import type { AppTheme, ThemeOption, View } from "@/types/music";
import { SMART_QUEUE_MODES, type SmartQueueModeId } from "@/lib/time/smart-queue";
import {
  EQ_BAND_META,
  EQ_PRESETS,
  PLAYBACK_SPEED_OPTIONS,
  type StudioEqState,
} from "@/lib/audio-eq";
import { openDownloadsFolder } from "@/lib/tauri-audio";
import { openUpdateDownload } from "@/lib/app-updates";
import type { AppUpdatesState } from "@/components/time/use-app-updates";

function GithubIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

export const APP_THEMES: ThemeOption[] = [
  {
    id: "aurora",
    name: "Emerald Studio",
    subtitle: "Dark Glass & Mint",
    description: "A focused dark listening room with deep green surfaces, soft glass panels, and mint controls.",
    primaryColor: "#5ce8bc",
    bgColor: "#061510",
    cardColor: "#0d211b",
    isDark: true,
  },
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
  crossfadeSeconds: number;
  onSetCrossfadeSeconds: (seconds: number) => void;
  autoQueueEnabled: boolean;
  onToggleAutoQueue: (enabled: boolean) => void;
  smartQueueMode: SmartQueueModeId;
  onSelectSmartQueueMode: (mode: SmartQueueModeId) => void;
  eqState: StudioEqState;
  onSetEqEnabled: (enabled: boolean) => void;
  onSetEqBandGain: (bandIndex: number, gainDb: number) => void;
  onSetBassBoost: (strength: number) => void;
  onApplyEqPreset: (presetName: string) => void;
  onSetPlaybackSpeed: (speed: number) => void;
  appUpdates: AppUpdatesState;
}

export function SettingsView({
  currentTheme,
  onSelectTheme,
  onNavigate,
  crossfadeSeconds,
  onSetCrossfadeSeconds,
  autoQueueEnabled,
  onToggleAutoQueue,
  smartQueueMode,
  onSelectSmartQueueMode,
  eqState,
  onSetEqEnabled,
  onSetEqBandGain,
  onSetBassBoost,
  onApplyEqPreset,
  onSetPlaybackSpeed,
  appUpdates,
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

      <section className="settings-section playback-settings-section">
        <div className="section-header">
          <div>
            <h2>
              <Zap size={18} /> Playback Flow
            </h2>
            <p>Choose how Rewind moves from one track to the next. Gapless playback prebuffers when possible, but network conditions may still cause buffering.</p>
          </div>
        </div>
        <div className="playback-flow-options" role="group" aria-label="Track transition mode">
          {[0, 2, 4, 6, 8].map((seconds) => (
            <button
              key={seconds}
              type="button"
              className={`playback-flow-option ${crossfadeSeconds === seconds ? "active" : ""}`}
              onClick={() => onSetCrossfadeSeconds(seconds)}
              aria-pressed={crossfadeSeconds === seconds}
            >
              <strong>{seconds === 0 ? "Gapless" : `${seconds}s`}</strong>
              <span>{seconds === 0 ? "Prebuffered transition; network may still buffer" : "Crossfade overlap"}</span>
            </button>
          ))}
        </div>

        <div className="update-settings-card smart-queue-settings-card">
          <div className="update-settings-copy">
            <strong>
              <InfinityIcon size={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }} />
              Endless Auto-Queue &amp; Smart Radio
            </strong>
            <span>Automatically refill your queue with genre &amp; vibe-matched songs whenever fewer than 5 tracks remain.</span>
          </div>
          <button
            type="button"
            className={`settings-toggle ${autoQueueEnabled ? "active" : ""}`}
            onClick={() => onToggleAutoQueue(!autoQueueEnabled)}
            aria-pressed={autoQueueEnabled}
            aria-label="Enable endless Auto-Queue"
          >
            <span />
          </button>
        </div>

        <div className="smart-queue-settings-modes" role="group" aria-label="Default Smart Queue Vibe">
          {SMART_QUEUE_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={`queue-vibe-chip ${smartQueueMode === mode.id ? "active" : ""}`}
              onClick={() => onSelectSmartQueueMode(mode.id)}
              title={mode.description}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </section>

      {/* STUDIO 5-BAND EQUALIZER & SPEED CONSOLE (Echoic-inspired) */}
      <section className="settings-section studio-eq-section" id="studio-eq">
        <div className="section-header">
          <div>
            <h2>
              <SlidersHorizontal size={18} /> Studio Equalizer &amp; Speed
            </h2>
            <p>Sculpt your 5-band frequency response, bass boost, and playback tempo in real time.</p>
          </div>
          <button
            type="button"
            className={`settings-toggle ${eqState.enabled ? "active" : ""}`}
            onClick={() => onSetEqEnabled(!eqState.enabled)}
            aria-pressed={eqState.enabled}
            aria-label="Enable Studio Equalizer"
          >
            <span />
          </button>
        </div>

        <div className="eq-presets-row" role="group" aria-label="Equalizer presets">
          {EQ_PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              className={`queue-vibe-chip ${eqState.enabled && eqState.preset === preset.name ? "active" : ""}`}
              onClick={() => onApplyEqPreset(preset.name)}
              title={preset.description}
            >
              {preset.name}
            </button>
          ))}
        </div>

        <div className={`eq-console-card ${eqState.enabled ? "is-enabled" : "is-bypassed"}`}>
          <div className="eq-bands-grid">
            {EQ_BAND_META.map((band, index) => {
              const gain = eqState.gains[index] ?? 0;
              return (
                <div key={band.id} className="eq-band-col">
                  <span className="eq-band-db">
                    {gain > 0 ? `+${gain.toFixed(1)}` : gain.toFixed(1)} dB
                  </span>
                  <div className="eq-slider-track">
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      step={0.5}
                      value={gain}
                      onChange={(event) => onSetEqBandGain(index, Number(event.target.value))}
                      aria-label={`${band.label} equalizer band`}
                    />
                  </div>
                  <strong className="eq-band-label">{band.label}</strong>
                </div>
              );
            })}
          </div>

          <div className="eq-bottom-controls">
            <div className="eq-bass-control">
              <div className="eq-control-label">
                <strong>Bass Boost</strong>
                <span>{eqState.bassBoost}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={eqState.bassBoost}
                onChange={(event) => onSetBassBoost(Number(event.target.value))}
                aria-label="Bass boost strength"
              />
            </div>

            <div className="eq-speed-control">
              <div className="eq-control-label">
                <strong>
                  <Gauge size={13} style={{ display: "inline", verticalAlign: "-2px", marginRight: 5 }} />
                  Playback Speed
                </strong>
                <span>{eqState.playbackSpeed}x</span>
              </div>
              <div className="eq-speed-pills">
                {PLAYBACK_SPEED_OPTIONS.map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    className={`queue-vibe-chip ${eqState.playbackSpeed === speed ? "active" : ""}`}
                    onClick={() => onSetPlaybackSpeed(speed)}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="settings-section update-settings-section">
        <div className="section-header">
          <div>
            <h2>
              <DownloadCloud size={18} /> App Updates
            </h2>
            <p>Check GitHub Releases for new Rewind desktop builds and download them when ready.</p>
          </div>
          <span className={`update-status-pill ${appUpdates.status}`}>
            {appUpdates.status === "checking" ? "Checking…" : appUpdates.status === "available" ? "Update available" : appUpdates.status === "up-to-date" ? "Up to date" : `v${appUpdates.currentVersion}`}
          </span>
        </div>
        <div className="update-settings-card">
          <div className="update-settings-copy">
            <strong>Automatically check for updates</strong>
            <span>Rewind checks GitHub when the app opens. Your music and library data stay local.</span>
          </div>
          <button
            type="button"
            className={`settings-toggle ${appUpdates.autoCheck ? "active" : ""}`}
            onClick={() => appUpdates.setAutoCheck(!appUpdates.autoCheck)}
            aria-pressed={appUpdates.autoCheck}
            aria-label="Automatically check for updates"
          >
            <span />
          </button>
          <button
            type="button"
            className="quiet-button update-check-button"
            onClick={() => void appUpdates.checkForUpdates()}
            disabled={appUpdates.status === "checking"}
          >
            <RefreshCw size={13} className={appUpdates.status === "checking" ? "spin" : ""} />
            {appUpdates.status === "checking" ? "Checking…" : "Check now"}
          </button>
        </div>
        {appUpdates.status === "available" && appUpdates.latestRelease && (
          <div className="update-available-card">
            <div>
              <strong>{appUpdates.latestRelease.name}</strong>
              <span>Version {appUpdates.latestRelease.version} is ready on GitHub Releases.</span>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={() => void openUpdateDownload(appUpdates.latestRelease?.installer?.browserDownloadUrl || appUpdates.latestRelease?.releaseUrl || "")}
            >
              <Download size={14} /> Download
            </button>
          </div>
        )}
        {appUpdates.status === "error" && (
          <p className="update-error">Could not check GitHub Releases. {appUpdates.error}</p>
        )}
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
                <span className="github-version-pill">v1.2.3</span>
                <span className="github-tauri-pill">Tauri v2 Native</span>
              </div>
              <p>
                 Desktop music player streaming official YouTube music with high-fidelity sound, custom playlists, and native offline downloads.
              </p>
              <div className="repo-badges-deck">
               <span><ShieldCheck size={13} /> Official Music Tracks</span>
                <span><Zap size={13} /> Fast Rust Native Backend</span>
                <span><Palette size={13} /> {APP_THEMES.length} Curated Themes</span>
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
                Switch between {APP_THEMES.length} bespoke themes—including Emerald Studio, Midnight Vinyl, Cyberpunk Neon, and Warm Analog—to tailor the player&apos;s visual atmosphere to your listening mood.
              </p>
            </div>
          </div>

          <div className="suggestion-card">
            <div className="suggestion-icon">
              <Keyboard size={20} />
            </div>
            <div className="suggestion-body">
                <strong>Keyboard & Media Controls</strong>
                <p>
                  Use Space to play or pause, and use your operating system&apos;s media keys when supported by the OS and WebView. Availability varies by environment.
                </p>
                <div className="keyboard-shortcuts-list">
                <div>
                  <kbd>Space</kbd>
                  <span>Play or pause current playback</span>
                </div>
                <div>
                  <kbd>← →</kbd>
                  <span>Previous or next track</span>
                </div>
                <div>
                  <kbd>N / P</kbd>
                  <span>Next or previous track</span>
                </div>
                <div>
                  <kbd>M</kbd>
                  <span>Mute or unmute playback</span>
                </div>
                <div>
                  <kbd>S / R</kbd>
                  <span>Toggle shuffle or repeat</span>
                </div>
                <div>
                  <kbd>Q</kbd>
                  <span>Open or close the queue</span>
                </div>
                <div>
                  <kbd>L</kbd>
                  <span>Toggle Synced Lyrics Theater</span>
                </div>
                <div>
                  <kbd>Ctrl+K</kbd>
                  <span>Open Command Palette</span>
                </div>
                <div>
                  <kbd>/</kbd>
                  <span>Focus music search</span>
                </div>
                <div>
                  <kbd>Esc</kbd>
                  <span>Close the queue</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
