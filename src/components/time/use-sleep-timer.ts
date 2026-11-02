"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const SLEEP_TIMER_MINUTES = [5, 10, 15, 30, 45, 60, 90] as const;
export type SleepTimerMinutes = (typeof SLEEP_TIMER_MINUTES)[number];
const SLEEP_TIMER_STORAGE_KEY = "rewind-sleep-timer";

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
    try {
      localStorage.removeItem(SLEEP_TIMER_STORAGE_KEY);
    } catch {
      /* localStorage is optional */
    }
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
    try {
      localStorage.removeItem(SLEEP_TIMER_STORAGE_KEY);
    } catch {
      /* localStorage is optional */
    }
    onExpireRef.current();
  }, [clearScheduled]);

  const schedule = useCallback((target: number, duration: SleepTimerMinutes) => {
    clearScheduled();
    deadline.current = target;
    setMinutes(duration);
    setEndsAt(target);
    setRemainingSeconds(Math.max(0, Math.ceil((target - Date.now()) / 1000)));
    timeout.current = setTimeout(tick, Math.max(0, target - Date.now()));
    interval.current = setInterval(tick, 1000);
  }, [clearScheduled, tick]);

  const start = useCallback((duration: SleepTimerMinutes) => {
    if (!SLEEP_TIMER_MINUTES.includes(duration)) {
      throw new RangeError("Unsupported sleep timer duration");
    }
    const target = Date.now() + duration * 60_000;
    schedule(target, duration);
    try {
      localStorage.setItem(SLEEP_TIMER_STORAGE_KEY, JSON.stringify({ target, duration }));
    } catch {
      /* localStorage is optional */
    }
  }, [schedule]);

  useEffect(() => {
    let restoreTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      const parsed = JSON.parse(localStorage.getItem(SLEEP_TIMER_STORAGE_KEY) || "null");
      const target = Number(parsed?.target);
      const duration = Number(parsed?.duration) as SleepTimerMinutes;
      if (target > Date.now() && SLEEP_TIMER_MINUTES.includes(duration)) {
        restoreTimer = setTimeout(() => schedule(target, duration), 0);
      } else if (parsed) {
        localStorage.removeItem(SLEEP_TIMER_STORAGE_KEY);
      }
    } catch {
      /* A stale or unavailable timer should not interrupt startup. */
    }
    return () => {
      if (restoreTimer !== null) clearTimeout(restoreTimer);
    };
  }, [schedule]);

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
