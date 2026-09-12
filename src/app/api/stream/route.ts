import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { NextRequest } from "next/server";
import { getTrack } from "@/lib/tracks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const urlCache = new Map<string, { url: string; expires: number }>();

async function getDirectAudioUrl(videoId: string): Promise<string | null> {
  const cached = urlCache.get(videoId);
  if (cached && cached.expires > Date.now()) {
    return cached.url;
  }

  return new Promise((resolve) => {
    const proc = spawn("python", [
      "-m", "yt_dlp",
      "-f", "ba[ext=m4a]/ba/b",
      "-g",
      "--no-warnings",
      "--no-playlist",
      `https://www.youtube.com/watch?v=${videoId}`,
    ]);

    let output = "";
    proc.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code === 0 && output.trim()) {
        const lines = output.trim().split("\n");
        const directUrl = lines[lines.length - 1].trim();
        if (directUrl.startsWith("http")) {
          urlCache.set(videoId, { url: directUrl, expires: Date.now() + 45 * 60 * 1000 });
          resolve(directUrl);
          return;
        }
      }
      resolve(null);
    });

    proc.on("error", () => resolve(null));

    setTimeout(() => {
      try { proc.kill(); } catch {}
      resolve(null);
    }, 12000);
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const videoId = searchParams.get("videoId") || searchParams.get("v");
  const trackId = searchParams.get("id");

  // 1. YouTube Pure Audio Stream
  if (videoId) {
    const directUrl = await getDirectAudioUrl(videoId);
    if (directUrl) {
      // Redirect HTML5 <audio> directly to high-speed audio stream
      return Response.redirect(directUrl, 307);
    }

    // Fallback: pipe directly via yt-dlp
    try {
      const proc = spawn("python", [
        "-m", "yt_dlp",
        "-f", "ba[ext=m4a]/ba/b",
        "-o", "-",
        "--no-warnings",
        "--no-playlist",
        `https://www.youtube.com/watch?v=${videoId}`,
      ]);

      request.signal.addEventListener("abort", () => {
        try { proc.kill(); } catch {}
      });

      const webStream = Readable.toWeb(proc.stdout) as ReadableStream<Uint8Array>;
      return new Response(webStream, {
        status: 200,
        headers: {
          "Content-Type": "audio/mp4",
          "Cache-Control": "private, no-cache",
        },
      });
    } catch (error) {
      console.error("Audio pipe fallback failed:", error);
      return Response.json({ error: "Failed to stream audio" }, { status: 500 });
    }
  }

  // 2. Demo track fallback
  const demoTrack = getTrack(trackId);
  if (!demoTrack) {
    return Response.json({ error: "Track not found" }, { status: 404 });
  }

  const range = request.headers.get("range");
  const upstream = await fetch(demoTrack.source, {
    headers: range ? { Range: range } : undefined,
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return Response.json({ error: "Audio source unavailable" }, { status: 502 });
  }

  const headers = new Headers();
  for (const name of ["accept-ranges", "content-length", "content-range", "content-type"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("Cache-Control", "public, max-age=3600");

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
