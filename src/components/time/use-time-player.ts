"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TimeTrack } from "@/lib/time/types";
import { resolveAudioStreamUrl, isTauriEnvironment } from "@/lib/tauri-audio";
import { convertFileSrc } from "@tauri-apps/api/core";

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";

export function useTimePlayer(initial: TimeTrack, onListen: (track: TimeTrack) => void) {
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
  const values = useRef({ track, queue, status, position, volume, muted, shuffle, repeat });

  useEffect(() => { onListenRef.current = onListen; }, [onListen]);
  useEffect(() => {
    values.current = { track, queue, status, position, volume, muted, shuffle, repeat };
  }, [track, queue, status, position, volume, muted, shuffle, repeat]);

  // Sync volume & muted state to HTML5 audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.muted = muted;
    }
  }, [volume, muted]);

  const start = useCallback((nextTrack: TimeTrack, list?: TimeTrack[], resume = 0) => {
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

    if (audio) {
      const playSource = (src: string) => {
        if (values.current.track.id !== nextTrack.id && values.current.track.videoId !== nextTrack.videoId) return;
        if (audio.src !== src) {
          audio.src = src;
        }
        if (resume > 0) {
          audio.currentTime = resume;
        }
        audio.play().then(() => {
          setStatus("playing");
          values.current.status = "playing";
          if (loggedTrackId.current !== nextTrack.id) {
            loggedTrackId.current = nextTrack.id;
            onListenRef.current(nextTrack);
          }
        }).catch((err) => {
          if (err.name !== "AbortError") {
            console.warn("Audio play deferred/interrupted:", err);
            setStatus("paused");
            values.current.status = "paused";
          }
        });
      };

      // Direct local offline playback if filePath exists
      if (nextTrack.filePath && isTauriEnvironment()) {
        try {
          const localSrc = convertFileSrc(nextTrack.filePath);
          if (localSrc) {
            playSource(localSrc);
            return;
          }
        } catch (err) {
          console.warn("Failed to convert local file source, falling back to YouTube:", err);
        }
      }

      // Stream via YouTube
      resolveAudioStreamUrl(nextTrack.videoId).then((src) => {
        playSource(src);
      }).catch((err) => {
        console.error("Audio resolve error:", err);
        setStatus("error");
        setError("Could not extract audio stream.");
      });
    }
  }, []);

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

  const next = useCallback((direction = 1) => {
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
  }, [start]);

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
    setStatus("playing");
    values.current.status = "playing";
    setError("");
    const current = values.current.track;
    if (loggedTrackId.current !== current.id) {
      loggedTrackId.current = current.id;
      onListenRef.current(current);
    }
  }, []);

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
  }, [next]);

  const handleError = useCallback(() => {
    console.error("HTML5 Audio playback error occurred");
    setStatus("error");
    values.current.status = "error";
    setError("Audio stream could not be loaded. Please retry or pick another song.");
  }, []);

  return {
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
    next: () => next(1),
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
    retry: () => start(values.current.track),
    audioProps: {
      ref: audioRef,
      onTimeUpdate: handleTimeUpdate,
      onLoadedMetadata: handleLoadedMetadata,
      onPlay: handlePlay,
      onPause: handlePause,
      onWaiting: handleWaiting,
      onEnded: handleEnded,
      onError: handleError,
    },
  };
}
