export interface EqBandConfig {
  id: string;
  frequency: number;
  label: string;
  gainDb: number;
}

export interface EqPreset {
  name: string;
  description: string;
  gains: [number, number, number, number, number];
  bassBoost: number;
}

export interface StudioEqState {
  enabled: boolean;
  preset: string;
  gains: [number, number, number, number, number];
  bassBoost: number; // 0..100
  playbackSpeed: number; // 0.75..1.5
}

export const EQ_BAND_META: ReadonlyArray<{ id: string; frequency: number; label: string }> = [
  { id: "sub", frequency: 60, label: "60Hz" },
  { id: "low", frequency: 230, label: "230Hz" },
  { id: "mid", frequency: 910, label: "910Hz" },
  { id: "high-mid", frequency: 3600, label: "3.6kHz" },
  { id: "air", frequency: 14000, label: "14kHz" },
];

export const PLAYBACK_SPEED_OPTIONS = [0.75, 0.85, 1, 1.15, 1.25, 1.5] as const;

export const EQ_PRESETS: readonly EqPreset[] = [
  {
    name: "Flat",
    description: "Uncolored studio reference",
    gains: [0, 0, 0, 0, 0],
    bassBoost: 0,
  },
  {
    name: "Studio Warmth",
    description: "Rich low-end & crisp sparkle",
    gains: [3, 1.5, 0, 2, 3.5],
    bassBoost: 25,
  },
  {
    name: "Bass Boost",
    description: "Deep punchy sub-bass for hip-hop & EDM",
    gains: [6.5, 4, 0, 1, 2],
    bassBoost: 65,
  },
  {
    name: "Vocal Clarity",
    description: "Forward vocals & acoustic presence",
    gains: [-1.5, 0, 3.5, 4.5, 2],
    bassBoost: 10,
  },
  {
    name: "Late Night",
    description: "Smooth dynamics for low-volume listening",
    gains: [3.5, 2, -1, 1.5, -1],
    bassBoost: 30,
  },
  {
    name: "Treble Sparkle",
    description: "Airy highs & crisp percussion",
    gains: [0.5, 0, 1, 3.5, 5.5],
    bassBoost: 10,
  },
  {
    name: "Acoustic",
    description: "Natural guitar & piano resonance",
    gains: [2, 1, 1.5, 2.5, 3],
    bassBoost: 15,
  },
  {
    name: "Electronic",
    description: "V-shaped synth punch & shimmer",
    gains: [5.5, 2.5, -1.5, 3, 4.5],
    bassBoost: 50,
  },
];

const EQ_STORAGE_KEY = "rewind-studio-eq-v1";

export const DEFAULT_EQ_STATE: StudioEqState = {
  enabled: false,
  preset: "Studio Warmth",
  gains: [3, 1.5, 0, 2, 3.5],
  bassBoost: 25,
  playbackSpeed: 1,
};

export function readStoredEqState(): StudioEqState {
  if (typeof window === "undefined") return DEFAULT_EQ_STATE;
  try {
    const raw = window.localStorage.getItem(EQ_STORAGE_KEY);
    if (!raw) return DEFAULT_EQ_STATE;
    const parsed = JSON.parse(raw) as Partial<StudioEqState>;
    const gains =
      Array.isArray(parsed.gains) && parsed.gains.length === 5
        ? (parsed.gains.map((g) => Math.max(-12, Math.min(12, Number(g) || 0))) as [number, number, number, number, number])
        : DEFAULT_EQ_STATE.gains;
    const speed =
      typeof parsed.playbackSpeed === "number" &&
      PLAYBACK_SPEED_OPTIONS.includes(parsed.playbackSpeed as (typeof PLAYBACK_SPEED_OPTIONS)[number])
        ? parsed.playbackSpeed
        : 1;
    return {
      enabled: Boolean(parsed.enabled),
      preset: typeof parsed.preset === "string" && parsed.preset ? parsed.preset : "Studio Warmth",
      gains,
      bassBoost: Math.max(0, Math.min(100, Number(parsed.bassBoost) || 0)),
      playbackSpeed: speed,
    };
  } catch {
    return DEFAULT_EQ_STATE;
  }
}

export function persistEqState(state: StudioEqState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EQ_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* optional */
  }
}

/**
 * Web Audio 5-Band Studio Equalizer + Bass Boost + Analyser controller.
 * Lazily binds HTMLAudioElements only when enabled so standard playback stays zero-overhead when off.
 */
export class StudioAudioEngine {
  private ctx: AudioContext | null = null;
  private filters: BiquadFilterNode[] = [];
  private bassNode: BiquadFilterNode | null = null;
  private analyser: AnalyserNode | null = null;
  private connectedElements = new WeakSet<HTMLAudioElement>();
  private state: StudioEqState = DEFAULT_EQ_STATE;

  private ensureGraph(): boolean {
    if (typeof window === "undefined") return false;
    if (this.ctx) {
      if (this.ctx.state === "suspended") {
        void this.ctx.resume().catch(() => {});
      }
      return true;
    }
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return false;
    try {
      const ctx = new AudioCtx();
      const filters = EQ_BAND_META.map((band, index) => {
        const node = ctx.createBiquadFilter();
        node.type = index === 0 ? "lowshelf" : index === EQ_BAND_META.length - 1 ? "highshelf" : "peaking";
        node.frequency.value = band.frequency;
        node.Q.value = 1.1;
        node.gain.value = 0;
        return node;
      });
      const bassNode = ctx.createBiquadFilter();
      bassNode.type = "lowshelf";
      bassNode.frequency.value = 85;
      bassNode.gain.value = 0;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.78;

      for (let i = 0; i < filters.length - 1; i += 1) {
        filters[i].connect(filters[i + 1]);
      }
      filters[filters.length - 1].connect(bassNode);
      bassNode.connect(analyser);
      analyser.connect(ctx.destination);

      this.ctx = ctx;
      this.filters = filters;
      this.bassNode = bassNode;
      this.analyser = analyser;
      this.applyNodes();
      return true;
    } catch {
      return false;
    }
  }

  attachAudioElement(audio: HTMLAudioElement | null): void {
    if (!audio || this.connectedElements.has(audio)) return;
    if (!this.state.enabled) return;
    if (!this.ensureGraph() || !this.ctx || !this.filters.length) return;
    try {
      const source = this.ctx.createMediaElementSource(audio);
      source.connect(this.filters[0]);
      this.connectedElements.add(audio);
    } catch {
      // Element already connected or cross-origin restricted
    }
  }

  updateState(next: StudioEqState, elements: Array<HTMLAudioElement | null>): void {
    this.state = next;
    for (const el of elements) {
      if (el) {
        try {
          el.playbackRate = next.playbackSpeed;
        } catch {
          /* ignore */
        }
      }
    }
    if (next.enabled) {
      for (const el of elements) {
        this.attachAudioElement(el);
      }
    }
    this.applyNodes();
  }

  private applyNodes(): void {
    if (!this.ctx || !this.filters.length || !this.bassNode) return;
    const now = this.ctx.currentTime;
    this.filters.forEach((node, index) => {
      const targetGain = this.state.enabled ? this.state.gains[index] : 0;
      node.gain.setTargetAtTime(targetGain, now, 0.03);
    });
    const bassGain = this.state.enabled ? (this.state.bassBoost / 100) * 8 : 0;
    this.bassNode.gain.setTargetAtTime(bassGain, now, 0.03);
  }

  sampleLevels(bars = 7): number[] | null {
    if (!this.analyser || !this.state.enabled) return null;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    const hasSignal = data.some((v) => v > 4);
    if (!hasSignal) return null;
    const step = Math.max(1, Math.floor(data.length / bars));
    const levels: number[] = [];
    for (let i = 0; i < bars; i += 1) {
      const raw = data[Math.min(data.length - 1, i * step)] || 0;
      levels.push(Math.max(0.18, Math.min(1, raw / 220)));
    }
    return levels;
  }
}
