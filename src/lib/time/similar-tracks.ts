import type { TimeTrack } from "./types";

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

function identityKeys(track: TimeTrack): string[] {
  const keys = [`id:${track.id}`];
  if (track.videoId) keys.push(`video:${track.videoId}`);
  if (track.filePath) keys.push(`file:${track.filePath}`);
  return keys;
}

function similarity(current: TimeTrack, candidate: TimeTrack): number {
  let score = 0;
  const genre = normalized(current.genre);
  const artist = normalized(current.artist);

  if (genre && genre === normalized(candidate.genre)) score += 4;
  if (current.year !== null && candidate.year !== null) {
    if (Math.floor(current.year / 10) === Math.floor(candidate.year / 10)) {
      score += 3;
      // A nearby release wins a tie within the same decade.
      score += (10 - Math.min(Math.abs(current.year - candidate.year), 10)) / 10;
    }
  }
  if (artist && artist === normalized(candidate.artist)) score += 2;

  return score;
}

/** Rank a supplied pool (curated tracks, user playlists, etc.) for the smart queue.
 * Matches come first; sparse metadata still yields a deterministic fallback.
 */
export function getSimilarTracks(
  currentTrack: TimeTrack,
  candidates: readonly TimeTrack[],
  limit = 10
): TimeTrack[] {
  const count = Math.floor(limit);
  if (!Number.isFinite(count) || count <= 0) return [];

  const currentKeys = new Set(identityKeys(currentTrack));
  const seen = new Set(currentKeys);
  const ranked = candidates
    .map((track, index) => ({ track, index, score: similarity(currentTrack, track) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const result: TimeTrack[] = [];
  for (const { track } of ranked) {
    const keys = identityKeys(track);
    if (keys.some((key) => seen.has(key))) continue;
    result.push(track);
    keys.forEach((key) => seen.add(key));
    if (result.length >= count) break;
  }
  return result;
}
