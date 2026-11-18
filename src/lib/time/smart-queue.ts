import type { TimeTrack } from "./types";
import { fetchGenreRadioTracks, fetchYouTubeAutomix, isTauriEnvironment } from "@/lib/tauri-audio";

export type RepeatMode = "off" | "all" | "one";

export type SmartQueueModeId =
  | "auto"
  | "similar-artist"
  | "chill"
  | "energetic"
  | "late-night"
  | "focus"
  | "indie"
  | "pop"
  | "hip-hop"
  | "kpop"
  | "desi"
  | "throwback";

export interface SmartQueueModeOption {
  id: SmartQueueModeId;
  label: string;
  shortLabel: string;
  description: string;
  queries: string[];
  keywords: string[];
  allowSlowed?: boolean;
}

export const SMART_QUEUE_MODES: readonly SmartQueueModeOption[] = [
  {
    id: "auto",
    label: "Match Vibe",
    shortLabel: "Match Vibe",
    description: "Collaborative radio matching the current song & your taste",
    queries: [],
    keywords: [],
  },
  {
    id: "similar-artist",
    label: "Artist Radio",
    shortLabel: "Artist",
    description: "More from this artist, collaborators & scene peers",
    queries: [],
    keywords: [],
  },
  {
    id: "chill",
    label: "Chill & Lo-Fi",
    shortLabel: "Chill",
    description: "Warm acoustic, lo-fi beats & laid-back grooves",
    queries: ["chill indie lofi acoustic songs", "soft chill vibes music", "aesthetic lofi chill songs"],
    keywords: ["chill", "lofi", "lo-fi", "acoustic", "ambient", "soft", "calm", "mellow", "warm", "unplugged", "indie"],
    allowSlowed: true,
  },
  {
    id: "energetic",
    label: "High Energy",
    shortLabel: "Energy",
    description: "Upbeat bangers, dance floor & workout momentum",
    queries: ["upbeat energetic pop dance hits", "high energy party workout songs", "viral dance bangers"],
    keywords: ["dance", "party", "energy", "workout", "gym", "edm", "phonk", "banger", "club", "upbeat", "hype", "pop"],
  },
  {
    id: "late-night",
    label: "Late Night",
    shortLabel: "Late Night",
    description: "Nocturnal R&B, atmospheric synth & midnight drives",
    queries: ["late night drive rnb synth pop songs", "midnight moody chill rnb", "2am late night vibes music"],
    keywords: ["night", "midnight", "r&b", "rnb", "synth", "moody", "dark", "1 am", "2 am", "drive", "after hours", "soul"],
    allowSlowed: true,
  },
  {
    id: "focus",
    label: "Deep Focus",
    shortLabel: "Focus",
    description: "Ambient, cinematic, neo-classical & study flow",
    queries: ["deep focus ambient study music", "minimal piano cinematic chill beats", "lofi study beats"],
    keywords: ["focus", "study", "ambient", "piano", "classical", "minimal", "cinematic", "beats", "calm"],
  },
  {
    id: "indie",
    label: "Indie & Alt",
    shortLabel: "Indie",
    description: "Independent singer-songwriters & alternative cuts",
    queries: ["best indie pop alternative songs", "indian indie acoustic hits", "modern indie rock essentials"],
    keywords: ["indie", "alternative", "alt", "bedroom", "folk", "singer", "dream pop", "shoegaze"],
  },
  {
    id: "pop",
    label: "Pop Hits",
    shortLabel: "Pop",
    description: "Chart-topping global pop & modern anthems",
    queries: ["global top pop hits songs", "modern pop essentials", "viral pop anthems"],
    keywords: ["pop", "chart", "viral", "hits", "top", "mainstream", "synthpop"],
  },
  {
    id: "hip-hop",
    label: "Hip-Hop & Rap",
    shortLabel: "Hip-Hop",
    description: "Modern rap, melodic trap & desi hip-hop flows",
    queries: ["modern hip hop rap hits", "melodic rap trap essentials", "desi hip hop top tracks"],
    keywords: ["hip hop", "hip-hop", "rap", "trap", "drill", "bars", "dhh", "r&b"],
  },
  {
    id: "kpop",
    label: "K-Pop",
    shortLabel: "K-Pop",
    description: "Seoul chart hits, idol anthems & K-R&B",
    queries: ["kpop top hits songs", "korean pop trending songs", "k-pop essential tracks"],
    keywords: ["k-pop", "kpop", "korean", "seoul", "bts", "blackpink", "newjeans", "aespa", "stray kids", "twice", "seventeen", "treasure"],
  },
  {
    id: "desi",
    label: "Desi & Bollywood",
    shortLabel: "Desi",
    description: "Hindi romance, Punjabi pop & South Indian hits",
    queries: ["trending hindi bollywood romantic songs", "punjabi pop hits", "top indian songs"],
    keywords: ["bollywood", "hindi", "punjabi", "desi", "indian", "sufi", "tamil", "telugu", "arijit"],
  },
  {
    id: "throwback",
    label: "Throwback",
    shortLabel: "Throwback",
    description: "Timeless classics from the 80s, 90s & 2000s",
    queries: ["90s 2000s throwback classic hits", "80s retro classics songs", "nostalgic timeless hits"],
    keywords: ["retro", "classic", "throwback", "80s", "90s", "2000s", "oldies", "nostalgia", "vintage"],
  },
];

export function getSmartQueueMode(modeId: SmartQueueModeId): SmartQueueModeOption {
  return SMART_QUEUE_MODES.find((m) => m.id === modeId) ?? SMART_QUEUE_MODES[0];
}

// Curated micro-scenes adapted from Echoic's MusicRepository so Indie, Desi Hip-Hop,
// Punjabi, Sufi, K-Pop, and Global scenes stay pure and cohesive.
const MAINSTREAM_BOLLYWOOD_ARTISTS = new Set([
  "pritam", "tanishk bagchi", "vishal shekhar", "vishal-shekhar", "sachin jigar",
  "sachin-jigar", "mithoon", "arijit singh", "jubin nautiyal", "neha kakkar",
  "tony kakkar", "shreya ghoshal", "sunidhi chauhan", "sonu nigam", "udit narayan",
  "alka yagnik", "kumar sanu", "himesh reshammiya", "bappi lahiri", "amaal mallik",
  "meet bros", "jeet gannguli", "rochak kohli", "tulsi kumar", "palak muchhal",
  "asees kaur", "sachet tandon", "parampara tandon", "sachet-parampara",
  "vishal mishra", "javed-mohsin", "amitabh bhattacharya", "kumaar", "irshad kamil",
]);

const SCENE_POOLS: ReadonlyArray<{ id: string; triggerWords: string[]; artists: string[] }> = [
  {
    id: "indian-indie",
    triggerWords: ["indie", "talwinder", "haseen", "majboor", "khayaal", "wishes", "arz kiya"],
    artists: [
      "Talwiinder", "Aditya Rikhari", "Anuv Jain", "Mitraz", "Abdul Hannan",
      "Hasan Raheem", "Prateek Kuhad", "Kushagra", "Zaeden", "The Local Train",
      "Bayaan", "Kaifi Khalil", "AUR", "Lifafa", "When Chai Met Toast", "King",
      "Bharat Chauhan", "Taba Chake", "Osho Jain", "Ritviz", "Twin Strings",
    ],
  },
  {
    id: "desi-hip-hop",
    triggerWords: ["dhh", "krsna", "desi hip hop", "rap"],
    artists: [
      "Karan Aujla", "Shubh", "DIVINE", "KR$NA", "Seedhe Maut",
      "Talha Anjum", "Talhah Yunus", "Young Stunners", "Sidhu Moose Wala",
      "Raftaar", "Ikka", "Hanumankind", "Paradox", "MC Stan", "Karma",
    ],
  },
  {
    id: "punjabi-pop",
    triggerWords: ["punjabi"],
    artists: [
      "Diljit Dosanjh", "AP Dhillon", "Karan Aujla", "The PropheC", "Shubh",
      "Gurinder Gill", "Amrinder Gill", "Harrdy Sandhu", "Jass Manak",
      "Talwiinder", "Tegi Pannu", "Sukha", "Navaan Sandhu",
    ],
  },
  {
    id: "sufi-soul",
    triggerWords: ["sufi", "coke studio", "qawwali"],
    artists: [
      "Atif Aslam", "Ali Sethi", "Rahat Fateh Ali Khan", "Javed Ali",
      "Nusrat Fateh Ali Khan", "Mohit Chauhan", "Shafqat Amanat Ali",
      "Kailash Kher", "Amit Trivedi", "Papon", "Farhan Saeed", "Asim Azhar",
    ],
  },
  {
    id: "kpop",
    triggerWords: ["k-pop", "kpop", "seoul", "korean"],
    artists: [
      "NewJeans", "aespa", "IVE", "LE SSERAFIM", "SEVENTEEN",
      "Stray Kids", "BLACKPINK", "BTS", "TWICE", "TREASURE",
      "ENHYPEN", "ILLIT", "BABYMONSTER", "TXT", "EXO",
    ],
  },
  {
    id: "global-pop-rnb",
    triggerWords: ["r&b", "pop", "synthpop"],
    artists: [
      "The Weeknd", "Post Malone", "Drake", "Travis Scott", "SZA",
      "Dua Lipa", "Billie Eilish", "Bruno Mars", "Ariana Grande",
      "Frank Ocean", "Sabrina Carpenter", "Lana Del Rey", "Tame Impala",
    ],
  },
  {
    id: "bollywood-modern",
    triggerWords: ["bollywood", "hindi"],
    artists: [
      "Arijit Singh", "Vishal Mishra", "Sachin-Jigar", "Pritam",
      "Darshan Raval", "Jubin Nautiyal", "KK", "Atif Aslam", "Shreya Ghoshal", "Mithoon",
    ],
  },
];

const HARD_JUNK_KEYWORDS = [
  "karaoke", "ringtone", "8d audio", "mashup", "nonstop", "non-stop",
  "jukebox", "medley", "dialogue", "tribute to", "backing track",
  "dj remix", "workout mix", "party mix", "bollywood mix", "viral mix",
  "1 hour", "2 hours", "full album", "top 50", "top 100", "reaction",
  "piano tutorial", "guitar lesson", "how to play", "status video",
];

const UNWANTED_VARIANTS = ["slowed", "reverb", "sped up", "speed up", "nightcore", "8d"];

export function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function canonicalSongTitle(rawTitle: string): string {
  const cleaned = rawTitle
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\b(official|music|video|audio|lyric|lyrics|mv|m\/v|hd|4k|full song|feat\.?.*|ft\.?.*)\b/gi, " ")
    .replace(/[|•·—–-].*$/, (segment) => {
      const lower = segment.toLowerCase();
      if (lower.includes("official") || lower.includes("lyric") || lower.includes("audio") || lower.includes("video")) {
        return " ";
      }
      return segment;
    });
  return normalizeToken(cleaned);
}

export function splitArtistCredits(rawArtist: string): string[] {
  return rawArtist
    .split(/[,&/]|\b(?:feat|ft|featuring|with|x)\b/i)
    .map((part) => part.replace(/\s*-\s*Topic$/i, "").trim())
    .filter((part) => part.length > 0 && !/^(unknown artist|various artists|youtube artist)$/i.test(part));
}

export function primaryArtistName(rawArtist: string): string {
  return splitArtistCredits(rawArtist)[0] || rawArtist.replace(/\s*-\s*Topic$/i, "").trim();
}

export function songDeduplicationSignature(track: Pick<TimeTrack, "title" | "artist">): string {
  const titleKey = canonicalSongTitle(track.title);
  const artistKey = normalizeToken(primaryArtistName(track.artist));
  return `${titleKey}|${artistKey}`;
}

export function isSeedFilmSoundtrack(seed: TimeTrack): boolean {
  const combined = `${seed.title} ${seed.artist} ${seed.album} ${seed.genre}`.toLowerCase();
  const credits = splitArtistCredits(seed.artist);
  const creditNorms = credits.map(normalizeToken);

  if (
    combined.includes("(from \"") ||
    combined.includes("[from \"") ||
    combined.includes("from \"") ||
    combined.includes("original motion picture") ||
    combined.includes("bollywood")
  ) {
    return true;
  }

  const nonFilmPools = SCENE_POOLS.filter((p) =>
    ["indian-indie", "desi-hip-hop", "punjabi-pop", "kpop", "global-pop-rnb"].includes(p.id)
  );
  const isKnownNonFilm = nonFilmPools.some((pool) =>
    pool.artists.some((artist) => {
      const norm = normalizeToken(artist);
      return norm.length > 0 && creditNorms.some((c) => c === norm || c.includes(norm) || norm.includes(c));
    })
  );
  if (isKnownNonFilm) return false;

  return credits.some((c) => MAINSTREAM_BOLLYWOOD_ARTISTS.has(c.toLowerCase()));
}

export function getCuratedScenePeers(seed: TimeTrack): string[] {
  const combined = `${seed.artist} ${seed.title} ${seed.album} ${seed.genre}`.toLowerCase();
  const primaryLower = primaryArtistName(seed.artist).toLowerCase();

  const matched = SCENE_POOLS.find(
    (pool) =>
      pool.artists.some((artist) => combined.includes(artist.toLowerCase())) ||
      pool.triggerWords.some((word) => combined.includes(word))
  );

  if (!matched) return [];

  return matched.artists
    .filter((peer) => {
      const pLower = peer.toLowerCase();
      return pLower !== primaryLower && !primaryLower.includes(pLower) && !pLower.includes(primaryLower);
    })
    .slice(0, 5);
}

export interface RadioFilterOptions {
  mode: SmartQueueModeId;
  allowSameCanonicalAsSeed?: boolean;
}

export function isCleanRadioCandidate(
  candidate: TimeTrack,
  seed: TimeTrack,
  options: RadioFilterOptions
): boolean {
  const candCanon = canonicalSongTitle(candidate.title);
  const seedCanon = canonicalSongTitle(seed.title);
  if (!candCanon) return false;
  if (!options.allowSameCanonicalAsSeed && candCanon === seedCanon) return false;

  // Reject tiny snippets (< 75s) and mega-compilations (> 12 min)
  if (candidate.duration > 0 && (candidate.duration < 75 || candidate.duration > 720)) {
    return false;
  }

  const lowerTitle = candidate.title.toLowerCase();
  const lowerAlbum = (candidate.album || "").toLowerCase();
  const lowerArtist = (candidate.artist || "").toLowerCase();
  const seedLower = seed.title.toLowerCase();

  if (HARD_JUNK_KEYWORDS.some((kw) => lowerTitle.includes(kw) || lowerAlbum.includes(kw))) {
    return false;
  }

  // Block instrumental unless focus mode or seed is instrumental
  if (
    options.mode !== "focus" &&
    !seedLower.includes("instrumental") &&
    lowerTitle.includes("instrumental")
  ) {
    return false;
  }

  const modeMeta = getSmartQueueMode(options.mode);
  const seedIsSlowedOrLofi =
    seedLower.includes("slowed") ||
    seedLower.includes("reverb") ||
    seedLower.includes("lofi") ||
    seedLower.includes("lo-fi");

  if (!seedIsSlowedOrLofi && !modeMeta.allowSlowed) {
    if (UNWANTED_VARIANTS.some((kw) => lowerTitle.includes(kw))) {
      return false;
    }
  }

  // Echoic's Strict Indie & Non-Film Vibe Separation Gate (only in auto / similar-artist / indie)
  if (
    (options.mode === "auto" || options.mode === "similar-artist" || options.mode === "indie") &&
    !isSeedFilmSoundtrack(seed)
  ) {
    const movieMarkers = [
      'from "', "from '", "(from ", "[from ",
      "original motion picture", "bollywood", "film version",
    ];
    if (movieMarkers.some((m) => lowerTitle.includes(m) || lowerAlbum.includes(m))) {
      return false;
    }

    const seedNorms = splitArtistCredits(seed.artist).map(normalizeToken);
    const candParts = splitArtistCredits(lowerArtist);
    const hasUninvitedBollywood = candParts.some((part) => {
      const pNorm = normalizeToken(part);
      const isOwn = seedNorms.some((s) => s === pNorm || s.includes(pNorm) || pNorm.includes(s));
      return !isOwn && MAINSTREAM_BOLLYWOOD_ARTISTS.has(part.toLowerCase());
    });
    if (hasUninvitedBollywood) return false;
  }

  return true;
}

export function trackMatchesSmartMode(track: TimeTrack, modeId: SmartQueueModeId): boolean {
  if (modeId === "auto" || modeId === "similar-artist") return true;
  if (modeId === "throwback") {
    if (track.year !== null && track.year > 0 && track.year <= 2012) return true;
  }
  const mode = getSmartQueueMode(modeId);
  const haystack = `${track.title} ${track.artist} ${track.album} ${track.genre}`.toLowerCase();
  if (mode.keywords.some((kw) => haystack.includes(kw))) return true;

  if (modeId === "kpop") {
    const pool = SCENE_POOLS.find((p) => p.id === "kpop");
    if (pool?.artists.some((a) => haystack.includes(a.toLowerCase()))) return true;
  }
  if (modeId === "indie") {
    const pool = SCENE_POOLS.find((p) => p.id === "indian-indie");
    if (pool?.artists.some((a) => haystack.includes(a.toLowerCase()))) return true;
  }
  if (modeId === "desi") {
    const desiPools = SCENE_POOLS.filter((p) =>
      ["bollywood-modern", "punjabi-pop", "sufi-soul"].includes(p.id)
    );
    if (desiPools.some((p) => p.artists.some((a) => haystack.includes(a.toLowerCase())))) return true;
  }
  return false;
}

export function scoreLocalSmartCandidate(
  candidate: TimeTrack,
  seed: TimeTrack,
  mode: SmartQueueModeId,
  tasteGenres: readonly string[] = [],
  tasteArtists: readonly string[] = []
): number {
  let score = 0;
  const seedGenre = (seed.genre || "").trim().toLowerCase();
  const candGenre = (candidate.genre || "").trim().toLowerCase();
  const seedArtist = normalizeToken(primaryArtistName(seed.artist));
  const candArtist = normalizeToken(primaryArtistName(candidate.artist));

  if (mode === "similar-artist") {
    if (seedArtist && seedArtist === candArtist) score += 10;
    const peers = getCuratedScenePeers(seed).map(normalizeToken);
    if (candArtist && peers.some((p) => p === candArtist || candArtist.includes(p))) score += 6;
  } else if (mode !== "auto") {
    if (trackMatchesSmartMode(candidate, mode)) score += 9;
  }

  if (seedGenre && candGenre && seedGenre === candGenre && seedGenre !== "search discovery" && seedGenre !== "smart radio") {
    score += 4;
  }

  if (seed.year !== null && candidate.year !== null) {
    if (Math.floor(seed.year / 10) === Math.floor(candidate.year / 10)) {
      score += 2.5;
      score += (10 - Math.min(Math.abs(seed.year - candidate.year), 10)) / 10;
    }
  }

  if (seedArtist && candArtist && seedArtist === candArtist) {
    score += mode === "auto" ? 2.5 : 1.5;
  }

  const peerNorms = getCuratedScenePeers(seed).map(normalizeToken);
  if (candArtist && peerNorms.some((p) => p === candArtist)) {
    score += 3.5;
  }

  if (tasteGenres.some((g) => g.toLowerCase() === candGenre)) score += 1.5;
  if (tasteArtists.some((a) => normalizeToken(a) === candArtist)) score += 1.5;

  // Slight organic jitter so repeated waves stay fresh
  score += Math.random() * 0.65;

  return score;
}

/**
 * Prevents the same artist from monopolizing consecutive slots in the queue.
 */
function paceArtists(tracks: TimeTrack[], maxConsecutive = 2): TimeTrack[] {
  const remaining = [...tracks];
  const paced: TimeTrack[] = [];
  let lastArtist = "";
  let streak = 0;

  while (remaining.length > 0) {
    let pickIndex = 0;
    if (streak >= maxConsecutive) {
      const altIndex = remaining.findIndex(
        (t) => normalizeToken(primaryArtistName(t.artist)) !== lastArtist
      );
      if (altIndex >= 0) pickIndex = altIndex;
    }
    const [picked] = remaining.splice(pickIndex, 1);
    const artistKey = normalizeToken(primaryArtistName(picked.artist));
    if (artistKey && artistKey === lastArtist) {
      streak += 1;
    } else {
      lastArtist = artistKey;
      streak = 1;
    }
    paced.push(picked);
  }

  return paced;
}

function dedupeTracks(
  candidates: readonly TimeTrack[],
  excludeIds: ReadonlySet<string>,
  excludeSignatures: ReadonlySet<string>,
  seed: TimeTrack,
  mode: SmartQueueModeId
): TimeTrack[] {
  const seenIds = new Set<string>(excludeIds);
  const seenSigs = new Set<string>(excludeSignatures);
  seenSigs.add(songDeduplicationSignature(seed));
  if (seed.id) seenIds.add(seed.id);
  if (seed.videoId) seenIds.add(seed.videoId);

  const output: TimeTrack[] = [];
  for (const track of candidates) {
    if (!track.videoId && !track.filePath) continue;
    if (seenIds.has(track.id) || (track.videoId && seenIds.has(track.videoId))) continue;
    const sig = songDeduplicationSignature(track);
    if (seenSigs.has(sig)) continue;
    if (!isCleanRadioCandidate(track, seed, { mode })) continue;

    output.push(track);
    seenIds.add(track.id);
    if (track.videoId) seenIds.add(track.videoId);
    seenSigs.add(sig);
  }
  return output;
}

export interface GenerateSmartQueueParams {
  seedTrack: TimeTrack;
  evolvingSeeds?: TimeTrack[];
  mode: SmartQueueModeId;
  localPool: readonly TimeTrack[];
  excludeIds: ReadonlySet<string>;
  excludeSignatures: ReadonlySet<string>;
  tasteGenres?: readonly string[];
  tasteArtists?: readonly string[];
  offlineOnly?: boolean;
  limit?: number;
}

/**
 * Echoic-inspired Hybrid Smart Queue & Endless Radio Builder:
 * 1. When online on Desktop, queries YouTube Music InnerTube Automix (RDAMVM) and/or Genre/Artist Song Search.
 * 2. Blends with curated micro-scene peers, evolving recent seeds, and user listening taste.
 * 3. Falls back seamlessly to local library + curated playlists when offline or in browser preview.
 * 4. Applies strict junk filtering, canonical title+artist deduplication, and artist pacing.
 */
export async function generateSmartQueueTracks(
  params: GenerateSmartQueueParams
): Promise<TimeTrack[]> {
  const {
    seedTrack,
    evolvingSeeds = [],
    mode,
    localPool,
    excludeIds,
    excludeSignatures,
    tasteGenres = [],
    tasteArtists = [],
    offlineOnly = false,
    limit = 12,
  } = params;

  const modeMeta = getSmartQueueMode(mode);
  const primaryArtist = primaryArtistName(seedTrack.artist);
  const peers = getCuratedScenePeers(seedTrack);
  const canUseRemote = !offlineOnly && isTauriEnvironment();

  let remotePrimary: TimeTrack[] = [];
  let remoteSecondary: TimeTrack[] = [];

  if (canUseRemote) {
    const isYtId = Boolean(seedTrack.videoId && seedTrack.videoId.length === 11 && !seedTrack.videoId.startsWith("local-"));

    if (mode === "auto") {
      const secondarySeed = evolvingSeeds.find(
        (t) =>
          t.videoId &&
          t.videoId.length === 11 &&
          t.videoId !== seedTrack.videoId &&
          songDeduplicationSignature(t) !== songDeduplicationSignature(seedTrack)
      );

      const tasks: Promise<TimeTrack[]>[] = [
        isYtId ? fetchYouTubeAutomix(seedTrack.videoId) : Promise.resolve([]),
        secondarySeed ? fetchYouTubeAutomix(secondarySeed.videoId) : Promise.resolve([]),
      ];

      // Also fetch a peer/artist query if seed isn't a direct YouTube ID or to enrich variety
      if (!isYtId && primaryArtist) {
        tasks.push(fetchGenreRadioTracks(`${primaryArtist} top songs`, seedTrack.genre || "Smart Radio", 12));
      } else if (peers.length > 0) {
        const randomPeer = peers[Math.floor(Math.random() * peers.length)];
        tasks.push(fetchGenreRadioTracks(`${randomPeer} songs`, seedTrack.genre || "Smart Radio", 8));
      }

      const settled = await Promise.allSettled(tasks);
      remotePrimary = settled[0].status === "fulfilled" ? settled[0].value : [];
      const evolving = settled[1].status === "fulfilled" ? settled[1].value : [];
      const peerHits = settled[2] && settled[2].status === "fulfilled" ? settled[2].value : [];
      remoteSecondary = [...evolving, ...peerHits];
    } else if (mode === "similar-artist") {
      const peerPick = peers.slice(0, 2);
      const tasks: Promise<TimeTrack[]>[] = [
        primaryArtist
          ? fetchGenreRadioTracks(`${primaryArtist} songs`, "Artist Radio", 14)
          : Promise.resolve([]),
        isYtId ? fetchYouTubeAutomix(seedTrack.videoId) : Promise.resolve([]),
        ...peerPick.map((peer) => fetchGenreRadioTracks(`${peer} songs`, "Artist Radio", 6)),
      ];
      const settled = await Promise.allSettled(tasks);
      remotePrimary = settled[0].status === "fulfilled" ? settled[0].value : [];
      const automix = settled[1].status === "fulfilled" ? settled[1].value : [];
      const peerTracks = settled
        .slice(2)
        .flatMap((res) => (res.status === "fulfilled" ? res.value : []));
      remoteSecondary = [...peerTracks, ...automix];
    } else {
      // Genre / Mood Smart Queue Mode
      const queries = modeMeta.queries;
      const pickedQuery = queries[Math.floor(Math.random() * queries.length)] || `${modeMeta.label} songs`;
      const altQuery = queries.length > 1
        ? queries[(queries.indexOf(pickedQuery) + 1) % queries.length]
        : `${modeMeta.label} essentials`;

      const tasks: Promise<TimeTrack[]>[] = [
        fetchGenreRadioTracks(pickedQuery, modeMeta.label, 14),
        fetchGenreRadioTracks(altQuery, modeMeta.label, 10),
      ];
      const settled = await Promise.allSettled(tasks);
      remotePrimary = settled[0].status === "fulfilled" ? settled[0].value : [];
      remoteSecondary = settled[1].status === "fulfilled" ? settled[1].value : [];
    }
  }

  // Local pool scoring (instant fallback for offline, web preview, and enrichment)
  const localCandidates = localPool
    .filter((track) => (!offlineOnly || Boolean(track.filePath)))
    .map((track) => ({
      track,
      score: scoreLocalSmartCandidate(track, seedTrack, mode, tasteGenres, tasteArtists),
    }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.track);

  // Clean & deduplicate each stream
  const cleanPrimary = dedupeTracks(remotePrimary, excludeIds, excludeSignatures, seedTrack, mode);
  const cleanSecondary = dedupeTracks(remoteSecondary, excludeIds, excludeSignatures, seedTrack, mode);
  const cleanLocal = dedupeTracks(localCandidates, excludeIds, excludeSignatures, seedTrack, mode);

  // Interleave primary radio + secondary variety + best local matches (Echoic Stage 3 pattern)
  const interleaved: TimeTrack[] = [];
  let p = 0;
  let s = 0;
  let l = 0;

  while (
    interleaved.length < limit * 2 &&
    (p < cleanPrimary.length || s < cleanSecondary.length || l < cleanLocal.length)
  ) {
    if (p < cleanPrimary.length) interleaved.push(cleanPrimary[p++]);
    if (p < cleanPrimary.length) interleaved.push(cleanPrimary[p++]);
    if (s < cleanSecondary.length) interleaved.push(cleanSecondary[s++]);
    if (cleanPrimary.length < 6 && l < cleanLocal.length) interleaved.push(cleanLocal[l++]);
  }

  // Append remaining local fallback if remote didn't fill enough
  while (interleaved.length < limit * 2 && l < cleanLocal.length) {
    interleaved.push(cleanLocal[l++]);
  }

  // Final strict dedupe across merged streams
  const finalUnique = dedupeTracks(interleaved, excludeIds, excludeSignatures, seedTrack, mode);
  const paced = paceArtists(finalUnique, mode === "similar-artist" ? 3 : 2);

  return paced.slice(0, limit);
}
