import type { TimeTrack } from "@/lib/time/types";
import type { AppTheme } from "@/types/music";

export const MINI_PLAYER_STATE_EVENT = "rewind:mini-player-state";
export const MINI_PLAYER_COMMAND_EVENT = "rewind:mini-player-command";
export const MINI_PLAYER_READY_EVENT = "rewind:mini-player-ready";

export type MiniPlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";

export interface MiniPlayerSnapshot {
  track: TimeTrack;
  playing: boolean;
  status: MiniPlayerStatus;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  theme?: AppTheme;
  isSaved?: boolean;
}

export type MiniPlayerCommand =
  | { command: "toggle" }
  | { command: "previous" }
  | { command: "next" }
  | { command: "toggleMute" }
  | { command: "seek"; position: number }
  | { command: "restore" }
  | { command: "hide" }
  | { command: "toggleFavorite" };
