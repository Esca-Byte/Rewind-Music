import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

// Determine local database directory & path (defaults to ./data/music_player.db, zero config, no URL required)
const dbDirectory = path.join(process.cwd(), "data");
if (!fs.existsSync(dbDirectory)) {
  fs.mkdirSync(dbDirectory, { recursive: true });
}

const dbPath = process.env.DATABASE_PATH || path.join(dbDirectory, "music_player.db");

const globalForDb = globalThis as typeof globalThis & {
  __musicPlayerSqlite?: Database.Database;
  __musicPlayerDrizzle?: ReturnType<typeof drizzle<typeof schema>>;
};

function initSqlite() {
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");

  // Automatically ensure tables and indices exist
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

  return sqlite;
}

export const sqlite = globalForDb.__musicPlayerSqlite ?? initSqlite();
export const db = globalForDb.__musicPlayerDrizzle ?? drizzle(sqlite, { schema });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__musicPlayerSqlite = sqlite;
  globalForDb.__musicPlayerDrizzle = db;
}

