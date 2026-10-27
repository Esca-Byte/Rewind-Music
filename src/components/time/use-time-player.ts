"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import type { TimeTrack } from "@/lib/time/types";
import { resolveAudioStreamUrl, invalidateStreamCache, isTauriEnvironment } from "@/lib/tauri-audio";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  createAudioTransitionController,
  type AudioTransitionController,
} from "@/lib/audio-transition";

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";

const CROSSFADE_OPTIONS = [0, 2, 4, 6, 8] as const;
const CROSSFADE_STORAGE_KEY = "rewind-crossfade-seconds";
const PRELOAD_LEAD_SECONDS = 12;

function readCrossfadeSetting(): number {
  if (typeof window === "undefined") return 4;
  try {
    const value = Number(window.localStorage.getItem(CROSSFADE_STORAGE_KEY));
    return CROSSFADE_OPTIONS.includes(value as (typeof CROSSFADE_OPTIONS)[number]) ? value : 4;
  } catch {
    return 4;
  }
}

function sameTrack(left: TimeTrack | null | undefined, right: TimeTrack | null | undefined): boolean {
  if (!left || !right) return false;
  const sameId = Boolean(left.id && right.id) && left.id === right.id;
  const sameVideo = Boolean(left.videoId && right.videoId) && left.videoId === right.videoId;
  return sameId || sameVideo;
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
  offlineOnly = false
) {
  const [track, setTrack] = useState(initial);
  const [queue, setQueue] = useState<TimeTrack[]>([initial]);
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(initial.duration);
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [crossfadeSeconds, setCrossfadeSecondsState] = useState(readCrossfadeSetting);
  const [error, setError] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const primaryAudioRef = useRef<HTMLAudioElement | null>(null);
  const transitionAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const transitionTargetRef = useRef<TimeTrack | null>(null);
  const preloadRef = useRef<PreloadEntry | null>(null);
  const preloadCleanupRef = useRef<(() => void) | null>(null);
  const operationEpochRef = useRef(0);
  const retryCountRef = useRef(0);
  const pendingStartRef = useRef<{ track: TimeTrack; epoch: number } | null>(null);
  const loggedTrackId = useRef("");
  const onListenRef = useRef(onListen);
  const onTrackErrorRef = useRef(onTrackError);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSkipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<((nextTrack: TimeTrack, list?: TimeTrack[], resume?: number) => void) | null>(null);
  const nextRef = useRef<((direction?: number) => void) | null>(null);
  const handleTrackFailureRef = useRef<((failedTrack: TimeTrack, reason: string) => void) | null>(null);
  const transitionController = useMemo<AudioTransitionController>(
    () => createAudioTransitionController(0.85, false),
    []
  );

  const values = useRef({ track, queue, status, position, volume, muted, shuffle, repeat });

  useEffect(() => { onListenRef.current = onListen; }, [onListen]);
  useEffect(() => { onTrackErrorRef.current = onTrackError; }, [onTrackError]);
  useEffect(() => {
    values.current = { track, queue, status, position, volume, muted, shuffle, repeat };
  }, [track, queue, status, position, volume, muted, shuffle, repeat]);

  useEffect(() => {
    transitionController.setOutput(volume, muted);
    if (!transitionController.active) {
      for (const audio of [primaryAudioRef.current, transitionAudioRef.current]) {
        if (audio) {
          audio.volume = volume;
          audio.muted = muted;
        }
      }
    }
  }, [transitionController, volume, muted]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CROSSFADE_STORAGE_KEY, String(crossfadeSeconds));
    } catch {
      /* localStorage is optional in private/browser-restricted contexts */
    }
  }, [crossfadeSeconds]);

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
      // Do not dispose the memoized controller here: React StrictMode can run
      // effect cleanup and setup without creating a new hook instance.
    };
  }, [cancelTransitionWork, clearTimers]);

  const setPrimaryAudio = useCallback((audio: HTMLAudioElement | null) => {
    if (audio) {
      primaryAudioRef.current = audio;
      if (!activeAudioRef.current) {
        activeAudioRef.current = audio;
        audioRef.current = audio;
      }
    } else {
      primaryAudioRef.current = null;
    }
  }, []);

  const setTransitionAudio = useCallback((audio: HTMLAudioElement | null) => {
    transitionAudioRef.current = audio;
  }, []);

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

  const selectNextTrack = useCallback((current: typeof values.current = values.current): TimeTrack | null => {
    if (current.queue.length < 2) return null;
    const currentIndex = current.queue.findIndex((candidate) => sameTrack(candidate, current.track));
    if (current.shuffle) {
      const candidates = current.queue.filter((candidate) => !sameTrack(candidate, current.track));
      return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
    }
    const index = (Math.max(0, currentIndex) + 1 + current.queue.length) % current.queue.length;
    const candidate = current.queue[index];
    return candidate && !sameTrack(candidate, current.track) ? candidate : null;
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
    if (resume > 0 && Number.isFinite(resume)) {
      try { audio.currentTime = resume; } catch { /* metadata may not be available yet */ }
    }

    let playResult: Promise<void>;
    try {
      playResult = audio.play();
    } catch (err) {
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
  }, [clearTimers]);

  const triggerAutoSkip = useCallback((failedTrack: TimeTrack, reason: string) => {
    clearTimers();
    setStatus("error");
    values.current.status = "error";
    setError(reason);
    onTrackErrorRef.current?.(failedTrack, reason);
    if (values.current.queue.length > 1) {
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
    if (current.shuffle && direction > 0) {
      const candidates = current.queue.filter((candidate) => !sameTrack(candidate, current.track));
      const candidate = candidates[Math.floor(Math.random() * candidates.length)];
      if (candidate) startRef.current?.(candidate);
      return;
    }
    const index = (Math.max(0, currentIndex) + direction + current.queue.length) % current.queue.length;
    const candidate = current.queue[index];
    if (candidate && !sameTrack(candidate, current.track)) startRef.current?.(candidate);
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
      if (epoch !== operationEpochRef.current || transitionTargetRef.current && !sameTrack(transitionTargetRef.current, nextTrack)) {
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
    if (current.repeat) return;
    const nextTrack = selectNextTrack(current);
    const audio = audioRef.current;
    if (!nextTrack || !audio) return;
    const remaining = Number.isFinite(audio.duration) ? audio.duration - audio.currentTime : Infinity;
    if (!force && remaining > Math.max(PRELOAD_LEAD_SECONDS, crossfadeSeconds + 8)) return;
    const epoch = operationEpochRef.current;
    try {
      await ensurePreloaded(nextTrack, epoch);
    } catch {
      // A preload is speculative. Playback reports an error if it is needed later.
      if (preloadRef.current?.epoch === epoch && sameTrack(preloadRef.current.track, nextTrack)) {
        clearPreload();
      }
    }
  }, [clearPreload, crossfadeSeconds, ensurePreloaded, selectNextTrack]);

  const promoteIncoming = useCallback((nextTrack: TimeTrack, incoming: HTMLAudioElement) => {
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
  }, []);

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
        // Gapless mode is invoked from ended: recover by loading the next
        // track normally instead of leaving the ended element marked playing.
        if (durationSeconds === 0 && outgoing.ended) {
          startRef.current?.(nextTrack);
        }
      }
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        console.warn(`[Player] Transition failed for "${nextTrack.title}":`, err);
      }
    }
  }, [ensurePreloaded, promoteIncoming, transitionController]);

  const start = useCallback((nextTrack: TimeTrack, list?: TimeTrack[], resume = 0) => {
    clearTimers();
    cancelTransitionWork(true);
    retryCountRef.current = 0;
    const epoch = operationEpochRef.current;
    const audio = activeAudioRef.current || primaryAudioRef.current;
    if (!audio) return;
    activeAudioRef.current = audio;
    audioRef.current = audio;
    setTrack(nextTrack);
    values.current.track = nextTrack;
    if (list?.length) {
      setQueue(list);
      values.current.queue = list;
    }
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
  }, [cancelTransitionWork, clearTimers, playSource, resolveTrackSource]);

  useEffect(() => {
    startRef.current = start;
  }, [start]);

  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (values.current.status === "playing" && audio && !audio.paused) return;
    if (values.current.status === "loading" && pendingStartRef.current) return;
    if (!audio || !audio.getAttribute("src")) {
      startRef.current?.(values.current.track, undefined, values.current.position);
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
      startRef.current?.(values.current.track, undefined, values.current.position);
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
  }, [cancelTransitionWork, clearTimers]);

  const toggle = useCallback(async () => {
    const audio = audioRef.current;
    if (values.current.status === "playing" && audio && !audio.paused) {
      pause();
    } else {
      await play();
    }
  }, [pause, play]);

  const choose = useCallback((nextTrack: TimeTrack, list?: TimeTrack[]) => {
    if (list?.length) {
      cancelTransitionWork(false);
      setQueue(list);
      values.current.queue = list;
    }
    if (sameTrack(values.current.track, nextTrack) && audioRef.current?.getAttribute("src") && values.current.status !== "error") {
      void toggle();
      return;
    }
    start(nextTrack, list);
  }, [cancelTransitionWork, start, toggle]);

  const playNext = useCallback((nextTrack: TimeTrack) => {
    cancelTransitionWork(false);
    setQueue((prevQueue) => {
      const currentTrack = values.current.track;
      const filtered = prevQueue.filter((candidate) => !sameTrack(candidate, nextTrack));
      const currentIndex = filtered.findIndex((candidate) => sameTrack(candidate, currentTrack));
      const insertAt = currentIndex < 0 ? 1 : currentIndex + 1;
      filtered.splice(insertAt, 0, nextTrack);
      values.current.queue = filtered;
      return filtered;
    });
  }, [cancelTransitionWork]);

  const addToQueue = useCallback((nextTrack: TimeTrack) => {
    cancelTransitionWork(false);
    setQueue((prevQueue) => {
      if (prevQueue.some((candidate) => sameTrack(candidate, nextTrack))) return prevQueue;
      const newQueue = [...prevQueue, nextTrack];
      values.current.queue = newQueue;
      return newQueue;
    });
  }, [cancelTransitionWork]);

  const removeFromQueue = useCallback((indexToRemove: number) => {
    cancelTransitionWork(false);
    setQueue((prevQueue) => {
      if (indexToRemove < 0 || indexToRemove >= prevQueue.length) return prevQueue;
      if (sameTrack(prevQueue[indexToRemove], values.current.track)) return prevQueue;
      const newQueue = prevQueue.filter((_, idx) => idx !== indexToRemove);
      values.current.queue = newQueue;
      return newQueue;
    });
  }, [cancelTransitionWork]);

  const clearQueue = useCallback(() => {
    cancelTransitionWork(false);
    setQueue(() => {
      const newQueue = [values.current.track];
      values.current.queue = newQueue;
      return newQueue;
    });
  }, [cancelTransitionWork]);

  const reorderQueue = useCallback((fromIndex: number, toIndex: number) => {
    cancelTransitionWork(false);
    setQueue((prevQueue) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= prevQueue.length ||
        toIndex >= prevQueue.length ||
        fromIndex === toIndex ||
        sameTrack(prevQueue[fromIndex], values.current.track) ||
        sameTrack(prevQueue[toIndex], values.current.track)
      ) {
        return prevQueue;
      }
      const nextQueue = [...prevQueue];
      const [moved] = nextQueue.splice(fromIndex, 1);
      nextQueue.splice(toIndex, 0, moved);
      values.current.queue = nextQueue;
      return nextQueue;
    });
  }, [cancelTransitionWork]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(seconds)) return;
    cancelTransitionWork(false);
    const nextPosition = Math.max(0, seconds);
    try { audio.currentTime = nextPosition; } catch { /* media metadata is not ready */ }
    setPosition(nextPosition);
    values.current.position = nextPosition;
  }, [cancelTransitionWork]);

  const previous = useCallback(() => {
    if (values.current.position > 3) seek(0);
    else next(-1);
  }, [next, seek]);

  const handleTimeUpdate = useCallback((event: SyntheticEvent<HTMLAudioElement>) => {
    const audio = event.currentTarget;
    if (audio !== audioRef.current || !Number.isFinite(audio.currentTime)) return;
    setPosition(audio.currentTime);
    values.current.position = audio.currentTime;
    void preloadNextTrack(false);
    if (values.current.repeat || transitionTargetRef.current) return;
    const nextTrack = selectNextTrack(values.current);
    if (!nextTrack || crossfadeSeconds <= 0 || values.current.status !== "playing") return;
    if (Number.isFinite(audio.duration) && audio.duration - audio.currentTime <= crossfadeSeconds) {
      void beginTransition(nextTrack, crossfadeSeconds);
    }
  }, [beginTransition, crossfadeSeconds, preloadNextTrack, selectNextTrack]);

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
    if (values.current.repeat && audioRef.current) {
      audioRef.current.currentTime = 0;
      void audioRef.current.play().catch(() => {});
      return;
    }
    const nextTrack = selectNextTrack(values.current);
    if (nextTrack && crossfadeSeconds === 0) {
      void beginTransition(nextTrack, 0);
    } else if (nextTrack) {
      startRef.current?.(nextTrack);
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

  const setRepeatSafe = useCallback((nextRepeat: boolean) => {
    if (nextRepeat === values.current.repeat) return;
    cancelTransitionWork(false);
    values.current.repeat = nextRepeat;
    setRepeat(nextRepeat);
  }, [cancelTransitionWork]);

  const setShuffleSafe = useCallback((nextShuffle: boolean) => {
    if (nextShuffle === values.current.shuffle) return;
    cancelTransitionWork(false);
    values.current.shuffle = nextShuffle;
    setShuffle(nextShuffle);
  }, [cancelTransitionWork]);

  const retry = useCallback(() => startRef.current?.(values.current.track), []);

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
    status,
    position,
    duration,
    volume,
    muted,
    shuffle,
    repeat,
    crossfadeSeconds,
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
    setVolume,
    setMuted,
    setShuffle: setShuffleSafe,
    setRepeat: setRepeatSafe,
    setCrossfadeSeconds,
    retry,
    audioProps,
    transitionAudioProps,
  }), [track, queue, status, position, duration, volume, muted, shuffle, repeat, crossfadeSeconds, error, choose, play, pause, toggle, next, previous, seek, playNext, addToQueue, removeFromQueue, clearQueue, reorderQueue, setShuffleSafe, setRepeatSafe, setCrossfadeSeconds, retry, audioProps, transitionAudioProps]);
}
