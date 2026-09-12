import recordings from "./catalog.json";
import type { TimeTrack } from "./types";
import { eraFor, TODAY_YEAR } from "./eras";

export const catalog: TimeTrack[] = recordings.map((record) => ({ ...record, source: "youtube" }));

export function songsForYear(year: number) {
  if (year > TODAY_YEAR) return [];
  const era = eraFor(year);
  return catalog.filter((track) => track.year !== null && track.year >= era.decade && track.year < era.decade + 10)
    .sort((a, b) => Math.abs((a.year ?? year) - year) - Math.abs((b.year ?? year) - year));
}
