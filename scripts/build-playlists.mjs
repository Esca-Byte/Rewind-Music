import { writeFile } from "node:fs/promises";
import { Innertube, YTNodes } from "youtubei.js";

function parseDurationText(str) {
  if (!str) return 180;
  const parts = str.split(":").map(Number);
  if (parts.some(isNaN)) return 180;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 180;
}

function cleanTitle(raw) {
  if (!raw) return "Untitled";
  return raw
    .replace(/\s*\[(?:Official\s+)?(?:Music\s+Video|MV|Audio|Lyric\s+Video|Lyrics)\]/gi, "")
    .replace(/\s*\((?:Official\s+)?(?:Music\s+Video|MV|Audio|Lyric\s+Video|Lyrics)\)/gi, "")
    .replace(/\s*【(?:Official\s+)?(?:Music\s+Video|MV|Audio|Lyrics)】/gi, "")
    .trim();
}

function extractPlaylistTrack(item, playlistTitle) {
  if (item instanceof YTNodes.PlaylistVideo || item?.id) {
    const videoId = item.id || item.video_id;
    if (!videoId) return null;
    const rawTitle = item.title?.text || item.title || "Untitled";
    const author = item.author?.name || "Various Artists";
    const duration = item.duration?.seconds || parseDurationText(item.duration?.text);
    const cover = item.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    
    // Split "Artist - Title" if author is channel/aggregator
    let title = cleanTitle(rawTitle);
    let artist = author;
    if (title.includes(" - ")) {
      const parts = title.split(" - ");
      artist = parts[0].trim();
      title = parts.slice(1).join(" - ").trim();
    }

    return {
      id: `pl-${videoId}`,
      videoId,
      title,
      artist,
      album: playlistTitle,
      genre: playlistTitle,
      year: 2026,
      duration,
      cover,
      source: "youtube"
    };
  }

  if (item?.type === "LockupView" || item?.content_id) {
    const videoId = item.content_id;
    if (!videoId) return null;
    const rawTitle = item.metadata?.title?.text || "Untitled";
    const authorPart = item.metadata?.metadata?.metadata_rows?.[0]?.metadata_parts?.[0]?.text?.text;
    const author = authorPart || "Various Artists";
    const badge = item.content_image?.overlays?.[0]?.badges?.[0]?.text;
    const duration = parseDurationText(badge);
    const cover = item.content_image?.image?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    
    let title = cleanTitle(rawTitle);
    let artist = author;
    if (title.includes(" - ")) {
      const parts = title.split(" - ");
      artist = parts[0].trim();
      title = parts.slice(1).join(" - ").trim();
    }

    return {
      id: `pl-${videoId}`,
      videoId,
      title,
      artist,
      album: playlistTitle,
      genre: playlistTitle,
      year: 2026,
      duration,
      cover,
      source: "youtube"
    };
  }

  return null;
}

async function main() {
  const yt = await Innertube.create({ retrieve_player: false, generate_session_locally: true, lang: "en", location: "US" });
  
  const playlistDefs = [
    {
      id: "kpop-2026",
      youtubeId: "PL9RiXq3CWn9rA8MIu14yONp2ufqkvrrJd",
      title: "Kpop 2026",
      tagline: "High-energy Korean pop, synth rhythms, and trending idol releases.",
      accent: "#e11d48",
      icon: "Sparkles",
      url: "https://youtube.com/playlist?list=PL9RiXq3CWn9rA8MIu14yONp2ufqkvrrJd"
    },
    {
      id: "indie-india",
      youtubeId: "PLhcVVbS7iNzCyEMIVbUmUVthl5LmNCG-g",
      title: "Indie India",
      tagline: "Soulful acoustic gems, Coke Studio Bharat anthems, and indie favorites.",
      accent: "#f59e0b",
      icon: "AudioLines",
      url: "https://youtube.com/playlist?list=PLhcVVbS7iNzCyEMIVbUmUVthl5LmNCG-g"
    },
    {
      id: "english-songs",
      youtubeId: "PLDIoUOhQQPlXzhp-83rECoLaV6BwFtNC4",
      title: "English Songs",
      tagline: "Worldwide viral melodies, lyric anthems, and top chart toppers.",
      accent: "#3b82f6",
      icon: "Headphones",
      url: "https://youtube.com/playlist?list=PLDIoUOhQQPlXzhp-83rECoLaV6BwFtNC4"
    }
  ];

  const results = [];

  for (const def of playlistDefs) {
    console.log(`Processing ${def.title}...`);
    const pl = await yt.getPlaylist(def.youtubeId);
    const seen = new Set();
    const tracks = [];
    for (const v of pl.videos) {
      const track = extractPlaylistTrack(v, def.title);
      if (track && !seen.has(track.videoId)) {
        seen.add(track.videoId);
        tracks.push(track);
      }
    }
    const cover = tracks[0]?.cover || "";
    results.push({
      ...def,
      cover,
      trackCount: tracks.length,
      totalDuration: tracks.reduce((acc, t) => acc + t.duration, 0),
      tracks
    });
    console.log(`-> Saved ${tracks.length} tracks for ${def.title}`);
  }

  await writeFile("src/lib/time/playlists.json", JSON.stringify(results, null, 2) + "\n");
  console.log("src/lib/time/playlists.json written successfully!");
}

main();
