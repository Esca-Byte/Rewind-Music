import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { rewindFavorites, rewindListens } from "@/db/schema";
import { isTimeTrack } from "@/lib/time/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const COOKIE = "rewind_listener";

function identity(request: NextRequest) {
  const value = request.cookies.get(COOKIE)?.value;
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : randomUUID();
}

function respond(request: NextRequest, listenerId: string, data: unknown, status = 200) {
  const response = NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
  response.cookies.set(COOKIE, listenerId, {
    httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:",
    maxAge: 60 * 60 * 24 * 365, path: "/",
  });
  return response;
}

export async function GET(request: NextRequest) {
  const listenerId = identity(request);
  try {
    const favorites = db
      .select()
      .from(rewindFavorites)
      .where(eq(rewindFavorites.listenerId, listenerId))
      .orderBy(desc(rewindFavorites.savedAt))
      .all();

    const history = db
      .select()
      .from(rewindListens)
      .where(eq(rewindListens.listenerId, listenerId))
      .orderBy(desc(rewindListens.playedAt))
      .limit(500)
      .all();

    return respond(request, listenerId, {
      favorites: favorites.map((f) => f.track),
      history: history.map((h) => ({
        id: h.id,
        track: h.track,
        playedAt: h.playedAt instanceof Date ? h.playedAt.toISOString() : new Date(h.playedAt).toISOString(),
      })),
    });
  } catch (error) {
    console.error("Rewind local library error:", error);
    return respond(request, listenerId, { error: "Your local library could not be loaded." }, 500);
  }
}

export async function POST(request: NextRequest) {
  const listenerId = identity(request);
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (origin && new URL(origin).host !== host) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });

  try {
    const body = await request.json();
    if (!isTimeTrack(body.track)) return respond(request, listenerId, { error: "Invalid recording" }, 400);
    const track = body.track;

    if (body.action === "favorite" && typeof body.saved === "boolean") {
      if (body.saved) {
        db.insert(rewindFavorites)
          .values({ listenerId, trackId: track.id, track, savedAt: new Date() })
          .onConflictDoUpdate({
            target: [rewindFavorites.listenerId, rewindFavorites.trackId],
            set: { track, savedAt: new Date() },
          })
          .run();
      } else {
        db.delete(rewindFavorites)
          .where(and(eq(rewindFavorites.listenerId, listenerId), eq(rewindFavorites.trackId, track.id)))
          .run();
      }
      return respond(request, listenerId, { ok: true, saved: body.saved });
    }

    if (body.action === "listen") {
      // Repeated play/pause events are one memory, not duplicate listens.
      const [last] = db
        .select()
        .from(rewindListens)
        .where(eq(rewindListens.listenerId, listenerId))
        .orderBy(desc(rewindListens.playedAt))
        .limit(1)
        .all();

      if (last && last.trackId === track.id) {
        const lastPlayedMs = last.playedAt instanceof Date ? last.playedAt.getTime() : new Date(last.playedAt).getTime();
        if (Date.now() - lastPlayedMs < 30_000) {
          return respond(request, listenerId, {
            memory: {
              id: last.id,
              track: last.track,
              playedAt: last.playedAt instanceof Date ? last.playedAt.toISOString() : new Date(last.playedAt).toISOString(),
            },
          });
        }
      }

      const id = randomUUID();
      const now = new Date();
      db.insert(rewindListens)
        .values({
          id,
          listenerId,
          trackId: track.id,
          track,
          playedAt: now,
        })
        .run();

      return respond(request, listenerId, {
        memory: { id, track, playedAt: now.toISOString() },
      });
    }

    return respond(request, listenerId, { error: "Unknown library action" }, 400);
  } catch (error) {
    console.error("Rewind local library update error:", error);
    return respond(request, listenerId, { error: "Could not save this change to local library." }, 500);
  }
}

