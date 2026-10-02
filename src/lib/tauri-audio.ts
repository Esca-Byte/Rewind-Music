import { invoke, isTauri } from "@tauri-apps/api/core";
import type { TimeTrack } from "@/lib/time/types";
import type { SpotifyPlaylistResult, SpotifyTrackItem, MatchedYouTubeTrack } from "@/types/music";

const streamUrlCache = new Map<string, { url: string; expires: number }>();

export function isTauriEnvironment(): boolean {
  return (
    typeof window !== "undefined" &&
    (Boolean(isTauri && isTauri()) || Boolean((window as any).__TAURI_INTERNALS__))
  );
}

export function invalidateStreamCache(videoId: string): void {
  streamUrlCache.delete(videoId);
}

/**
 * Resolves direct audio stream URL using the native Rust Tauri command.
 */
export async function resolveAudioStreamUrl(videoId: string, bypassCache = false): Promise<string> {
  if (bypassCache) {
    streamUrlCache.delete(videoId);
  } else {
    const cached = streamUrlCache.get(videoId);
    if (cached && cached.expires > Date.now()) {
      return cached.url;
    }
  }

  if (isTauriEnvironment()) {
    try {
      const directUrl = await invoke<string>("resolve_stream_url", { videoId });
      if (directUrl && directUrl.startsWith("http")) {
        streamUrlCache.set(videoId, { url: directUrl, expires: Date.now() + 45 * 60 * 1000 });
        return directUrl;
      }
      throw new Error("No playable audio stream URL returned");
    } catch (err: any) {
      streamUrlCache.delete(videoId);
      console.error(`Native audio extraction failed for ${videoId}:`, err);
      throw new Error(typeof err === "string" ? err : err?.message || "Failed to extract audio stream");
    }
  }

  throw new Error("Desktop audio streaming requires the Rewind desktop app.");
}

/**
 * Searches YouTube tracks via native Rust Tauri command.
 */
export async function searchTracks(query: string): Promise<TimeTrack[]> {
  if (!isTauriEnvironment()) return [];

  try {
    const results = await invoke<TimeTrack[]>("search_tracks_native", { query });
    return results || [];
  } catch (err) {
    console.error("Native search error:", err);
    return [];
  }
}

/**
 * Returns the Rewind Downloads directory in the user's Music folder.
 */
export async function getDownloadsPath(): Promise<string> {
  if (!isTauriEnvironment()) {
    return "Rewind Downloads";
  }

  try {
    return await invoke<string>("get_downloads_folder");
  } catch (err) {
    console.warn("Could not determine audio directory, falling back:", err);
    return "Music\\Rewind Downloads";
  }
}

/**
 * Opens the Rewind Downloads folder in Windows File Explorer.
 */
export async function openDownloadsFolder(): Promise<void> {
  if (!isTauriEnvironment()) return;

  try {
    await invoke("open_downloads_folder");
  } catch (err) {
    console.error("Failed to open downloads folder:", err);
  }
}

export interface DownloadedTrackInfo {
  id: string;
  videoId: string;
  title: string;
  artist: string;
  album?: string;
  year?: number | null;
  genre?: string;
  duration?: number;
  cover?: string;
  downloadedAt: number;
  filePath: string;
  fileName: string;
  fileSize: number;
}

/**
 * Scans the Rewind Downloads folder, reconciles with metadata, and returns existing audio files.
 */
export async function scanDownloadsFolder(): Promise<DownloadedTrackInfo[]> {
  if (!isTauriEnvironment()) return [];
  try {
    const tracks = await invoke<DownloadedTrackInfo[]>("scan_downloads_folder");
    return tracks || [];
  } catch (err) {
    console.error("Failed to scan downloads folder:", err);
    return [];
  }
}

/**
 * Deletes a downloaded audio file from the downloads folder.
 */
export async function deleteDownloadedTrack(filePath: string): Promise<boolean> {
  if (!isTauriEnvironment()) return false;
  try {
    return await invoke<boolean>("delete_downloaded_track", { filePath });
  } catch (err) {
    console.error("Failed to delete downloaded track:", err);
    return false;
  }
}

/**
 * Downloads a track offline directly to Rewind Downloads.
 */
export async function downloadTrackOffline(track: {
  videoId: string;
  title: string;
  artist?: string;
  album?: string;
  year?: number | null;
  genre?: string;
  duration?: number;
  cover?: string;
}): Promise<{ success: boolean; path?: string; error?: string }> {
  if (!isTauriEnvironment()) {
    return { success: false, error: "Offline download is only available in the Rewind desktop app." };
  }

  try {
    const savedPath = await invoke<string>("download_track_native", {
      videoId: track.videoId,
      title: track.title,
      artist: track.artist || null,
      album: track.album || null,
      year: track.year ?? null,
      genre: track.genre || null,
      duration: track.duration ?? null,
      cover: track.cover || null,
    });
    return { success: true, path: savedPath };
  } catch (err: any) {
    console.error("Native download error:", err);
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Minimizes the desktop application window.
 */
export async function minimizeAppWindow(): Promise<void> {
  if (!isTauriEnvironment()) return;
  try {
    await invoke("app_minimize_window");
  } catch {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().minimize();
    } catch (e) {
      console.warn("Failed to minimize window:", e);
    }
  }
}

/**
 * Toggles maximize / restore on the desktop application window.
 */
export async function toggleMaximizeAppWindow(): Promise<boolean> {
  if (!isTauriEnvironment()) return false;
  try {
    await invoke("app_toggle_maximize_window");
    return await invoke<boolean>("app_is_maximized");
  } catch {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      await win.toggleMaximize();
      return await win.isMaximized();
    } catch (e) {
      console.warn("Failed to toggle maximize:", e);
      return false;
    }
  }
}

/**
 * Closes the desktop application window.
 */
export async function closeAppWindow(): Promise<void> {
  if (!isTauriEnvironment()) return;
  try {
    await invoke("app_close_window");
  } catch {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
    } catch (e) {
      console.warn("Failed to close window:", e);
    }
  }
}

/**
 * Checks whether the desktop application window is maximized.
 */
export async function isAppWindowMaximized(): Promise<boolean> {
  if (!isTauriEnvironment()) return false;
  try {
    return await invoke<boolean>("app_is_maximized");
  } catch {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      return await getCurrentWindow().isMaximized();
    } catch {
      return false;
    }
  }
}

export interface ImportedYouTubePlaylist {
  id: string;
  youtubeId: string;
  title: string;
  description: string;
  cover: string;
  trackCount: number;
  totalDuration: number;
  tracks: TimeTrack[];
}

/**
 * Imports a YouTube playlist by URL or playlist ID.
 * Uses native yt-dlp in Tauri desktop mode, or local API fallback in web mode.
 */
export async function fetchYouTubePlaylist(urlOrId: string): Promise<ImportedYouTubePlaylist> {
  const trimmed = urlOrId.trim();
  if (!trimmed) {
    throw new Error("Please enter a YouTube playlist URL or ID");
  }

  if (isTauriEnvironment()) {
    return await invoke<ImportedYouTubePlaylist>("import_youtube_playlist", {
      urlOrId: trimmed,
    });
  }

  throw new Error("YouTube playlist import requires the Rewind desktop app.");
}

/**
 * Fetches a public Spotify playlist metadata & tracks via embed endpoint.
 */
export async function fetchSpotifyPlaylist(urlOrId: string): Promise<SpotifyPlaylistResult> {
  const trimmed = urlOrId.trim();
  if (!trimmed) {
    throw new Error("Please enter a Spotify playlist link or ID");
  }

  if (isTauriEnvironment()) {
    return await invoke<SpotifyPlaylistResult>("fetch_spotify_playlist", {
      urlOrId: trimmed,
    });
  }

  throw new Error("Spotify playlist import requires the Rewind desktop app.");
}

/**
 * Searches and matches a Spotify song to a playable YouTube track.
 */
export async function matchTrackToYouTube(
  artist: string,
  title: string
): Promise<MatchedYouTubeTrack> {
  if (isTauriEnvironment()) {
    return await invoke<MatchedYouTubeTrack>("match_track_to_youtube", {
      artist,
      title,
    });
  }

  throw new Error("Track matching requires the Rewind desktop app.");
}

/**
 * Batch matches Spotify songs to YouTube tracks.
 */
export async function matchSpotifyTracksBatch(
  tracks: SpotifyTrackItem[]
): Promise<(MatchedYouTubeTrack | null)[]> {
  if (isTauriEnvironment()) {
    return await invoke<(MatchedYouTubeTrack | null)[]>("match_spotify_tracks_batch", {
      tracks,
    });
  }

  throw new Error("Batch matching requires the Rewind desktop app.");
}
