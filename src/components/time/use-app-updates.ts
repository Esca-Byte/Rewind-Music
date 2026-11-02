"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CURRENT_APP_VERSION,
  fetchLatestRelease,
  isNewerVersion,
  type AppRelease,
  type UpdateStatus,
} from "@/lib/app-updates";

const AUTO_UPDATE_STORAGE_KEY = "rewind-auto-update-checks";

function readAutoCheckSetting(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(AUTO_UPDATE_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function useAppUpdates() {
  const [autoCheck, setAutoCheckState] = useState(true);
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [latestRelease, setLatestRelease] = useState<AppRelease | null>(null);
  const [error, setError] = useState("");
  const checkingRef = useRef(false);

  const checkForUpdates = useCallback(async () => {
    if (checkingRef.current) return null;
    checkingRef.current = true;
    setStatus("checking");
    setError("");
    try {
      const release = await fetchLatestRelease();
      setLatestRelease(release);
      const nextStatus = isNewerVersion(release.version, CURRENT_APP_VERSION) ? "available" : "up-to-date";
      setStatus(nextStatus);
      return release;
    } catch (reason) {
      setStatus("error");
      setError(reason instanceof Error ? reason.message : "Could not reach GitHub Releases.");
      return null;
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setAutoCheckState(readAutoCheckSetting()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!autoCheck) return;
    const timer = window.setTimeout(() => void checkForUpdates(), 0);
    return () => window.clearTimeout(timer);
  }, [autoCheck, checkForUpdates]);

  const setAutoCheck = useCallback((enabled: boolean) => {
    setAutoCheckState(enabled);
    try {
      window.localStorage.setItem(AUTO_UPDATE_STORAGE_KEY, String(enabled));
    } catch {
      /* localStorage is optional */
    }
  }, []);

  return {
    currentVersion: CURRENT_APP_VERSION,
    autoCheck,
    setAutoCheck,
    status,
    latestRelease,
    error,
    checkForUpdates,
  };
}

export type AppUpdatesState = ReturnType<typeof useAppUpdates>;
