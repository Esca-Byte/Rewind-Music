"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { isTimeTrack, type TimeTrack } from "@/lib/time/types";
import {
  songDeduplicationSignature,
  SMART_QUEUE_MODES,
  type RepeatMode,
  type SmartQueueModeId,
} from "@/lib/time/smart-queue";
import { resolveAudioStreamUrl, invalidateStreamCache, isTauriEnvironment } from "@/lib/tauri-audio";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  createAudioTransitionController,
  type AudioTransitionController,
} from "@/lib/audio-transition";
import {
  EQ_PRESETS,
  persistEqState,
  readStoredEqState,
  StudioAudioEngine,
  type StudioEqState,
} from "@/lib/audio-eq";

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";

export interface SmartQueueFetcherArgs {
  seedTrack: TimeTrack;
  evolvingSeeds: TimeTrack[];
  mode: SmartQueueModeId;
  excludeIds: Set<string>;
  excludeSignatures: Set<string>;
}

export type AddToQueueResult = "added" | "promoted" | "already-playing" | "already-in-queue";

const CROSSFADE_OPTIONS = [0, 2, 4, 6, 8] as const;
const CROSSFADE_STORAGE_KEY = "rewind-crossfade-seconds";
const AUTO_QUEUE_STORAGE_KEY = "rewind-auto-queue-enabled";
const SMART_MODE_STORAGE_KEY = "rewind-smart-queue-mode";
const SESSION_STORAGE_KEY = "rewind-playback-session-v1";
const PRELOAD_LEAD_SECONDS = 12;
const AUTO_QUEUE_REFILL_THRESHOLD = 5;

function readCrossfadeSetting(): number {
  if (typeof window === "undefined") return 4;
  try {
    const value = Number(window.localStorage.getItem(CROSSFADE_STORAGE_KEY));
    return CROSSFADE_OPTIONS.includes(value as (typeof CROSSFADE_OPTIONS)[number]) ? value : 4;
  } catch {
    return 4;
  }
}

function readAutoQueueSetting(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(AUTO_QUEUE_STORAGE_KEY);
    return raw === null ? true : raw === "true";
  } catch {
    return true;
  }
}

function readSmartModeSetting(): SmartQueueModeId {
  if (typeof window === "undefined") return "auto";
  try {
    const raw = window.localStorage.getItem(SMART_MODE_STORAGE_KEY);
    if (raw && SMART_QUEUE_MODES.some((m) => m.id === raw)) {
      return raw as SmartQueueModeId;
    }
    return "auto";
  } catch {
    return "auto";
  }
}

export function trackIdentityKey(track: Pick<TimeTrack, "id" | "videoId">): string {
  return track.videoId || track.id;
}

function sameTrack(left: TimeTrack | null | undefined, right: TimeTrack | null | undefined): boolean {
  if (!left || !right) return false;
  const sameId = Boolean(left.id && right.id) && left.id === right.id;
  const sameVideo = Boolean(left.videoId && right.videoId) && left.videoId === right.videoId;
  return sameId || sameVideo;
}

function shuffleArray<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

interface PersistedPlaybackSession {
  currentTrack: TimeTrack;
  queue: TimeTrack[];
  autoQueuedKeys: string[];
  position: number;
  repeatMode: RepeatMode;
  shuffle: boolean;
  savedAt: number;
}

interface PreloadEntry {
  track: TimeTrack;
  audio: HTMLAudioElement;
  epoch: number;
  ready: Promise<HTMLAudioElement>;
}

export function useTimePlayer(
  initial: TimeTrack,
  onListen: (track: TimeTrack) => void,
  onTrackError?: (track: TimeTrack, errorMsg: string) => void,
  offlineOnly = false,
  fetchAutoQueue?: (args: SmartQueueFetcherArgs) => Promise<TimeTrack[]>,
  options?: {
    volumeMultiplier?: number;
    onBeforeAdvanceOnEnded?: () => boolean;
  }
) {
  const volumeMultiplier = options?.volumeMultiplier ?? 1;
  const onBeforeAdvanceRef = useRef(options?.onBeforeAdvanceOnEnded);
  useEffect(() => {
    onBeforeAdvanceRef.current = options?.onBeforeAdvanceOnEnded;
  }, [options?.onBeforeAdvanceOnEnded]);

  const [eqState, setEqStateInternal] = useState<StudioEqState>(readStoredEqState);
  const eqEngine = useMemo(() => new StudioAudioEngine(), []);
  const eqStateRef = useRef(eqState);
  useEffect(() => {
    eqStateRef.current = eqState;
    persistEqState(eqState);
  }, [eqState]);
  const [track, setTrack] = useState(initial);
  const [queue, setQueue] = useState<TimeTrack[]>([initial]);
  const [autoQueuedKeyList, setAutoQueuedKeyList] = useState<string[]>([]);
  const [autoQueueEnabled, setAutoQueueEnabledState] = useState<boolean>(readAutoQueueSetting);
  const [smartQueueMode, setSmartQueueModeState] = useState<SmartQueueModeId>(readSmartModeSetting);
  const [isRefillingAutoQueue, setIsRefillingAutoQueue] = useState(false);

  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(initial.duration);
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatModeState] = useState<RepeatMode>("off");
  const [crossfadeSeconds, setCrossfadeSecondsState] = useState(readCrossfadeSetting);
  const [error, setError] = useState("");

  const autoQueuedIds = useMemo(() => new Set(autoQueuedKeyList), [autoQueuedKeyList]);
  const repeat = repeatMode === "one";

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const primaryAudioRef = useRef<HTMLAudioElement | null>(null);
  const transitionAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const transitionTargetRef = useRef<TimeTrack | null>(null);
  const preloadRef = useRef<PreloadEntry | null>(null);
  const preloadCleanupRef = useRef<(() => void) | null>(null);
  const operationEpochRef = useRef(0);
  const autoQueueEpochRef = useRef(0);
  const autoQueueInFlightRef = useRef(false);
  const retryCountRef = useRef(0);
  const pendingStartRef = useRef<{ track: TimeTrack; epoch: number } | null>(null);
  const loggedTrackId = useRef("");
  const onListenRef = useRef(onListen);
  const onTrackErrorRef = useRef(onTrackError);
  const fetchAutoQueueRef = useRef(fetchAutoQueue);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSkipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<((nextTrack: TimeTrack, list?: TimeTrack[], resume?: number, options?: { recordHistory?: boolean; preserveAutoQueue?: boolean }) => void) | null>(null);
  const nextRef = useRef<((direction?: number) => void) | null>(null);
  const handleTrackFailureRef = useRef<((failedTrack: TimeTrack, reason: string) => void) | null>(null);
  const replenishRef = useRef<((options?: { force?: boolean; replaceExistingAuto?: boolean; modeOverride?: SmartQueueModeId; playFirstFetched?: boolean }) => Promise<TimeTrack[]>) | null>(null);

  // Echoic-style queue memory: unshuffled backup, play history stack, and session dedup sets
  const unshuffledQueueBackupRef = useRef<TimeTrack[]>([]);
  const playHistoryStackRef = useRef<TimeTrack[]>([]);
  const sessionAutoIdsRef = useRef<Set<string>>(new Set());
  const sessionAutoSigsRef = useRef<Set<string>>(new Set());
  const sessionRestoredRef = useRef(false);
  const lastSessionSaveRef = useRef(0);

  const transitionController = useMemo<AudioTransitionController>(
    () => createAudioTransitionController(0.85, false),
    []
  );

  const values = useRef({
    track,
    queue,
    autoQueuedIds,
    autoQueueEnabled,
    smartQueueMode,
    status,
    position,
    volume,
    muted,
    shuffle,
    repeatMode,
  });

  useEffect(() => { onListenRef.current = onListen; }, [onListen]);
  useEffect(() => { onTrackErrorRef.current = onTrackError; }, [onTrackError]);
  useEffect(() => { fetchAutoQueueRef.current = fetchAutoQueue; }, [fetchAutoQueue]);
  useEffect(() => {
    values.current = {
      track,
      queue,
      autoQueuedIds,
      autoQueueEnabled,
      smartQueueMode,
      status,
      position,
      volume,
      muted,
      shuffle,
      repeatMode,
    };
  }, [
    track,
    queue,
    autoQueuedIds,
    autoQueueEnabled,
    smartQueueMode,
    status,
    position,
    volume,
    muted,
    shuffle,
    repeatMode,
  ]);

  const setAutoQueuedSet = useCallback((nextSet: Set<string>) => {
    values.current.autoQueuedIds = nextSet;
    setAutoQueuedKeyList(Array.from(nextSet));
  }, []);

  // Restore last playback session on client mount (Echoic PlaybackSessionStore pattern)
  useEffect(() => {
    if (sessionRestoredRef.current || typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      if (sessionRestoredRef.current) return;
      sessionRestoredRef.current = true;
      try {
        const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Partial<PersistedPlaybackSession>;
        if (!parsed.currentTrack || !isTimeTrack(parsed.currentTrack)) return;
        const validQueue = Array.isArray(parsed.queue)
          ? parsed.queue.filter(isTimeTrack).slice(0, 80)
          : [];
        const restoredQueue = validQueue.some((t) => sameTrack(t, parsed.currentTrack))
          ? validQueue
          : [parsed.currentTrack, ...validQueue];
        const restoredAuto = Array.isArray(parsed.autoQueuedKeys)
          ? parsed.autoQueuedKeys.filter((k): k is string => typeof k === "string")
          : [];
        const restoredRepeat: RepeatMode =
          parsed.repeatMode === "all" || parsed.repeatMode === "one" ? parsed.repeatMode : "off";
        const restoredPos =
          typeof parsed.position === "number" && Number.isFinite(parsed.position) && parsed.position > 0
            ? Math.min(parsed.position, Math.max(0, (parsed.currentTrack.duration || 180) - 2))
            : 0;

        setTrack(parsed.currentTrack);
        values.current.track = parsed.currentTrack;
        setQueue(restoredQueue);
        values.current.queue = restoredQueue;
        setAutoQueuedSet(new Set(restoredAuto));
        setPosition(restoredPos);
        values.current.position = restoredPos;
        setDuration(parsed.currentTrack.duration || 180);
        setRepeatModeState(restoredRepeat);
        values.current.repeatMode = restoredRepeat;
        if (typeof parsed.shuffle === "boolean") {
          setShuffle(parsed.shuffle);
          values.current.shuffle = parsed.shuffle;
        }
      } catch {
        // Corrupted session snapshot is safely ignored
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [setAutoQueuedSet]);

  const persistSession = useCallback((force = false) => {
    if (typeof window === "undefined" || !sessionRestoredRef.current) return;
    const now = Date.now();
    if (!force && now - lastSessionSaveRef.current < 4000) return;
    lastSessionSaveRef.current = now;
    try {
      const current = values.current;
      const payload: PersistedPlaybackSession = {
        currentTrack: current.track,
        queue: current.queue.slice(0, 80),
        autoQueuedKeys: Array.from(current.autoQueuedIds).slice(0, 60),
        position: Math.max(0, current.position),
        repeatMode: current.repeatMode,
        shuffle: current.shuffle,
        savedAt: now,
      };
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Optional storage
    }
  }, []);

  useEffect(() => {
    persistSession(true);
  }, [track, queue, autoQueuedKeyList, repeatMode, shuffle, persistSession]);

  useEffect(() => {
    const effectiveVolume = Math.max(0, Math.min(1, volume * volumeMultiplier));
    transitionController.setOutput(effectiveVolume, muted);
    if (!transitionController.active) {
      for (const audio of [primaryAudioRef.current, transitionAudioRef.current]) {
        if (audio) {
          audio.volume = effectiveVolume;
          audio.muted = muted;
        }
      }
    }
  }, [transitionController, volume, volumeMultiplier, muted]);

  useEffect(() => {
    eqEngine.updateState(eqState, [primaryAudioRef.current, transitionAudioRef.current]);
  }, [eqEngine, eqState]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CROSSFADE_STORAGE_KEY, String(crossfadeSeconds));
    } catch {
      /* optional */
    }
  }, [crossfadeSeconds]);

  useEffect(() => {
    try {
      window.localStorage.setItem(AUTO_QUEUE_STORAGE_KEY, String(autoQueueEnabled));
    } catch {
      /* optional */
    }
  }, [autoQueueEnabled]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SMART_MODE_STORAGE_KEY, smartQueueMode);
    } catch {
      /* optional */
    }
  }, [smartQueueMode]);

  const clearTimers = useCallback(() => {
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
    if (autoSkipTimerRef.current) {
      clearTimeout(autoSkipTimerRef.current);
      autoSkipTimerRef.current = null;
    }
  }, []);

  const clearPreload = useCallback(() => {
    preloadCleanupRef.current?.();
    preloadCleanupRef.current = null;
    const entry = preloadRef.current;
    preloadRef.current = null;
    if (entry) {
      entry.audio.pause();
      if (entry.audio !== audioRef.current) {
        entry.audio.removeAttribute("src");
        entry.audio.load();
      }
    }
  }, []);

  const cancelTransitionWork = useCallback((pauseBoth: boolean) => {
    operationEpochRef.current += 1;
    pendingStartRef.current = null;
    transitionTargetRef.current = null;
    transitionController.cancel();
    clearPreload();
    if (pauseBoth) {
      primaryAudioRef.current?.pause();
      transitionAudioRef.current?.pause();
    }
  }, [clearPreload, transitionController]);

  useEffect(() => {
    return () => {
      clearTimers();
      cancelTransitionWork(true);
    };
  }, [cancelTransitionWork, clearTimers]);

  const setPrimaryAudio = useCallback((audio: HTMLAudioElement | null) => {
    if (audio) {
      primaryAudioRef.current = audio;
      audio.playbackRate = eqStateRef.current.playbackSpeed;
      if (eqStateRef.current.enabled) {
        eqEngine.attachAudioElement(audio);
      }
      if (!activeAudioRef.current) {
        activeAudioRef.current = audio;
        audioRef.current = audio;
      }
    } else {
      primaryAudioRef.current = null;
    }
  }, [eqEngine]);

  const setTransitionAudio = useCallback((audio: HTMLAudioElement | null) => {
    transitionAudioRef.current = audio;
    if (audio) {
      audio.playbackRate = eqStateRef.current.playbackSpeed;
      if (eqStateRef.current.enabled) {
        eqEngine.attachAudioElement(audio);
      }
    }
  }, [eqEngine]);

  const resolveTrackSource = useCallback(async (targetTrack: TimeTrack): Promise<string> => {
    if (targetTrack.filePath && isTauriEnvironment()) {
      try {
        const localSrc = convertFileSrc(targetTrack.filePath);
        if (localSrc) return localSrc;
      } catch (err) {
        console.warn("Failed to convert local file source, falling back to YouTube:", err);
      }
    }
    if (offlineOnly) {
      throw new Error("Offline mode is enabled. Download this song before playing it.");
    }
    return resolveAudioStreamUrl(targetTrack.videoId);
  }, [offlineOnly]);

  const trimSessionMemory = useCallback(() => {
    if (sessionAutoIdsRef.current.size > 350) {
      const kept = Array.from(sessionAutoIdsRef.current).slice(-250);
      sessionAutoIdsRef.current = new Set(kept);
    }
    if (sessionAutoSigsRef.current.size > 350) {
      const kept = Array.from(sessionAutoSigsRef.current).slice(-250);
      sessionAutoSigsRef.current = new Set(kept);
    }
  }, []);

  const appendAutoQueuedTracks = useCallback((newTracks: TimeTrack[], replaceExistingAuto = false) => {
    const current = values.current;
    const activeIndex = Math.max(0, current.queue.findIndex((t) => sameTrack(t, current.track)));
    let baseQueue = current.queue;
    let nextAutoIds = new Set(current.autoQueuedIds);

    if (replaceExistingAuto) {
      const firstAutoAfterActive = current.queue.findIndex(
        (t, idx) => idx > activeIndex && current.autoQueuedIds.has(trackIdentityKey(t))
      );
      if (firstAutoAfterActive >= 0) {
        const removed = current.queue.slice(firstAutoAfterActive);
        baseQueue = current.queue.slice(0, firstAutoAfterActive);
        removed.forEach((t) => nextAutoIds.delete(trackIdentityKey(t)));
      }
    }

    const existingKeys = new Set(baseQueue.flatMap((t) => [t.id, t.videoId, trackIdentityKey(t)].filter(Boolean)));
    const existingSigs = new Set(baseQueue.map(songDeduplicationSignature));

    const uniqueNew = newTracks.filter((candidate) => {
      const key = trackIdentityKey(candidate);
      if (existingKeys.has(candidate.id) || existingKeys.has(candidate.videoId) || existingKeys.has(key)) {
        return false;
      }
      const sig = songDeduplicationSignature(candidate);
      if (existingSigs.has(sig)) return false;
      existingKeys.add(candidate.id);
      if (candidate.videoId) existingKeys.add(candidate.videoId);
      existingKeys.add(key);
      existingSigs.add(sig);
      return true;
    });

    if (!uniqueNew.length && !replaceExistingAuto) return [];

    uniqueNew.forEach((item) => {
      const key = trackIdentityKey(item);
      nextAutoIds.add(key);
      sessionAutoIdsRef.current.add(key);
      if (item.id) sessionAutoIdsRef.current.add(item.id);
      sessionAutoSigsRef.current.add(songDeduplicationSignature(item));
    });
    trimSessionMemory();

    const updatedQueue = [...baseQueue, ...uniqueNew];
    values.current.queue = updatedQueue;
    setQueue(updatedQueue);
    setAutoQueuedSet(nextAutoIds);
    return uniqueNew;
  }, [setAutoQueuedSet, trimSessionMemory]);

  const maybeReplenishAutoQueue = useCallback(async (options?: {
    force?: boolean;
    replaceExistingAuto?: boolean;
    modeOverride?: SmartQueueModeId;
    playFirstFetched?: boolean;
  }): Promise<TimeTrack[]> => {
    const fetcher = fetchAutoQueueRef.current;
    if (!fetcher) return [];

    const force = Boolean(options?.force);
    const replaceExistingAuto = Boolean(options?.replaceExistingAuto);
    const current = values.current;
    const mode = options?.modeOverride ?? current.smartQueueMode;

    if (!force && !current.autoQueueEnabled) return [];
    if (!force && current.repeatMode !== "off") return [];

    const activeTrack = current.track;
    if (!activeTrack) return [];

    const currentIndex = current.queue.findIndex((t) => sameTrack(t, activeTrack));
    const remainingAhead = currentIndex >= 0
      ? current.queue.length - 1 - currentIndex
      : current.queue.length - 1;

    if (!force && !replaceExistingAuto && remainingAhead >= AUTO_QUEUE_REFILL_THRESHOLD) {
      return [];
    }
    if (!force && !replaceExistingAuto && autoQueueInFlightRef.current) {
      return [];
    }

    const reqEpoch = ++autoQueueEpochRef.current;
    autoQueueInFlightRef.current = true;
    setIsRefillingAutoQueue(true);

    const anchorTail = replaceExistingAuto
      ? activeTrack
      : (current.queue[current.queue.length - 1] || activeTrack);

    const recentSeeds = [
      ...current.queue.slice(Math.max(0, currentIndex - 2), currentIndex + 1).reverse(),
      ...playHistoryStackRef.current.slice(-3).reverse(),
    ].filter((t) => !sameTrack(t, anchorTail));

    // When replacing auto tail (e.g. changing genre or refreshing), only exclude explicit tracks + active track
    const baseForExclusion = replaceExistingAuto
      ? current.queue.filter(
          (t, idx) => idx <= Math.max(0, currentIndex) || !current.autoQueuedIds.has(trackIdentityKey(t))
        )
      : current.queue;

    const excludeIds = new Set<string>([
      ...baseForExclusion.flatMap((t) => [t.id, t.videoId, trackIdentityKey(t)].filter(Boolean)),
      ...(replaceExistingAuto ? [] : Array.from(sessionAutoIdsRef.current)),
    ]);
    const excludeSignatures = new Set<string>([
      ...baseForExclusion.map(songDeduplicationSignature),
      ...(replaceExistingAuto ? [] : Array.from(sessionAutoSigsRef.current)),
    ]);

    try {
      const fetched = await fetcher({
        seedTrack: anchorTail,
        evolvingSeeds: recentSeeds.slice(0, 2),
        mode,
        excludeIds,
        excludeSignatures,
      });

      if (reqEpoch !== autoQueueEpochRef.current) {
        return [];
      }

      const added = appendAutoQueuedTracks(fetched, replaceExistingAuto);
      if (options?.playFirstFetched && added.length > 0) {
        startRef.current?.(added[0], values.current.queue, 0, {
          recordHistory: true,
          preserveAutoQueue: true,
        });
      }
      return added;
    } catch (err) {
      console.warn("[AutoQueue] Failed to fetch smart queue tracks:", err);
      return [];
    } finally {
      if (reqEpoch === autoQueueEpochRef.current) {
        autoQueueInFlightRef.current = false;
        setIsRefillingAutoQueue(false);
      }
    }
  }, [appendAutoQueuedTracks]);

  useEffect(() => {
    replenishRef.current = maybeReplenishAutoQueue;
  }, [maybeReplenishAutoQueue]);

  // Select the next track linearly from the queue (shuffle reorders the queue itself like Echoic/Spotify!)
  const selectNextTrack = useCallback((current: typeof values.current = values.current): TimeTrack | null => {
    if (current.queue.length < 2) return null;
    const currentIndex = current.queue.findIndex((candidate) => sameTrack(candidate, current.track));
    if (currentIndex < 0) {
      const first = current.queue[0];
      return first && !sameTrack(first, current.track) ? first : null;
    }
    if (currentIndex + 1 < current.queue.length) {
      const candidate = current.queue[currentIndex + 1];
      return candidate && !sameTrack(candidate, current.track) ? candidate : null;
    }
    if (current.repeatMode === "all") {
      const wrapped = current.queue[0];
      return wrapped && !sameTrack(wrapped, current.track) ? wrapped : null;
    }
    return null;
  }, []);

  const playSource = useCallback((
    src: string,
    targetTrack: TimeTrack,
    resume: number,
    epoch: number,
    audio: HTMLAudioElement
  ) => {
    if (
      epoch !== operationEpochRef.current ||
      audio !== audioRef.current ||
      !sameTrack(values.current.track, targetTrack) ||
      values.current.status === "paused"
    ) return;

    if (audio.src !== src) {
      audio.src = src;
      audio.load();
    }
    try {
      audio.playbackRate = eqStateRef.current.playbackSpeed;
    } catch {
      /* ignore */
    }
    if (eqStateRef.current.enabled) {
      eqEngine.attachAudioElement(audio);
    }
    if (resume > 0 && Number.isFinite(resume)) {
      try { audio.currentTime = resume; } catch { /* metadata may not be available yet */ }
    }

    let playResult: Promise<void>;
    try {
      playResult = audio.play();
    } catch {
      handleTrackFailureRef.current?.(targetTrack, "Playback failed");
      return;
    }
    void playResult.then(() => {
      if (
        epoch !== operationEpochRef.current ||
        audio !== audioRef.current ||
        !sameTrack(values.current.track, targetTrack)
      ) {
        audio.pause();
        return;
      }
      clearTimers();
      pendingStartRef.current = null;
      setStatus("playing");
      values.current.status = "playing";
      setError("");
      retryCountRef.current = 0;
      if (loggedTrackId.current !== targetTrack.id) {
        loggedTrackId.current = targetTrack.id;
        onListenRef.current(targetTrack);
      }
    }).catch((err: unknown) => {
      if (epoch !== operationEpochRef.current || audio !== audioRef.current) return;
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setStatus("paused");
        values.current.status = "paused";
        return;
      }
      console.warn(`[Player] Play failed for "${targetTrack.title}":`, err);
      handleTrackFailureRef.current?.(targetTrack, "Playback failed");
    });
  }, [clearTimers, eqEngine]);

  const triggerAutoSkip = useCallback((failedTrack: TimeTrack, reason: string) => {
    clearTimers();
    setStatus("error");
    values.current.status = "error";
    setError(reason);
    onTrackErrorRef.current?.(failedTrack, reason);
    if (values.current.queue.length > 1 || values.current.autoQueueEnabled) {
      const epoch = operationEpochRef.current;
      autoSkipTimerRef.current = setTimeout(() => {
        if (epoch === operationEpochRef.current && sameTrack(values.current.track, failedTrack)) {
          nextRef.current?.(1);
        }
      }, 1200);
    }
  }, [clearTimers]);

  const handleTrackFailure = useCallback((failedTrack: TimeTrack, reason: string) => {
    if (!sameTrack(values.current.track, failedTrack) || values.current.status === "paused") return;
    invalidateStreamCache(failedTrack.videoId);
    clearTimers();
    if (retryCountRef.current === 0) {
      retryCountRef.current = 1;
      const epoch = operationEpochRef.current;
      setStatus("loading");
      values.current.status = "loading";
      loadingTimerRef.current = setTimeout(() => {
        if (epoch === operationEpochRef.current && sameTrack(values.current.track, failedTrack)) {
          triggerAutoSkip(failedTrack, reason);
        }
      }, 12000);
      void resolveAudioStreamUrl(failedTrack.videoId, true)
        .then((src) => {
          const audio = audioRef.current;
          if (audio && epoch === operationEpochRef.current && sameTrack(values.current.track, failedTrack)) {
            playSource(src, failedTrack, values.current.position, epoch, audio);
          }
        })
        .catch(() => {
          if (epoch === operationEpochRef.current && sameTrack(values.current.track, failedTrack)) {
            triggerAutoSkip(failedTrack, reason);
          }
        });
      return;
    }
    triggerAutoSkip(failedTrack, reason);
  }, [clearTimers, playSource, triggerAutoSkip]);

  useEffect(() => {
    handleTrackFailureRef.current = handleTrackFailure;
  }, [handleTrackFailure]);

  const next = useCallback((direction = 1) => {
    clearTimers();
    const current = values.current;
    if (!current.queue.length) return;
    const currentIndex = current.queue.findIndex((candidate) => sameTrack(candidate, current.track));

    if (direction > 0) {
      // If at the end of the queue:
      if (currentIndex < 0 || currentIndex >= current.queue.length - 1) {
        if (current.repeatMode === "off" && current.autoQueueEnabled) {
          // Echoic endless skip-next: fetch a fresh wave and play immediately!
          void replenishRef.current?.({ force: true, playFirstFetched: true }).then((added) => {
            if (!added.length && current.queue.length > 1) {
              const first = current.queue[0];
              if (first && !sameTrack(first, current.track)) {
                startRef.current?.(first, current.queue, 0, { preserveAutoQueue: true });
              }
            }
          });
          return;
        }
        if (current.queue.length > 1) {
          const wrapped = current.queue[0];
          if (wrapped && !sameTrack(wrapped, current.track)) {
            startRef.current?.(wrapped, current.queue, 0, { preserveAutoQueue: true });
          }
        }
        return;
      }

      const candidate = current.queue[currentIndex + 1];
      if (candidate && !sameTrack(candidate, current.track)) {
        startRef.current?.(candidate, current.queue, 0, { preserveAutoQueue: true });
      }
      return;
    }

    // Backwards direction
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : current.queue.length - 1;
    const candidate = current.queue[prevIndex];
    if (candidate && !sameTrack(candidate, current.track)) {
      startRef.current?.(candidate, current.queue, 0, {
        recordHistory: false,
        preserveAutoQueue: true,
      });
    }
  }, [clearTimers]);

  useEffect(() => {
    nextRef.current = next;
  }, [next]);

  const ensurePreloaded = useCallback(async (nextTrack: TimeTrack, epoch: number): Promise<HTMLAudioElement> => {
    const active = audioRef.current;
    const incoming = active === primaryAudioRef.current ? transitionAudioRef.current : primaryAudioRef.current;
    if (!incoming) throw new Error("Transition audio is unavailable");
    const existing = preloadRef.current;
    if (existing && existing.epoch === epoch && existing.audio === incoming && sameTrack(existing.track, nextTrack)) {
      return existing.ready;
    }
    clearPreload();
    const entry: PreloadEntry = {
      track: nextTrack,
      audio: incoming,
      epoch,
      ready: Promise.resolve(incoming),
    };
    const ready = resolveTrackSource(nextTrack).then((src) => {
      if (epoch !== operationEpochRef.current || (transitionTargetRef.current && !sameTrack(transitionTargetRef.current, nextTrack))) {
        throw new DOMException("Stale preload", "AbortError");
      }
      incoming.src = src;
      incoming.load();
      return new Promise<HTMLAudioElement>((resolve, reject) => {
        let timeout: ReturnType<typeof setTimeout> | null = null;
        const cleanup = () => {
          incoming.removeEventListener("canplay", onReady);
          incoming.removeEventListener("loadeddata", onReady);
          incoming.removeEventListener("error", onError);
          if (timeout) clearTimeout(timeout);
          if (preloadCleanupRef.current === cleanup) preloadCleanupRef.current = null;
        };
        const onReady = () => {
          if (incoming.readyState < 3) return;
          cleanup();
          resolve(incoming);
        };
        const onError = () => { cleanup(); reject(new Error("Incoming audio could not be loaded")); };
        preloadCleanupRef.current = cleanup;
        if (incoming.readyState >= 3) {
          onReady();
          return;
        }
        incoming.addEventListener("canplay", onReady);
        incoming.addEventListener("loadeddata", onReady);
        incoming.addEventListener("error", onError);
        timeout = setTimeout(() => {
          cleanup();
          reject(new Error("Incoming audio preload timed out"));
        }, 12000);
      });
    });
    entry.ready = ready;
    preloadRef.current = entry;
    return ready;
  }, [clearPreload, resolveTrackSource]);

  const preloadNextTrack = useCallback(async (force = false) => {
    const current = values.current;
    if (current.repeatMode === "one") return;
    const nextTrack = selectNextTrack(current);
    const audio = audioRef.current;
    if (!nextTrack || !audio) return;
    const remaining = Number.isFinite(audio.duration) ? audio.duration - audio.currentTime : Infinity;
    if (!force && remaining > Math.max(PRELOAD_LEAD_SECONDS, crossfadeSeconds + 8)) return;
    const epoch = operationEpochRef.current;
    try {
      await ensurePreloaded(nextTrack, epoch);
    } catch {
      if (preloadRef.current?.epoch === epoch && sameTrack(preloadRef.current.track, nextTrack)) {
        clearPreload();
      }
    }
  }, [clearPreload, crossfadeSeconds, ensurePreloaded, selectNextTrack]);

  const promoteIncoming = useCallback((nextTrack: TimeTrack, incoming: HTMLAudioElement) => {
    const previousTrack = values.current.track;
    if (previousTrack && !sameTrack(previousTrack, nextTrack)) {
      const stack = playHistoryStackRef.current;
      if (!stack.length || !sameTrack(stack[stack.length - 1], previousTrack)) {
        stack.push(previousTrack);
        if (stack.length > 50) stack.shift();
      }
    }

    // Once an auto-queued track becomes active, promote it out of autoQueuedIds
    const nextKey = trackIdentityKey(nextTrack);
    if (values.current.autoQueuedIds.has(nextKey)) {
      const updatedAuto = new Set(values.current.autoQueuedIds);
      updatedAuto.delete(nextKey);
      setAutoQueuedSet(updatedAuto);
    }

    activeAudioRef.current = incoming;
    audioRef.current = incoming;
    transitionTargetRef.current = null;
    preloadCleanupRef.current?.();
    preloadCleanupRef.current = null;
    preloadRef.current = null;
    setTrack(nextTrack);
    values.current.track = nextTrack;
    const nextPosition = Number.isFinite(incoming.currentTime) ? incoming.currentTime : 0;
    const nextDuration = Number.isFinite(incoming.duration) && incoming.duration > 0
      ? incoming.duration
      : nextTrack.duration || 180;
    setPosition(nextPosition);
    values.current.position = nextPosition;
    setDuration(nextDuration);
    setStatus("playing");
    values.current.status = "playing";
    setError("");
    retryCountRef.current = 0;
    if (loggedTrackId.current !== nextTrack.id) {
      loggedTrackId.current = nextTrack.id;
      onListenRef.current(nextTrack);
    }
    void replenishRef.current?.();
  }, [setAutoQueuedSet]);

  const beginTransition = useCallback(async (nextTrack: TimeTrack, durationSeconds: number) => {
    const outgoing = audioRef.current;
    const incoming = outgoing === primaryAudioRef.current ? transitionAudioRef.current : primaryAudioRef.current;
    if (!outgoing || !incoming || transitionTargetRef.current) return;
    const epoch = operationEpochRef.current;
    transitionTargetRef.current = nextTrack;
    try {
      const prepared = await ensurePreloaded(nextTrack, epoch);
      if (epoch !== operationEpochRef.current || !sameTrack(transitionTargetRef.current, nextTrack)) return;
      const completed = await transitionController.transition(outgoing, prepared, { durationSeconds });
      if (!completed || epoch !== operationEpochRef.current || !sameTrack(transitionTargetRef.current, nextTrack)) return;
      promoteIncoming(nextTrack, prepared);
    } catch (err) {
      if (epoch === operationEpochRef.current && sameTrack(transitionTargetRef.current, nextTrack)) {
        transitionTargetRef.current = null;
        incoming.pause();
        if (durationSeconds === 0 && outgoing.ended) {
          startRef.current?.(nextTrack, values.current.queue, 0, { preserveAutoQueue: true });
        }
      }
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        console.warn(`[Player] Transition failed for "${nextTrack.title}":`, err);
      }
    }
  }, [ensurePreloaded, promoteIncoming, transitionController]);

  const start = useCallback((
    nextTrack: TimeTrack,
    list?: TimeTrack[],
    resume = 0,
    options?: { recordHistory?: boolean; preserveAutoQueue?: boolean }
  ) => {
    clearTimers();
    cancelTransitionWork(true);
    retryCountRef.current = 0;
    const epoch = operationEpochRef.current;
    const audio = activeAudioRef.current || primaryAudioRef.current;
    if (!audio) return;

    const prevTrack = values.current.track;
    const shouldRecordHistory = options?.recordHistory ?? true;
    if (shouldRecordHistory && prevTrack && !sameTrack(prevTrack, nextTrack)) {
      const stack = playHistoryStackRef.current;
      if (!stack.length || !sameTrack(stack[stack.length - 1], prevTrack)) {
        stack.push(prevTrack);
        if (stack.length > 50) stack.shift();
      }
    }

    const existingQueue = values.current.queue;
    const isNavigatingExisting =
      Boolean(options?.preserveAutoQueue) ||
      (Boolean(list?.length) &&
        list!.length === existingQueue.length &&
        list!.every((item, idx) => sameTrack(item, existingQueue[idx])));

    activeAudioRef.current = audio;
    audioRef.current = audio;
    setTrack(nextTrack);
    values.current.track = nextTrack;

    if (list?.length) {
      const effectiveQueue = list.some((t) => sameTrack(t, nextTrack)) ? list : [nextTrack, ...list];
      setQueue(effectiveQueue);
      values.current.queue = effectiveQueue;
    }

    if (!isNavigatingExisting) {
      autoQueueEpochRef.current += 1;
      autoQueueInFlightRef.current = false;
      setIsRefillingAutoQueue(false);
      setAutoQueuedSet(new Set());
      if (!values.current.shuffle) {
        unshuffledQueueBackupRef.current = [];
      }
    } else {
      // Promote active track out of autoQueuedIds once it begins playing
      const key = trackIdentityKey(nextTrack);
      if (values.current.autoQueuedIds.has(key)) {
        const nextAuto = new Set(values.current.autoQueuedIds);
        nextAuto.delete(key);
        setAutoQueuedSet(nextAuto);
      }
    }

    sessionAutoIdsRef.current.add(trackIdentityKey(nextTrack));
    sessionAutoSigsRef.current.add(songDeduplicationSignature(nextTrack));
    trimSessionMemory();

    setPosition(resume);
    values.current.position = resume;
    setDuration(nextTrack.duration || 180);
    setError("");
    setStatus("loading");
    values.current.status = "loading";
    pendingStartRef.current = { track: nextTrack, epoch };
    loadingTimerRef.current = setTimeout(() => {
      if (
        epoch === operationEpochRef.current &&
        values.current.status === "loading" &&
        sameTrack(values.current.track, nextTrack)
      ) {
        console.warn(`[Player] Loading timed out for "${nextTrack.title}"`);
        handleTrackFailureRef.current?.(nextTrack, "Stream timed out");
      }
    }, 12000);

    // Proactively hydrate endless Auto-Queue when < 5 tracks remain ahead!
    void replenishRef.current?.();

    void resolveTrackSource(nextTrack)
      .then((src) => {
        if (epoch === operationEpochRef.current && sameTrack(values.current.track, nextTrack)) {
          playSource(src, nextTrack, resume, epoch, audio);
        }
      })
      .catch((err) => {
        if (epoch !== operationEpochRef.current || !sameTrack(values.current.track, nextTrack)) return;
        console.error(`[Player] Audio resolve error for "${nextTrack.title}":`, err);
        handleTrackFailureRef.current?.(nextTrack, "Could not extract audio stream");
      });
  }, [cancelTransitionWork, clearTimers, playSource, resolveTrackSource, setAutoQueuedSet, trimSessionMemory]);

  useEffect(() => {
    startRef.current = start;
  }, [start]);

  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (values.current.status === "playing" && audio && !audio.paused) return;
    if (values.current.status === "loading" && pendingStartRef.current) return;
    if (!audio || !audio.getAttribute("src")) {
      startRef.current?.(values.current.track, values.current.queue, values.current.position, {
        recordHistory: false,
        preserveAutoQueue: true,
      });
      return;
    }
    const epoch = operationEpochRef.current;
    try {
      await audio.play();
      if (epoch !== operationEpochRef.current || audio !== audioRef.current) return;
      setStatus("playing");
      values.current.status = "playing";
      void preloadNextTrack(true);
    } catch (err) {
      if (epoch !== operationEpochRef.current) return;
      if (err instanceof DOMException && (err.name === "AbortError" || err.name === "NotAllowedError")) return;
      startRef.current?.(values.current.track, values.current.queue, values.current.position, {
        recordHistory: false,
        preserveAutoQueue: true,
      });
    }
  }, [preloadNextTrack]);

  const pause = useCallback(() => {
    const active = audioRef.current;
    if (active && Number.isFinite(active.currentTime)) {
      setPosition(active.currentTime);
      values.current.position = active.currentTime;
    }
    cancelTransitionWork(true);
    clearTimers();
    setStatus("paused");
    values.current.status = "paused";
    persistSession(true);
  }, [cancelTransitionWork, clearTimers, persistSession]);

  const toggle = useCallback(async () => {
    const audio = audioRef.current;
    if (values.current.status === "playing" && audio && !audio.paused) {
      pause();
    } else {
      await play();
    }
  }, [pause, play]);

  const choose = useCallback((nextTrack: TimeTrack, list?: TimeTrack[]) => {
    const existingQueue = values.current.queue;
    const isSameList =
      Boolean(list?.length) &&
      list!.length === existingQueue.length &&
      list!.every((item, idx) => sameTrack(item, existingQueue[idx]));

    if (sameTrack(values.current.track, nextTrack) && audioRef.current?.getAttribute("src") && values.current.status !== "error") {
      if (list?.length && !isSameList) {
        cancelTransitionWork(false);
        setQueue(list);
        values.current.queue = list;
        setAutoQueuedSet(new Set());
      }
      void toggle();
      return;
    }
    start(nextTrack, list, 0, { preserveAutoQueue: isSameList });
  }, [cancelTransitionWork, setAutoQueuedSet, start, toggle]);

  /**
   * Echoic pattern: slots [nextTrack] immediately after the currently playing track
   * and promotes it out of the Auto-Queued tier.
   */
  const playNext = useCallback((nextTrack: TimeTrack) => {
    cancelTransitionWork(false);
    const currentTrack = values.current.track;
    if (sameTrack(currentTrack, nextTrack)) return;
    const key = trackIdentityKey(nextTrack);
    if (values.current.autoQueuedIds.has(key)) {
      const nextAuto = new Set(values.current.autoQueuedIds);
      nextAuto.delete(key);
      setAutoQueuedSet(nextAuto);
    }
    setQueue((prevQueue) => {
      const filtered = prevQueue.filter((candidate) => !sameTrack(candidate, nextTrack));
      const currentIndex = filtered.findIndex((candidate) => sameTrack(candidate, currentTrack));
      const insertAt = currentIndex < 0 ? 1 : currentIndex + 1;
      filtered.splice(insertAt, 0, nextTrack);
      values.current.queue = filtered;
      return filtered;
    });
  }, [cancelTransitionWork, setAutoQueuedSet]);

  /**
   * Echoic pattern: inserts [nextTrack] at the end of the Explicit Up Next tier
   * (BEFORE the first Auto-Queued song!) and promotes it if it was sitting in the auto tail.
   */
  const addToQueue = useCallback((nextTrack: TimeTrack): AddToQueueResult => {
    const currentTrack = values.current.track;
    if (sameTrack(currentTrack, nextTrack)) return "already-playing";

    const currentQueue = values.current.queue;
    const autoIds = values.current.autoQueuedIds;
    const key = trackIdentityKey(nextTrack);
    const existingIdx = currentQueue.findIndex((candidate) => sameTrack(candidate, nextTrack));
    const wasAutoQueued = existingIdx >= 0 && autoIds.has(key);

    if (existingIdx >= 0 && !wasAutoQueued) {
      return "already-in-queue";
    }

    cancelTransitionWork(false);
    const nextQueue = [...currentQueue];
    if (existingIdx >= 0) {
      nextQueue.splice(existingIdx, 1);
    }

    const nextAuto = new Set(autoIds);
    nextAuto.delete(key);
    setAutoQueuedSet(nextAuto);

    const activeIndex = Math.max(0, nextQueue.findIndex((candidate) => sameTrack(candidate, currentTrack)));
    const firstAutoAfterActive = nextQueue.findIndex(
      (candidate, idx) => idx > activeIndex && nextAuto.has(trackIdentityKey(candidate))
    );
    const insertIndex = firstAutoAfterActive >= 0 ? firstAutoAfterActive : nextQueue.length;
    nextQueue.splice(insertIndex, 0, nextTrack);

    values.current.queue = nextQueue;
    setQueue(nextQueue);
    return wasAutoQueued ? "promoted" : "added";
  }, [cancelTransitionWork, setAutoQueuedSet]);

  const removeFromQueue = useCallback((indexToRemove: number) => {
    cancelTransitionWork(false);
    const currentQueue = values.current.queue;
    if (indexToRemove < 0 || indexToRemove >= currentQueue.length) return;
    const target = currentQueue[indexToRemove];
    if (sameTrack(target, values.current.track)) return;

    const newQueue = currentQueue.filter((_, idx) => idx !== indexToRemove);
    const nextAuto = new Set(values.current.autoQueuedIds);
    nextAuto.delete(trackIdentityKey(target));

    values.current.queue = newQueue;
    setQueue(newQueue);
    setAutoQueuedSet(nextAuto);
    void replenishRef.current?.();
  }, [cancelTransitionWork, setAutoQueuedSet]);

  const clearQueue = useCallback((regenerateAuto = false) => {
    cancelTransitionWork(false);
    autoQueueEpochRef.current += 1;
    autoQueueInFlightRef.current = false;
    setIsRefillingAutoQueue(false);
    unshuffledQueueBackupRef.current = [];
    const singleQueue = [values.current.track];
    values.current.queue = singleQueue;
    setQueue(singleQueue);
    setAutoQueuedSet(new Set());
    if (regenerateAuto && values.current.autoQueueEnabled) {
      void replenishRef.current?.({ force: true, replaceExistingAuto: true });
    }
  }, [cancelTransitionWork, setAutoQueuedSet]);

  const reorderQueue = useCallback((fromIndex: number, toIndex: number) => {
    cancelTransitionWork(false);
    const prevQueue = values.current.queue;
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= prevQueue.length ||
      toIndex >= prevQueue.length ||
      fromIndex === toIndex ||
      sameTrack(prevQueue[fromIndex], values.current.track) ||
      sameTrack(prevQueue[toIndex], values.current.track)
    ) {
      return;
    }

    const nextQueue = [...prevQueue];
    const [moved] = nextQueue.splice(fromIndex, 1);
    nextQueue.splice(toIndex, 0, moved);

    // Echoic promotion rule: dragging an Auto-Queued song above any Explicit song promotes it
    const nextAuto = new Set(values.current.autoQueuedIds);
    const movedKey = trackIdentityKey(moved);
    if (nextAuto.has(movedKey)) {
      const activeIdx = Math.max(0, nextQueue.findIndex((t) => sameTrack(t, values.current.track)));
      const hasExplicitAfter = nextQueue.some(
        (t, idx) => idx > toIndex && idx > activeIdx && !nextAuto.has(trackIdentityKey(t))
      );
      if (hasExplicitAfter || toIndex <= activeIdx) {
        nextAuto.delete(movedKey);
        setAutoQueuedSet(nextAuto);
      }
    }

    values.current.queue = nextQueue;
    setQueue(nextQueue);
  }, [cancelTransitionWork, setAutoQueuedSet]);

  const startSongRadio = useCallback((seedTrack: TimeTrack, modeOverride?: SmartQueueModeId) => {
    const modeToUse = modeOverride ?? values.current.smartQueueMode;
    if (modeOverride) {
      values.current.smartQueueMode = modeOverride;
      setSmartQueueModeState(modeOverride);
    }
    if (!values.current.autoQueueEnabled) {
      values.current.autoQueueEnabled = true;
      setAutoQueueEnabledState(true);
    }
    if (values.current.repeatMode !== "off") {
      values.current.repeatMode = "off";
      setRepeatModeState("off");
    }

    const isAlreadyPlayingSeed =
      sameTrack(values.current.track, seedTrack) &&
      Boolean(audioRef.current?.getAttribute("src")) &&
      values.current.status !== "error";

    autoQueueEpochRef.current += 1;
    autoQueueInFlightRef.current = false;
    setIsRefillingAutoQueue(false);
    unshuffledQueueBackupRef.current = [];
    setAutoQueuedSet(new Set());

    if (isAlreadyPlayingSeed) {
      const singleQueue = [values.current.track];
      values.current.queue = singleQueue;
      setQueue(singleQueue);
      if (values.current.status !== "playing") {
        void play();
      }
      void replenishRef.current?.({
        force: true,
        replaceExistingAuto: true,
        modeOverride: modeToUse,
      });
    } else {
      start(seedTrack, [seedTrack], 0, { preserveAutoQueue: false });
      void replenishRef.current?.({
        force: true,
        replaceExistingAuto: true,
        modeOverride: modeToUse,
      });
    }
  }, [play, setAutoQueuedSet, start]);

  const setAutoQueueEnabled = useCallback((enabled: boolean) => {
    values.current.autoQueueEnabled = enabled;
    setAutoQueueEnabledState(enabled);
    if (enabled) {
      void replenishRef.current?.({ force: false });
    } else {
      // Cancel any in-flight refill and trim purely auto-queued tracks after current
      autoQueueEpochRef.current += 1;
      autoQueueInFlightRef.current = false;
      setIsRefillingAutoQueue(false);
      const current = values.current;
      const activeIdx = Math.max(0, current.queue.findIndex((t) => sameTrack(t, current.track)));
      const cleaned = current.queue.filter(
        (t, idx) => idx <= activeIdx || !current.autoQueuedIds.has(trackIdentityKey(t))
      );
      values.current.queue = cleaned;
      setQueue(cleaned);
      setAutoQueuedSet(new Set());
    }
  }, [setAutoQueuedSet]);

  const setSmartQueueMode = useCallback((mode: SmartQueueModeId, refreshImmediately = true) => {
    values.current.smartQueueMode = mode;
    setSmartQueueModeState(mode);
    if (!values.current.autoQueueEnabled) {
      values.current.autoQueueEnabled = true;
      setAutoQueueEnabledState(true);
    }
    if (refreshImmediately) {
      void replenishRef.current?.({
        force: true,
        replaceExistingAuto: true,
        modeOverride: mode,
      });
    }
  }, []);

  const refreshAutoQueue = useCallback(() => {
    if (!values.current.autoQueueEnabled) {
      values.current.autoQueueEnabled = true;
      setAutoQueueEnabledState(true);
    }
    void replenishRef.current?.({
      force: true,
      replaceExistingAuto: true,
    });
  }, []);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(seconds)) return;
    cancelTransitionWork(false);
    const nextPosition = Math.max(0, seconds);
    try { audio.currentTime = nextPosition; } catch { /* media metadata is not ready */ }
    setPosition(nextPosition);
    values.current.position = nextPosition;
    persistSession(true);
  }, [cancelTransitionWork, persistSession]);

  const previous = useCallback(() => {
    if (values.current.position > 3) {
      seek(0);
      return;
    }

    // Echoic-style play history stack navigation
    const currentTrack = values.current.track;
    const stack = playHistoryStackRef.current;
    let prevFromHistory: TimeTrack | null = null;
    while (stack.length > 0) {
      const candidate = stack.pop()!;
      if (!sameTrack(candidate, currentTrack)) {
        prevFromHistory = candidate;
        break;
      }
    }

    if (prevFromHistory) {
      const currentQueue = values.current.queue;
      const targetQueue = currentQueue.some((t) => sameTrack(t, prevFromHistory!))
        ? currentQueue
        : [prevFromHistory, ...currentQueue];
      startRef.current?.(prevFromHistory, targetQueue, 0, {
        recordHistory: false,
        preserveAutoQueue: true,
      });
      return;
    }

    next(-1);
  }, [next, seek]);

  const handleTimeUpdate = useCallback((event: SyntheticEvent<HTMLAudioElement>) => {
    const audio = event.currentTarget;
    if (audio !== audioRef.current || !Number.isFinite(audio.currentTime)) return;
    setPosition(audio.currentTime);
    values.current.position = audio.currentTime;
    persistSession(false);
    void preloadNextTrack(false);
    if (values.current.repeatMode === "one" || transitionTargetRef.current) return;
    const nextTrack = selectNextTrack(values.current);
    if (!nextTrack || crossfadeSeconds <= 0 || values.current.status !== "playing") return;
    if (Number.isFinite(audio.duration) && audio.duration - audio.currentTime <= crossfadeSeconds) {
      void beginTransition(nextTrack, crossfadeSeconds);
    }
  }, [beginTransition, crossfadeSeconds, persistSession, preloadNextTrack, selectNextTrack]);

  const handleLoadedMetadata = useCallback((event: SyntheticEvent<HTMLAudioElement>) => {
    const audio = event.currentTarget;
    if (audio === audioRef.current && Number.isFinite(audio.duration) && audio.duration > 0) {
      setDuration(audio.duration);
    }
  }, []);

  const handlePlay = useCallback((event: SyntheticEvent<HTMLAudioElement>) => {
    if (event.currentTarget !== audioRef.current) return;
    clearTimers();
    setStatus("playing");
    values.current.status = "playing";
    setError("");
    const current = values.current.track;
    if (loggedTrackId.current !== current.id) {
      loggedTrackId.current = current.id;
      onListenRef.current(current);
    }
    void preloadNextTrack(true);
    void replenishRef.current?.();
  }, [clearTimers, preloadNextTrack]);

  const handlePause = useCallback((event: SyntheticEvent<HTMLAudioElement>) => {
    if (event.currentTarget !== audioRef.current) return;
    if (values.current.status !== "loading") {
      setStatus("paused");
      values.current.status = "paused";
    }
  }, []);

  const handleWaiting = useCallback((event: SyntheticEvent<HTMLAudioElement>) => {
    if (event.currentTarget !== audioRef.current || values.current.status === "paused") return;
    setStatus("loading");
    values.current.status = "loading";
  }, []);

  const handleEnded = useCallback((event: SyntheticEvent<HTMLAudioElement>) => {
    if (event.currentTarget !== audioRef.current) return;
    clearTimers();
    if (transitionTargetRef.current) return;

    // Sleep timer "Stop after current track" check
    if (onBeforeAdvanceRef.current?.()) {
      setStatus("paused");
      values.current.status = "paused";
      setPosition(0);
      values.current.position = 0;
      return;
    }

    if (values.current.repeatMode === "one" && audioRef.current) {
      audioRef.current.currentTime = 0;
      void audioRef.current.play().catch(() => {});
      return;
    }

    const nextTrack = selectNextTrack(values.current);
    if (nextTrack && crossfadeSeconds === 0) {
      void beginTransition(nextTrack, 0);
    } else if (nextTrack) {
      startRef.current?.(nextTrack, values.current.queue, 0, { preserveAutoQueue: true });
    } else if (values.current.autoQueueEnabled && values.current.repeatMode === "off") {
      // Queue ended with Auto-Queue ON: fetch a fresh wave and continue seamlessly
      void replenishRef.current?.({ force: true, playFirstFetched: true }).then((added) => {
        if (!added.length) {
          setStatus("paused");
          values.current.status = "paused";
          setPosition(0);
          values.current.position = 0;
        }
      });
    } else {
      setStatus("paused");
      values.current.status = "paused";
      setPosition(0);
      values.current.position = 0;
    }
  }, [beginTransition, clearTimers, crossfadeSeconds, selectNextTrack]);

  const handleError = useCallback((event: SyntheticEvent<HTMLAudioElement>) => {
    if (event.currentTarget !== audioRef.current || values.current.status === "paused") return;
    clearTimers();
    const currentTrack = values.current.track;
    const mediaErr = event.currentTarget.error;
    let reason = "Audio stream unavailable";
    if (mediaErr) {
      if (mediaErr.code === 2) reason = "Network connection interrupted";
      else if (mediaErr.code === 3) reason = "Audio decode failure";
      else if (mediaErr.code === 4) reason = "Stream format not supported or expired";
    }
    console.error(`[Player] HTML5 Audio error on "${currentTrack.title}":`, reason);
    handleTrackFailure(currentTrack, reason);
  }, [clearTimers, handleTrackFailure]);

  const setCrossfadeSeconds = useCallback((seconds: number) => {
    if (!CROSSFADE_OPTIONS.includes(seconds as (typeof CROSSFADE_OPTIONS)[number])) return;
    if (seconds === crossfadeSeconds) return;
    cancelTransitionWork(false);
    setCrossfadeSecondsState(seconds);
  }, [cancelTransitionWork, crossfadeSeconds]);

  const setRepeatMode = useCallback((nextMode: RepeatMode) => {
    if (nextMode === values.current.repeatMode) return;
    cancelTransitionWork(false);
    values.current.repeatMode = nextMode;
    setRepeatModeState(nextMode);
    if (nextMode === "off" && values.current.autoQueueEnabled) {
      void replenishRef.current?.();
    }
  }, [cancelTransitionWork]);

  const cycleRepeatMode = useCallback((): RepeatMode => {
    const nextMode: RepeatMode =
      values.current.repeatMode === "off"
        ? "all"
        : values.current.repeatMode === "all"
        ? "one"
        : "off";
    setRepeatMode(nextMode);
    return nextMode;
  }, [setRepeatMode]);

  const setRepeatSafe = useCallback((nextRepeat: boolean) => {
    setRepeatMode(nextRepeat ? "one" : "off");
  }, [setRepeatMode]);

  /**
   * Echoic-style two-tier non-destructive shuffle:
   * - Turning ON pins the current track at index 0, shuffles explicit upcoming tracks first,
   *   and auto-queued tracks second, while saving an unshuffled backup.
   * - Turning OFF restores the exact original order!
   */
  const setShuffleSafe = useCallback((nextShuffle: boolean) => {
    if (nextShuffle === values.current.shuffle) return;
    cancelTransitionWork(false);
    values.current.shuffle = nextShuffle;
    setShuffle(nextShuffle);

    const currentList = values.current.queue;
    const activeSong = values.current.track;
    const autoIds = values.current.autoQueuedIds;

    if (nextShuffle) {
      if (currentList.length > 0 && unshuffledQueueBackupRef.current.length === 0) {
        unshuffledQueueBackupRef.current = currentList;
      }
      if (currentList.length > 1) {
        const others = currentList.filter((t) => !sameTrack(t, activeSong));
        const explicitUpcoming = shuffleArray(others.filter((t) => !autoIds.has(trackIdentityKey(t))));
        const autoUpcoming = shuffleArray(others.filter((t) => autoIds.has(trackIdentityKey(t))));
        const reordered = [activeSong, ...explicitUpcoming, ...autoUpcoming];
        values.current.queue = reordered;
        setQueue(reordered);
      }
    } else if (unshuffledQueueBackupRef.current.length > 0) {
      const currentByKey = new Map(currentList.map((t) => [trackIdentityKey(t), t]));
      const restoredCore = unshuffledQueueBackupRef.current
        .map((t) => currentByKey.get(trackIdentityKey(t)) || (sameTrack(t, activeSong) ? activeSong : null))
        .filter((t): t is TimeTrack => Boolean(t));
      const restoredKeys = new Set(restoredCore.map(trackIdentityKey));
      const appendedExtras = currentList.filter((t) => !restoredKeys.has(trackIdentityKey(t)));
      const restoredQueue = [...restoredCore, ...appendedExtras];
      unshuffledQueueBackupRef.current = [];
      values.current.queue = restoredQueue;
      setQueue(restoredQueue);
    }
  }, [cancelTransitionWork]);

  const setEqEnabled = useCallback((enabled: boolean) => {
    setEqStateInternal((prev) => ({ ...prev, enabled }));
  }, []);

  const setEqBandGain = useCallback((bandIndex: number, gainDb: number) => {
    const clamped = Math.max(-12, Math.min(12, Math.round(gainDb * 2) / 2));
    setEqStateInternal((prev) => {
      const gains = [...prev.gains] as [number, number, number, number, number];
      if (bandIndex >= 0 && bandIndex < 5) gains[bandIndex] = clamped;
      return { ...prev, enabled: true, preset: "Custom", gains };
    });
  }, []);

  const setBassBoost = useCallback((bassBoost: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(bassBoost)));
    setEqStateInternal((prev) => ({ ...prev, enabled: true, bassBoost: clamped }));
  }, []);

  const applyEqPreset = useCallback((presetName: string) => {
    const found = EQ_PRESETS.find((p) => p.name === presetName);
    if (!found) return;
    setEqStateInternal((prev) => ({
      ...prev,
      enabled: true,
      preset: found.name,
      gains: [...found.gains] as [number, number, number, number, number],
      bassBoost: found.bassBoost,
    }));
  }, []);

  const setPlaybackSpeed = useCallback((speed: number) => {
    const clamped = Math.max(0.5, Math.min(2, Number(speed) || 1));
    setEqStateInternal((prev) => ({ ...prev, playbackSpeed: clamped }));
  }, []);

  const sampleVisualizerLevels = useCallback((bars = 7) => eqEngine.sampleLevels(bars), [eqEngine]);

  const retry = useCallback(() => {
    startRef.current?.(values.current.track, values.current.queue, 0, {
      recordHistory: false,
      preserveAutoQueue: true,
    });
  }, []);

  const audioProps = useMemo(() => ({
    ref: setPrimaryAudio,
    onTimeUpdate: handleTimeUpdate,
    onLoadedMetadata: handleLoadedMetadata,
    onPlay: handlePlay,
    onPause: handlePause,
    onWaiting: handleWaiting,
    onEnded: handleEnded,
    onError: handleError,
  }), [setPrimaryAudio, handleTimeUpdate, handleLoadedMetadata, handlePlay, handlePause, handleWaiting, handleEnded, handleError]);

  const transitionAudioProps = useMemo(() => ({
    ref: setTransitionAudio,
    onTimeUpdate: handleTimeUpdate,
    onLoadedMetadata: handleLoadedMetadata,
    onPlay: handlePlay,
    onPause: handlePause,
    onWaiting: handleWaiting,
    onEnded: handleEnded,
    onError: handleError,
  }), [setTransitionAudio, handleTimeUpdate, handleLoadedMetadata, handlePlay, handlePause, handleWaiting, handleEnded, handleError]);

  return useMemo(() => ({
    audioRef,
    track,
    queue,
    autoQueuedIds,
    autoQueueEnabled,
    smartQueueMode,
    isRefillingAutoQueue,
    status,
    position,
    duration,
    volume,
    muted,
    shuffle,
    repeat,
    repeatMode,
    crossfadeSeconds,
    eqState,
    error,
    choose,
    play,
    pause,
    toggle,
    next,
    previous,
    seek,
    playNext,
    addToQueue,
    removeFromQueue,
    clearQueue,
    reorderQueue,
    startSongRadio,
    setAutoQueueEnabled,
    setSmartQueueMode,
    refreshAutoQueue,
    setVolume,
    setMuted,
    setShuffle: setShuffleSafe,
    setRepeat: setRepeatSafe,
    setRepeatMode,
    cycleRepeatMode,
    setCrossfadeSeconds,
    setEqEnabled,
    setEqBandGain,
    setBassBoost,
    applyEqPreset,
    setPlaybackSpeed,
    sampleVisualizerLevels,
    retry,
    audioProps,
    transitionAudioProps,
  }), [
    track,
    queue,
    autoQueuedIds,
    autoQueueEnabled,
    smartQueueMode,
    isRefillingAutoQueue,
    status,
    position,
    duration,
    volume,
    muted,
    shuffle,
    repeat,
    repeatMode,
    crossfadeSeconds,
    eqState,
    error,
    choose,
    play,
    pause,
    toggle,
    next,
    previous,
    seek,
    playNext,
    addToQueue,
    removeFromQueue,
    clearQueue,
    reorderQueue,
    startSongRadio,
    setAutoQueueEnabled,
    setSmartQueueMode,
    refreshAutoQueue,
    setShuffleSafe,
    setRepeatSafe,
    setRepeatMode,
    cycleRepeatMode,
    setCrossfadeSeconds,
    setEqEnabled,
    setEqBandGain,
    setBassBoost,
    applyEqPreset,
    setPlaybackSpeed,
    sampleVisualizerLevels,
    retry,
    audioProps,
    transitionAudioProps,
  ]);
}
