export type TimeTrack = {
  id: string;
  videoId: string;
  title: string;
  artist: string;
  album: string;
  year: number | null;
  genre: string;
  duration: number;
  cover: string;
  source: "youtube";
};

export type ListeningMemory = {
  id: string;
  track: TimeTrack;
  playedAt: string;
};

export type ListenerLibrary = {
  favorites: TimeTrack[];
  history: ListeningMemory[];
};

export function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}

export function isTimeTrack(input: unknown): input is TimeTrack {
  if (!input || typeof input !== "object") return false;
  const t = input as Partial<TimeTrack>;
  if (t.source !== "youtube" || typeof t.videoId !== "string" || !/^[\w-]{11}$/.test(t.videoId)) return false;
  for (const key of ["id", "title", "artist", "album", "genre", "cover"] as const) {
    if (typeof t[key] !== "string" || t[key]!.length > (key === "cover" ? 2000 : 400)) return false;
  }
  if (!t.id || !t.title || !t.artist || typeof t.duration !== "number" || !Number.isFinite(t.duration) || t.duration <= 60 || t.duration > 86400) return false;
  if (t.year !== null && (typeof t.year !== "number" || !Number.isInteger(t.year) || t.year < 1900 || t.year > 2100)) return false;
  const cover = t.cover!;
  if (cover.startsWith("/time/")) return !cover.includes("..");
  try {
    const url = new URL(cover);
    return url.protocol === "https:" && ["i.ytimg.com", "i9.ytimg.com"].includes(url.hostname);
  } catch { return false; }
}
