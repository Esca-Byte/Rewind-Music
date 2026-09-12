import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { NextRequest } from "next/server";
import { getTrack, tracks } from "@/lib/tracks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "_").trim() || "audio";
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const videoId = searchParams.get("videoId") || searchParams.get("v");
  const trackId = searchParams.get("id");
  const title = searchParams.get("title") || "track";
  const artist = searchParams.get("artist") || "";

  // 1. YouTube Audio Download via yt-dlp
  if (videoId) {
    const filename = sanitizeFilename(artist ? `${artist} - ${title}` : title);
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    try {
      const proc = spawn("python", [
        "-m", "yt_dlp",
        "-f", "ba[ext=m4a]/ba/b",
        "-o", "-",
        "--no-warnings",
        "--no-playlist",
        videoUrl,
      ]);

      request.signal.addEventListener("abort", () => {
        try { proc.kill(); } catch {}
      });

      const webStream = Readable.toWeb(proc.stdout) as ReadableStream<Uint8Array>;

      return new Response(webStream, {
        status: 200,
        headers: {
          "Content-Type": "audio/mp4",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}.m4a"; filename*=UTF-8''${encodeURIComponent(filename)}.m4a`,
          "Cache-Control": "private, no-cache",
        },
      });
    } catch (error) {
      console.error("YouTube audio download failed:", error);
      return Response.json(
        { error: "Could not start audio download. Please ensure yt-dlp is available." },
        { status: 500 }
      );
    }
  }

  // 2. Demo track fallback
  const demoTrack = getTrack(trackId);
  if (!demoTrack) {
    return Response.json({ error: "No videoId or demo track specified" }, { status: 400 });
  }

  try {
    const upstream = await fetch(demoTrack.source, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
    if (!upstream.ok || !upstream.body) {
      return Response.json({ error: "The demo download is temporarily unavailable" }, { status: 502 });
    }
    const number = tracks.findIndex((item) => item.id === demoTrack.id) + 1;
    const headers = new Headers({
      "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
      "Content-Disposition": `attachment; filename="SoundHelix-Song-${number}.mp3"`,
      "Cache-Control": "private, no-store",
    });
    const length = upstream.headers.get("content-length");
    if (length) headers.set("Content-Length", length);
    return new Response(upstream.body, { headers });
  } catch {
    return Response.json({ error: "The download source didn’t respond. Please retry." }, { status: 502 });
  }
}
