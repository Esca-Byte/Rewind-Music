"use client";

import { useEffect, useRef } from "react";

export interface MediaKeyHandlers {
  onPlay: () => void;
  onPause: () => void;
  onNextTrack: () => void;
  onPreviousTrack: () => void;
  /** Optional metadata shown by the operating system's media controls. */
  metadata?: MediaMetadataInit | null;
  /** Player status; values other than playing/paused clear the session state. */
  status?: "idle" | "loading" | "playing" | "paused" | "error" | "none";
  /** Current track duration in seconds, used with position for seek displays. */
  duration?: number;
  /** Current playback position in seconds, used with duration for seek displays. */
  position?: number;
}

/** Register browser/OS media controls while the owning player is mounted. */
export function useMediaKeys({
  onPlay,
  onPause,
  onNextTrack,
  onPreviousTrack,
  metadata,
  status,
  duration,
  position,
}: MediaKeyHandlers): void {
  const handlersRef = useRef({ onPlay, onPause, onNextTrack, onPreviousTrack });

  useEffect(() => {
    handlersRef.current = { onPlay, onPause, onNextTrack, onPreviousTrack };
  }, [onPlay, onPause, onNextTrack, onPreviousTrack]);

  useEffect(() => {
    if (
      typeof navigator === "undefined" ||
      typeof navigator.mediaSession?.setActionHandler !== "function"
    ) {
      return;
    }

    const session = navigator.mediaSession;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => handlersRef.current.onPlay()],
      ["pause", () => handlersRef.current.onPause()],
      ["nexttrack", () => handlersRef.current.onNextTrack()],
      ["previoustrack", () => handlersRef.current.onPreviousTrack()],
    ];
    const registered: MediaSessionAction[] = [];

    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
        registered.push(action);
      } catch {
        // Some browsers expose Media Session but reject individual actions.
      }
    }

    return () => {
      for (const action of registered) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // An unavailable session/action must not interrupt unmount.
        }
      }
      try {
        session.metadata = null;
      } catch {
        // Cleanup must remain safe when a WebView tears down its media session.
      }
      try {
        session.playbackState = "none";
      } catch {
        // Cleanup must remain safe when a WebView tears down its media session.
      }
    };
  }, []);

  useEffect(() => {
    if (metadata === undefined || typeof navigator === "undefined" || !navigator.mediaSession) {
      return;
    }

    try {
      if (metadata === null) {
        navigator.mediaSession.metadata = null;
      } else if (typeof MediaMetadata === "function") {
        navigator.mediaSession.metadata = new MediaMetadata(metadata);
      }
    } catch {
      // Metadata is optional and can be rejected by older WebViews.
    }
  }, [metadata]);

  useEffect(() => {
    if (status === undefined || typeof navigator === "undefined" || !navigator.mediaSession) {
      return;
    }

    const playbackState = status === "playing" ? "playing" : status === "paused" ? "paused" : "none";
    try {
      navigator.mediaSession.playbackState = playbackState;
    } catch {
      // Media Session is optional and may expose a read-only state.
    }
  }, [status]);

  useEffect(() => {
    if (
      duration === undefined ||
      position === undefined ||
      typeof navigator === "undefined" ||
      typeof navigator.mediaSession?.setPositionState !== "function" ||
      !Number.isFinite(duration) ||
      !Number.isFinite(position) ||
      duration <= 0
    ) {
      return;
    }

    const safePosition = Math.min(Math.max(position, 0), duration);
    try {
      navigator.mediaSession.setPositionState({
        duration,
        position: safePosition,
        playbackRate: 1,
      });
    } catch {
      // Position state is unsupported or invalid in some browser/WebView versions.
    }
  }, [duration, position]);
}
