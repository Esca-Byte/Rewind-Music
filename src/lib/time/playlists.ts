import rawPlaylists from "./playlists.json";
import type { TimeTrack } from "./types";

export type Playlist = {
  id: string;
  youtubeId: string;
  title: string;
  tagline: string;
  accent: string;
  icon: string;
  url: string;
  cover: string;
  trackCount: number;
  totalDuration: number;
  tracks: TimeTrack[];
};

export const playlists: Playlist[] = rawPlaylists as Playlist[];

export function getPlaylist(id: string): Playlist | undefined {
  return playlists.find((p) => p.id === id);
}

export function getAllPlaylistTracks(): TimeTrack[] {
  return playlists.flatMap((p) => p.tracks);
}
