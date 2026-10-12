"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const SLEEP_TIMER_MINUTES = [15, 30, 45, 60] as const;
export type SleepTimerMinutes = (typeof SLEEP_TIMER_MINUTES)[number];

/** A wall-clock timer: playback is stopped by the caller's onExpire callback. */
export function useSleepTimer(onExpire: () => void) {
  const [minutes, setMinutes] = useState<SleepTimerMinutes | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const deadline = useRef<number | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  const clearScheduled = useCallback(() => {
    if (timeout.current !== null) clearTimeout(timeout.current);
    if (interval.current !== null) clearInterval(interval.current);
    timeout.current = null;
    interval.current = null;
  }, []);

  const cancel = useCallback(() => {
    deadline.current = null;
    clearScheduled();
    setMinutes(null);
    setEndsAt(null);
    setRemainingSeconds(0);
  }, [clearScheduled]);

  const tick = useCallback(() => {
    const target = deadline.current;
    if (target === null) return;
    const remaining = Math.max(0, Math.ceil((target - Date.now()) / 1000));
    if (remaining > 0) {
      setRemainingSeconds(remaining);
      return;
    }
    // Clear the deadline before invoking user code so overlapping scheduled ticks
    // and callbacks which start a replacement timer cannot fire the old timer twice.
    deadline.current = null;
    clearScheduled();
    setMinutes(null);
    setEndsAt(null);
    setRemainingSeconds(0);
    onExpireRef.current();
  }, [clearScheduled]);

  const start = useCallback((duration: SleepTimerMinutes) => {
    if (!SLEEP_TIMER_MINUTES.includes(duration)) {
      throw new RangeError("Sleep timer duration must be 15, 30, 45, or 60 minutes");
    }
    clearScheduled();
    const target = Date.now() + duration * 60_000;
    deadline.current = target;
    setMinutes(duration);
    setEndsAt(target);
    setRemainingSeconds(duration * 60);
    timeout.current = setTimeout(tick, duration * 60_000);
    // Recompute from the deadline instead of decrementing to remain accurate
    // after throttling, suspension, or a delayed browser timer.
    interval.current = setInterval(tick, 1000);
  }, [clearScheduled, tick]);

  useEffect(() => {
    const handleFocus = () => tick();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") tick();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [tick]);

  useEffect(() => () => {
    deadline.current = null;
    clearScheduled();
  }, [clearScheduled]);

  return { durations: SLEEP_TIMER_MINUTES, minutes, endsAt, remainingSeconds, isActive: endsAt !== null, start, cancel };
}
