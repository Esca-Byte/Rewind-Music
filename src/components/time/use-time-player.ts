"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TimeTrack } from "@/lib/time/types";
import { resolveAudioStreamUrl, invalidateStreamCache, isTauriEnvironment } from "@/lib/tauri-audio";
import { convertFileSrc } from "@tauri-apps/api/core";

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";

export function useTimePlayer(
  initial: TimeTrack,
  onListen: (track: TimeTrack) => void,
  onTrackError?: (track: TimeTrack, errorMsg: string) => void
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
  const [error, setError] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loggedTrackId = useRef<string>("");
  const onListenRef = useRef(onListen);
  const onTrackErrorRef = useRef(onTrackError);
  const retryCountRef = useRef(0);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSkipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const values = useRef({ track, queue, status, position, volume, muted, shuffle, repeat });

  useEffect(() => { onListenRef.current = onListen; }, [onListen]);
  useEffect(() => { onTrackErrorRef.current = onTrackError; }, [onTrackError]);
  useEffect(() => {
    values.current = { track, queue, status, position, volume, muted, shuffle, repeat };
  }, [track, queue, status, position, volume, muted, shuffle, repeat]);

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

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  // Sync volume & muted state to HTML5 audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.muted = muted;
    }
  }, [volume, muted]);

  const next = useCallback((direction = 1) => {
    clearTimers();
    const current = values.current;
    const list = current.queue;
    if (!list.length) return;
    let index = list.findIndex((item) => item.videoId === current.track.videoId);
    if (current.shuffle && list.length > 1 && direction > 0) {
      const candidates = list.filter((item) => item.videoId !== current.track.videoId);
      start(candidates[Math.floor(Math.random() * candidates.length)]);
      return;
    }
    index = (Math.max(0, index) + direction + list.length) % list.length;
    start(list[index]);
  }, [clearTimers]);

  const triggerAutoSkip = useCallback((failedTrack: TimeTrack, reason: string) => {
    clearTimers();
    setStatus("error");
    values.current.status = "error";
    setError(reason);

    if (onTrackErrorRef.current) {
      onTrackErrorRef.current(failedTrack, reason);
    }

    // Auto-advance to next song in queue if more than 1 song
    if (values.current.queue.length > 1) {
      autoSkipTimerRef.current = setTimeout(() => {
        next(1);
      }, 1200);
    }
  }, [clearTimers, next]);

  const playSource = useCallback((src: string, targetTrack: TimeTrack, resume = 0) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (values.current.track.id !== targetTrack.id && values.current.track.videoId !== targetTrack.videoId) {
      return;
    }

    if (audio.src !== src) {
      audio.src = src;
    }
    if (resume > 0) {
      audio.currentTime = resume;
    }

    audio.play().then(() => {
      clearTimers();
      setStatus("playing");
      values.current.status = "playing";
      setError("");
      retryCountRef.current = 0;
      if (loggedTrackId.current !== targetTrack.id) {
        loggedTrackId.current = targetTrack.id;
        onListenRef.current(targetTrack);
      }
    }).catch((err) => {
      clearTimers();
      if (err.name === "AbortError") {
        // Interrupted by another track switch - normal
        return;
      }
      if (err.name === "NotAllowedError") {
        // Autoplay restrictions before user gesture
        setStatus("paused");
        values.current.status = "paused";
        return;
      }
      console.warn(`[Player] Play failed for "${targetTrack.title}":`, err);
      handleTrackFailure(targetTrack, "Playback failed");
    });
  }, [clearTimers]);

  const handleTrackFailure = useCallback((failedTrack: TimeTrack, reason: string) => {
    if (values.current.track.id !== failedTrack.id && values.current.track.videoId !== failedTrack.videoId) {
      return;
    }

    invalidateStreamCache(failedTrack.videoId);

    // Attempt 1 retry with fresh stream resolution
    if (retryCountRef.current === 0) {
      retryCountRef.current = 1;
      console.warn(`[Player] Retrying track once: ${failedTrack.title}`);
      resolveAudioStreamUrl(failedTrack.videoId, true)
        .then((src) => {
          playSource(src, failedTrack, 0);
        })
        .catch(() => {
          triggerAutoSkip(failedTrack, reason);
        });
      return;
    }

    triggerAutoSkip(failedTrack, reason);
  }, [playSource, triggerAutoSkip]);

  const start = useCallback((nextTrack: TimeTrack, list?: TimeTrack[], resume = 0) => {
    clearTimers();
    retryCountRef.current = 0;

    const audio = audioRef.current;
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

    // 12-second loading timeout watchdog: if audio hangs or stream never delivers, auto-skip
    loadingTimerRef.current = setTimeout(() => {
      if (values.current.status === "loading" && values.current.track.id === nextTrack.id) {
        console.warn(`[Player] Loading timed out for "${nextTrack.title}"`);
        handleTrackFailure(nextTrack, "Stream timed out");
      }
    }, 12000);

    if (audio) {
      // Direct local offline playback if filePath exists
      if (nextTrack.filePath && isTauriEnvironment()) {
        try {
          const localSrc = convertFileSrc(nextTrack.filePath);
          if (localSrc) {
            playSource(localSrc, nextTrack, resume);
            return;
          }
        } catch (err) {
          console.warn("Failed to convert local file source, falling back to YouTube:", err);
        }
      }

      // Stream via YouTube
      resolveAudioStreamUrl(nextTrack.videoId)
        .then((src) => {
          playSource(src, nextTrack, resume);
        })
        .catch((err) => {
          console.error(`[Player] Audio resolve error for "${nextTrack.title}":`, err);
          handleTrackFailure(nextTrack, "Could not extract audio stream");
        });
    }
  }, [clearTimers, handleTrackFailure, playSource]);

  const toggle = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        if (!audio.src || audio.src === window.location.href) {
          start(values.current.track, undefined, values.current.position);
          return;
        }
        await audio.play();
        setStatus("playing");
      } catch {
        start(values.current.track, undefined, values.current.position);
      }
    } else {
      audio.pause();
      setStatus("paused");
    }
  }, [start]);

  const choose = useCallback((nextTrack: TimeTrack, list?: TimeTrack[]) => {
    if (list?.length) {
      setQueue(list);
      values.current.queue = list;
    }
    if (values.current.track.videoId === nextTrack.videoId && audioRef.current?.src && values.current.status !== "error") {
      void toggle();
      return;
    }
    start(nextTrack, list);
  }, [start, toggle]);

  const playNext = useCallback((nextTrack: TimeTrack) => {
    setQueue((prevQueue) => {
      const currentTrack = values.current.track;
      const currentIndex = prevQueue.findIndex((t) => t.videoId === currentTrack.videoId);
      if (currentIndex === -1) {
        const nextList = [currentTrack, nextTrack, ...prevQueue.filter((t) => t.videoId !== nextTrack.videoId)];
        values.current.queue = nextList;
        return nextList;
      }
      const newQueue = [...prevQueue];
      newQueue.splice(currentIndex + 1, 0, nextTrack);
      values.current.queue = newQueue;
      return newQueue;
    });
  }, []);

  const addToQueue = useCallback((nextTrack: TimeTrack) => {
    setQueue((prevQueue) => {
      const newQueue = [...prevQueue, nextTrack];
      values.current.queue = newQueue;
      return newQueue;
    });
  }, []);

  const removeFromQueue = useCallback((indexToRemove: number) => {
    setQueue((prevQueue) => {
      if (indexToRemove < 0 || indexToRemove >= prevQueue.length) return prevQueue;
      const newQueue = prevQueue.filter((_, idx) => idx !== indexToRemove);
      values.current.queue = newQueue;
      return newQueue;
    });
  }, []);

  const clearQueue = useCallback(() => {
    setQueue((prevQueue) => {
      const currentTrack = values.current.track;
      const newQueue = [currentTrack];
      values.current.queue = newQueue;
      return newQueue;
    });
  }, []);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = seconds;
      setPosition(seconds);
      values.current.position = seconds;
    }
  }, []);

  const previous = useCallback(() => {
    if (values.current.position > 3) {
      seek(0);
    } else {
      next(-1);
    }
  }, [next, seek]);

  // Event handlers to attach to <audio>
  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (audio && Number.isFinite(audio.currentTime)) {
      setPosition(audio.currentTime);
      values.current.position = audio.currentTime;
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
      setDuration(audio.duration);
    }
  }, []);

  const handlePlay = useCallback(() => {
    clearTimers();
    setStatus("playing");
    values.current.status = "playing";
    setError("");
    const current = values.current.track;
    if (loggedTrackId.current !== current.id) {
      loggedTrackId.current = current.id;
      onListenRef.current(current);
    }
  }, [clearTimers]);

  const handlePause = useCallback(() => {
    if (values.current.status !== "loading") {
      setStatus("paused");
      values.current.status = "paused";
    }
  }, []);

  const handleWaiting = useCallback(() => {
    setStatus("loading");
    values.current.status = "loading";
  }, []);

  const handleEnded = useCallback(() => {
    clearTimers();
    if (values.current.repeat && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    } else if (values.current.queue.length > 1) {
      next(1);
    } else {
      setStatus("paused");
      values.current.status = "paused";
      setPosition(0);
    }
  }, [clearTimers, next]);

  const handleError = useCallback(() => {
    clearTimers();
    const currentTrack = values.current.track;
    const mediaErr = audioRef.current?.error;
    let reason = "Audio stream unavailable";
    if (mediaErr) {
      if (mediaErr.code === 2) reason = "Network connection interrupted";
      else if (mediaErr.code === 3) reason = "Audio decode failure";
      else if (mediaErr.code === 4) reason = "Stream format not supported or expired";
    }
    console.error(`[Player] HTML5 Audio error on "${currentTrack.title}":`, reason);
    handleTrackFailure(currentTrack, reason);
  }, [clearTimers, handleTrackFailure]);

  const nextTrack = useCallback(() => next(1), [next]);
  const retry = useCallback(() => start(values.current.track), [start]);

  const audioProps = useMemo(
    () => ({
      ref: audioRef,
      onTimeUpdate: handleTimeUpdate,
      onLoadedMetadata: handleLoadedMetadata,
      onPlay: handlePlay,
      onPause: handlePause,
      onWaiting: handleWaiting,
      onEnded: handleEnded,
      onError: handleError,
    }),
    [
      handleTimeUpdate,
      handleLoadedMetadata,
      handlePlay,
      handlePause,
      handleWaiting,
      handleEnded,
      handleError,
    ]
  );

  return useMemo(
    () => ({
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
      error,
      choose,
      toggle,
      next: nextTrack,
      previous,
      seek,
      playNext,
      addToQueue,
      removeFromQueue,
      clearQueue,
      setVolume,
      setMuted,
      setShuffle,
      setRepeat,
      retry,
      audioProps,
    }),
    [
      track,
      queue,
      status,
      position,
      duration,
      volume,
      muted,
      shuffle,
      repeat,
      error,
      choose,
      toggle,
      nextTrack,
      previous,
      seek,
      playNext,
      addToQueue,
      removeFromQueue,
      clearQueue,
      setVolume,
      setMuted,
      setShuffle,
      setRepeat,
      retry,
      audioProps,
    ]
  );
}
