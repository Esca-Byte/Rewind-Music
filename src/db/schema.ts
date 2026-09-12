import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { TimeTrack } from "@/lib/time/types";

export const rewindFavorites = sqliteTable("rewind_favorites", {
  listenerId: text("listener_id").notNull(),
  trackId: text("track_id").notNull(),
  track: text("track", { mode: "json" }).$type<TimeTrack>().notNull(),
  savedAt: integer("saved_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
}, (table) => [primaryKey({ columns: [table.listenerId, table.trackId] })]);

export const rewindListens = sqliteTable("rewind_listens", {
  id: text("id").primaryKey(),
  listenerId: text("listener_id").notNull(),
  trackId: text("track_id").notNull(),
  track: text("track", { mode: "json" }).$type<TimeTrack>().notNull(),
  playedAt: integer("played_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
}, (table) => [index("rewind_listens_listener_date_idx").on(table.listenerId, table.playedAt)]);

