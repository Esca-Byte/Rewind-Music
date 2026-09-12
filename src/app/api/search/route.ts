import { NextRequest } from "next/server";
import { Innertube, YTNodes } from "youtubei.js";
import type { TimeTrack } from "@/lib/time/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let clientPromise: ReturnType<typeof Innertube.create> | null = null;
const cache = new Map<string, { at: number; results: TimeTrack[] }>();

function getClient() {
  clientPromise ??= Innertube.create({
    lang: "en", location: "US", retrieve_player: false, generate_session_locally: true,
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(18_000) }),
  });
  return clientPromise;
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return Response.json({ results: [] });
  if (query.length > 120) return Response.json({ error: "Keep your search under 120 characters." }, { status: 400 });
  const key = query.toLowerCase();
  const headers = { "Cache-Control": "public, max-age=180, stale-while-revalidate=300" };
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < 300_000) return Response.json({ results: cached.results, playback: "full-recording" }, { headers });
  try {
    const youtube = await getClient();
    const search = await youtube.search(`${query} official audio`, { type: "video" });
    const seen = new Set<string>();
    const results: TimeTrack[] = search.videos
      .filter((video): video is YTNodes.Video => video instanceof YTNodes.Video)
      .filter((video) => {
        const seconds = video.duration.seconds;
        if (!video.video_id || !video.title.text || video.is_live || video.is_upcoming || seconds <= 60 || seconds > 7200) return false;
        if (/\b(preview|teaser|trailer|shorts|snippet|ringtone)\b/i.test(video.title.text)) return false;
        if (seen.has(video.video_id)) return false;
        seen.add(video.video_id);
        return true;
      })
      .slice(0, 12)
      .map((video) => ({
        id: `yt-${video.video_id}`, videoId: video.video_id,
        title: video.title.text!, artist: video.author?.name || "YouTube artist",
        album: "YouTube recording", genre: "Search discovery", year: null,
        duration: video.duration.seconds,
        cover: `https://i.ytimg.com/vi/${video.video_id}/hqdefault.jpg`,
        source: "youtube",
      }));
    if (cache.size >= 80) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), results });
    return Response.json({ results, playback: "full-recording" }, { headers });
  } catch (error) {
    clientPromise = null;
    console.error("Full-recording search failed:", error);
    return Response.json({ error: "The music search service is temporarily unavailable. Try again shortly; we won’t substitute a preview." }, { status: 503 });
  }
}
