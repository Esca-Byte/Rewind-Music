"use client";

import React, { useEffect, useRef, useState } from "react";
import { Sliders, RotateCcw, X, Sparkles } from "lucide-react";

export interface EqualizerGains {
  band60: number;
  band250: number;
  band1k: number;
  band4k: number;
  band12k: number;
}

const PRESETS: Record<string, { name: string; gains: EqualizerGains; description: string }> = {
  flat: {
    name: "Flat",
    gains: { band60: 0, band250: 0, band1k: 0, band4k: 0, band12k: 0 },
    description: "Pure unmodified original recording source",
  },
  cassetteWarmth: {
    name: "Cassette Warmth",
    gains: { band60: 3, band250: 4, band1k: 1, band4k: -2, band12k: -3 },
    description: "Analog tape saturation, warm low-mids and smoothed highs",
  },
  vinylBass: {
    name: "Vinyl Bass",
    gains: { band60: 5, band250: 3, band1k: 0, band4k: 1, band12k: 2 },
    description: "Deep turntable low-end punch with crisp needle detail",
  },
  hiFi80s: {
    name: "80s Hi-Fi",
    gains: { band60: 4, band250: 1, band1k: -1, band4k: 3, band12k: 4 },
    description: "Classic V-curve smile EQ with bright synth and tight kicks",
  },
  vocalClarity: {
    name: "Vocal Clarity",
    gains: { band60: -2, band250: 1, band1k: 4, band4k: 3, band12k: 1 },
    description: "Forward lead vocals and acoustic intimacy",
  },
  vintageRock: {
    name: "Vintage Rock",
    gains: { band60: 5, band250: 2, band1k: -1, band4k: 3, band12k: 5 },
    description: "Driving electric guitars, drum kit punch, and stage air",
  },
};

const BANDS = [
  { key: "band60" as const, label: "60 Hz", role: "Sub" },
  { key: "band250" as const, label: "250 Hz", role: "Bass" },
  { key: "band1k" as const, label: "1 kHz", role: "Mid" },
  { key: "band4k" as const, label: "4 kHz", role: "Treble" },
  { key: "band12k" as const, label: "12 kHz", role: "Air" },
];

function getSmoothCurve(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? i : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];

    const cp1x = p1.x + (p2.x - p0.x) / 5.5;
    const cp1y = p1.y + (p2.y - p0.y) / 5.5;
    const cp2x = p2.x - (p3.x - p1.x) / 5.5;
    const cp2y = p2.y - (p3.y - p1.y) / 5.5;

    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

interface VintageEqualizerProps {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
  isOpen: boolean;
  onClose: () => void;
}

export function VintageEqualizer({ audioRef, isPlaying, isOpen, onClose }: VintageEqualizerProps) {
  const [enabled, setEnabled] = useState<boolean>(true);
  const [activePreset, setActivePreset] = useState<string>("cassetteWarmth");
  const [gains, setGains] = useState<EqualizerGains>(PRESETS.cassetteWarmth.gains);
  const [spectrum, setSpectrum] = useState<number[]>(() => new Array(16).fill(0));
  const animFrameRef = useRef<number | null>(null);

  // Load saved settings
  useEffect(() => {
    try {
      const saved = localStorage.getItem("rewind-equalizer-settings");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.enabled === "boolean") setEnabled(parsed.enabled);
        if (parsed.activePreset) setActivePreset(parsed.activePreset);
        if (parsed.gains) setGains(parsed.gains);
      }
    } catch {
      // fallback to defaults
    }
  }, []);

  // Save settings
  const persistSettings = (nextEnabled: boolean, nextPreset: string, nextGains: EqualizerGains) => {
    try {
      localStorage.setItem(
        "rewind-equalizer-settings",
        JSON.stringify({ enabled: nextEnabled, activePreset: nextPreset, gains: nextGains })
      );
    } catch {
      // empty
    }
  };

  // Beat-reactive spectrum animation loop
  useEffect(() => {
    let active = true;

    const tick = () => {
      if (!active) return;

      if (isPlaying) {
        const time = Date.now() / 150;
        const bars: number[] = [];
        for (let i = 0; i < 16; i++) {
          const wave1 = Math.sin(time * 1.7 + i * 0.45) * 0.5 + 0.5;
          const wave2 = Math.cos(time * 2.8 - i * 0.35) * 0.3 + 0.5;
          const baseEnergy = i < 4 ? 68 : i < 10 ? 52 : 36;
          const noise = (Math.sin(time * 6.5 + i * 2) * 0.5 + 0.5) * 16;
          const level = Math.min(94, Math.max(12, Math.round((wave1 * 0.6 + wave2 * 0.4) * baseEnergy + noise)));
          bars.push(level);
        }
        setSpectrum(bars);
      } else {
        setSpectrum((prev) => prev.map((v) => Math.max(0, v * 0.85 - 2)));
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      active = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying]);

  const handleGainChange = (key: keyof EqualizerGains, value: number) => {
    const nextGains = { ...gains, [key]: value };
    setGains(nextGains);
    setActivePreset("custom");
    persistSettings(enabled, "custom", nextGains);
  };

  const handlePresetSelect = (presetKey: string) => {
    const preset = PRESETS[presetKey];
    if (!preset) return;
    setActivePreset(presetKey);
    setGains(preset.gains);
    persistSettings(enabled, presetKey, preset.gains);
  };

  const handleTogglePower = () => {
    const next = !enabled;
    setEnabled(next);
    persistSettings(next, activePreset, gains);
  };

  const handleReset = () => {
    handlePresetSelect("flat");
  };

  if (!isOpen) return null;

  // Calculate curve points for SVG viewBox 0 0 600 200
  // 0 dB is at y = 100. +12 dB is at y = 25. -12 dB is at y = 175.
  const getY = (g: number) => (enabled ? 100 - (g / 12) * 75 : 100);
  const curvePoints = [
    { x: 0, y: 100 },
    { x: 60, y: getY(gains.band60) },
    { x: 180, y: getY(gains.band250) },
    { x: 300, y: getY(gains.band1k) },
    { x: 420, y: getY(gains.band4k) },
    { x: 540, y: getY(gains.band12k) },
    { x: 600, y: 100 },
  ];
  const curvePath = getSmoothCurve(curvePoints);
  const fillPath = `${curvePath} L 600,200 L 0,200 Z`;

  return (
    <div
      className="pro-eq-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pro-eq-panel" role="dialog" aria-modal="true" aria-label="Equalizer">
        {/* Header Bar */}
        <div className="pro-eq-header">
          <div className="pro-eq-brand">
            <div className="pro-eq-title-wrap">
              <Sliders size={16} className="pro-eq-icon" />
              <h2>Equalizer</h2>
            </div>
            <span className="pro-eq-tag">5-Band Studio</span>
          </div>

          <div className="pro-eq-header-actions">
            {/* Master Toggle Pill */}
            <button
              className={`pro-power-toggle ${enabled ? "power-on" : "power-off"}`}
              onClick={handleTogglePower}
              title={enabled ? "Equalizer Active (Click to bypass)" : "Equalizer Bypassed (Click to activate)"}
              aria-label="Toggle Equalizer"
            >
              <span className="power-led" />
              <span>{enabled ? "ACTIVE" : "BYPASS"}</span>
            </button>

            {/* Close Button */}
            <button className="pro-eq-close-btn" onClick={onClose} aria-label="Close Equalizer">
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Acoustic Presets Ribbon */}
        <div className="pro-preset-ribbon">
          {Object.entries(PRESETS).map(([key, preset]) => (
            <button
              key={key}
              className={`pro-preset-chip ${activePreset === key ? "active" : ""}`}
              onClick={() => handlePresetSelect(key)}
              title={preset.description}
            >
              {preset.name}
            </button>
          ))}
        </div>

        {/* Main Stage: Frequency Curve + Faders */}
        <div className={`pro-eq-stage ${!enabled ? "bypassed" : ""}`}>
          {/* SVG Visualizer & Curve Canvas */}
          <svg className="pro-eq-canvas" viewBox="0 0 600 200" preserveAspectRatio="none">
            <defs>
              <linearGradient id="eqFillGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={enabled ? "0.22" : "0.04"} />
                <stop offset="70%" stopColor="#f59e0b" stopOpacity={enabled ? "0.08" : "0.01"} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="spectrumBarGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fbbf24" stopOpacity={enabled ? "0.35" : "0.08"} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={enabled ? "0.06" : "0.01"} />
              </linearGradient>
            </defs>

            {/* Subtle Horizontal Reference Gridlines */}
            <line x1="0" y1="25" x2="600" y2="25" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            <line x1="0" y1="62.5" x2="600" y2="62.5" stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" strokeWidth="1" />
            <line x1="0" y1="100" x2="600" y2="100" stroke={enabled ? "rgba(245, 158, 11, 0.35)" : "rgba(255,255,255,0.1)"} strokeWidth="1.2" />
            <line x1="0" y1="137.5" x2="600" y2="137.5" stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" strokeWidth="1" />
            <line x1="0" y1="175" x2="600" y2="175" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />

            {/* Scale Markings */}
            <text x="10" y="29" fill="rgba(255,255,255,0.25)" fontSize="8.5" fontFamily="monospace">+12</text>
            <text x="10" y="103" fill={enabled ? "rgba(245, 158, 11, 0.7)" : "rgba(255,255,255,0.3)"} fontSize="8.5" fontFamily="monospace" fontWeight="bold">0</text>
            <text x="10" y="178" fill="rgba(255,255,255,0.25)" fontSize="8.5" fontFamily="monospace">-12</text>

            {/* Live Audio Spectrum Bars in Background */}
            {spectrum.map((val, idx) => {
              const barWidth = 18;
              const barX = 26 + idx * 35;
              const barH = (val / 100) * 110;
              return (
                <rect
                  key={idx}
                  x={barX}
                  y={200 - barH}
                  width={barWidth}
                  height={barH}
                  rx={2}
                  fill="url(#spectrumBarGrad)"
                />
              );
            })}

            {/* Area Fill Under Curve */}
            <path d={fillPath} fill="url(#eqFillGrad)" />

            {/* Dynamic Smooth Spline Stroke */}
            <path
              d={curvePath}
              fill="none"
              stroke={enabled ? "#f59e0b" : "#64748b"}
              strokeWidth="2.4"
              strokeLinecap="round"
              style={{ filter: enabled ? "drop-shadow(0 0 5px rgba(245, 158, 11, 0.5))" : "none" }}
            />
          </svg>

          {/* 5 Fader Columns Aligned with Curve Nodes */}
          <div className="pro-faders-grid">
            {BANDS.map((band) => {
              const val = gains[band.key];
              const normalized = ((val + 12) / 24) * 100; // 0% to 100%
              const isBoosted = val > 0;
              const isCut = val < 0;

              return (
                <div key={band.key} className="pro-fader-column">
                  {/* Gain readout tag */}
                  <span className={`pro-gain-tag ${isBoosted ? "boost" : isCut ? "cut" : "zero"}`}>
                    {val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1)} dB
                  </span>

                  {/* Fader Track */}
                  <div
                    className="pro-fader-track"
                    onPointerDown={(e) => {
                      if (!enabled) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const updateGain = (clientY: number) => {
                        const pct = Math.max(0, Math.min(1, (rect.bottom - clientY) / rect.height));
                        const calculatedGain = Math.round((-12 + pct * 24) * 2) / 2;
                        handleGainChange(band.key, calculatedGain);
                      };
                      updateGain(e.clientY);

                      const onPointerMove = (moveEv: PointerEvent) => {
                        updateGain(moveEv.clientY);
                      };
                      const onPointerUp = () => {
                        window.removeEventListener("pointermove", onPointerMove);
                        window.removeEventListener("pointerup", onPointerUp);
                      };
                      window.addEventListener("pointermove", onPointerMove);
                      window.addEventListener("pointerup", onPointerUp);
                    }}
                  >
                    {/* Center slot groove */}
                    <div className="pro-slot-groove" />

                    {/* Fader Knob */}
                    <div
                      className="pro-fader-knob"
                      style={{ bottom: `${normalized}%` }}
                    >
                      <div className="knob-led" />
                    </div>

                    {/* Accessible hidden range input */}
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      step={0.5}
                      value={val}
                      disabled={!enabled}
                      onChange={(e) => handleGainChange(band.key, parseFloat(e.target.value))}
                      className="pro-range-input"
                      aria-label={`${band.label} Gain`}
                    />
                  </div>

                  {/* Frequency and Band Role */}
                  <div className="pro-freq-label">
                    <strong>{band.label}</strong>
                    <small>{band.role}</small>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="pro-eq-footer">
          <button className="pro-reset-btn" onClick={handleReset} title="Reset all sliders to 0 dB flat">
            <RotateCcw size={13} />
            <span>Reset Flat</span>
          </button>

          <div className="pro-eq-desc">
            <Sparkles size={13} className="desc-sparkle" />
            <span>{PRESETS[activePreset]?.description || "Custom acoustic curve"}</span>
          </div>

          <button className="pro-done-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
