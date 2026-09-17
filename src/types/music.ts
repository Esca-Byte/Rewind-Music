import type { TimeTrack } from "@/lib/time/types";

export interface UserPlaylist {
  id: string;
  title: string;
  description?: string;
  createdAt: number;
  tracks: TimeTrack[];
  accent?: string;
  cover?: string;
  youtubeId?: string;
}

export interface DownloadedSong {
  id: string;
  videoId: string;
  title: string;
  artist: string;
  album?: string;
  year?: number | null;
  genre?: string;
  downloadedAt: number;
  duration?: number;
  cover?: string;
  filePath?: string;
  fileName?: string;
  fileSize?: number;
}

export type View = "explore" | "playlists" | "collection" | "memories" | "downloads" | "search" | "settings";

export type AppTheme = "analog" | "midnight" | "nordic" | "cyberpunk" | "sunset";

export interface ThemeOption {
  id: AppTheme;
  name: string;
  subtitle: string;
  description: string;
  primaryColor: string;
  bgColor: string;
  cardColor: string;
  isDark: boolean;
}

export interface ActivePlaylistDisplay {
  id: string;
  title: string;
  tagline: string;
  cover: string;
  accent?: string;
  url?: string;
  totalDuration: number;
  trackCount: number;
  tracks: TimeTrack[];
  isCustom: boolean;
}
