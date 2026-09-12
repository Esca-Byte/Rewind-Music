export const MIN_YEAR = 1970;
export const MAX_YEAR = 2030;
export const TODAY_YEAR = 2026;

export type Era = {
  decade: number;
  name: string;
  tagline: string;
  description: string;
  format: "vinyl" | "cassette" | "cd" | "digital";
  formatLabel: string;
  accent: string;
  paper: string;
  tint: string;
};

export const eras: Era[] = [
  { decade: 1970, name: "The golden age", tagline: "A needle. A groove. A feeling.", description: "Warm records, long afternoons, and songs that never really left us.", format: "vinyl", formatLabel: "The vinyl years", accent: "#8d683e", paper: "#f3ede1", tint: "#e9ddc6" },
  { decade: 1980, name: "The mixtape generation", tagline: "Made for the other side.", description: "Synths in the skyline. A favorite tape. One more song before you go.", format: "cassette", formatLabel: "The cassette years", accent: "#946678", paper: "#f4eff0", tint: "#e8dce2" },
  { decade: 1990, name: "The alternative years", tagline: "A little louder. A little freer.", description: "Bedroom posters, scratched CDs, and the songs that understood you.", format: "cd", formatLabel: "The compact disc years", accent: "#677451", paper: "#f1f2eb", tint: "#e3e6d6" },
  { decade: 2000, name: "The shuffle generation", tagline: "Your whole world, on shuffle.", description: "Burned CDs, late-night downloads, and a thousand songs in your pocket.", format: "cd", formatLabel: "The burned-CD years", accent: "#58758a", paper: "#edf1f3", tint: "#dce5eb" },
  { decade: 2010, name: "The indie renaissance", tagline: "You had to be there.", description: "Late-night drives. Songs on repeat.\nSome years just sound different.", format: "vinyl", formatLabel: "The vinyl revival", accent: "#bd5838", paper: "#f7f5ef", tint: "#efe6d9" },
  { decade: 2020, name: "The next chapter", tagline: "The memories we’re making.", description: "New voices, familiar feelings. The soundtrack to right here, right now.", format: "digital", formatLabel: "The streaming years", accent: "#6775a0", paper: "#f1f2f7", tint: "#e3e5f0" },
];

export function eraFor(year: number): Era {
  return eras.find((era) => year >= era.decade && year < era.decade + 10) ?? eras[eras.length - 1];
}

export function clampYear(year: number) {
  return Math.min(MAX_YEAR, Math.max(MIN_YEAR, Math.round(year)));
}
