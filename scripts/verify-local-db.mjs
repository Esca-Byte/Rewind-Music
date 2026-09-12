import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, desc, eq } from "drizzle-orm";
import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";
import fs from "node:fs";
import path from "node:path";

const dbDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const testDbPath = path.join(dbDir, "music_player.db");
console.log("Checking DB path:", testDbPath);

const sqlite = new Database(testDbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("synchronous = NORMAL");

// DDL
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS rewind_favorites (
    listener_id TEXT NOT NULL,
    track_id TEXT NOT NULL,
    track TEXT NOT NULL,
    saved_at INTEGER NOT NULL,
    PRIMARY KEY (listener_id, track_id)
  );

  CREATE TABLE IF NOT EXISTS rewind_listens (
    id TEXT PRIMARY KEY,
    listener_id TEXT NOT NULL,
    track_id TEXT NOT NULL,
    track TEXT NOT NULL,
    played_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS rewind_listens_listener_date_idx 
  ON rewind_listens (listener_id, played_at);
`);

const rewindFavorites = sqliteTable("rewind_favorites", {
  listenerId: text("listener_id").notNull(),
  trackId: text("track_id").notNull(),
  track: text("track", { mode: "json" }).notNull(),
  savedAt: integer("saved_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
}, (table) => [primaryKey({ columns: [table.listenerId, table.trackId] })]);

const rewindListens = sqliteTable("rewind_listens", {
  id: text("id").primaryKey(),
  listenerId: text("listener_id").notNull(),
  trackId: text("track_id").notNull(),
  track: text("track", { mode: "json" }).notNull(),
  playedAt: integer("played_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
}, (table) => [index("rewind_listens_listener_date_idx").on(table.listenerId, table.playedAt)]);

const db = drizzle(sqlite, { schema: { rewindFavorites, rewindListens } });

const testListener = "test-listener-12345";
const testTrack = {
  id: "test-track-1",
  title: "Bohemian Rhapsody",
  artist: "Queen",
  album: "A Night at the Opera",
  year: 1975,
  cover: "/covers/bohemian.jpg",
};

// 1. Test insert favorite
console.log("1. Testing insert favorite...");
db.insert(rewindFavorites)
  .values({ listenerId: testListener, trackId: testTrack.id, track: testTrack, savedAt: new Date() })
  .onConflictDoUpdate({
    target: [rewindFavorites.listenerId, rewindFavorites.trackId],
    set: { track: testTrack, savedAt: new Date() },
  })
  .run();

// 2. Query favorites
console.log("2. Querying favorites...");
const favs = db.select().from(rewindFavorites).where(eq(rewindFavorites.listenerId, testListener)).all();
console.log("Found favorites count:", favs.length, "Track title:", favs[0]?.track?.title);

// 3. Test insert listen
console.log("3. Testing insert listen...");
const listenId = "listen-" + Date.now();
db.insert(rewindListens)
  .values({ id: listenId, listenerId: testListener, trackId: testTrack.id, track: testTrack, playedAt: new Date() })
  .run();

// 4. Query listens
console.log("4. Querying history...");
const history = db.select().from(rewindListens).where(eq(rewindListens.listenerId, testListener)).all();
console.log("Found history count:", history.length, "Latest track:", history[0]?.track?.title);

// 5. Clean up test record
db.delete(rewindFavorites).where(eq(rewindFavorites.listenerId, testListener)).run();
db.delete(rewindListens).where(eq(rewindListens.listenerId, testListener)).run();
console.log("Cleaned up test data.");

sqlite.close();
console.log("All local database operations passed with flying colors!");
