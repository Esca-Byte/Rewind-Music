"use client";

import React from "react";
import { ChevronRight, ListMusic, Plus } from "lucide-react";
import { Dialog } from "@/components/common/Dialog";
import { Artwork } from "@/components/time/album-object";
import type { TimeTrack } from "@/lib/time/types";
import type { UserPlaylist } from "@/types/music";

interface AddToPlaylistDialogProps {
  track: TimeTrack | null;
  customPlaylists: UserPlaylist[];
  onClose: () => void;
  onAddTrackToPlaylist: (playlistId: string, track: TimeTrack) => void;
  onCreatePlaylistWithTrack: (name: string, track: TimeTrack) => void;
}

export function AddToPlaylistDialog({
  track,
  customPlaylists,
  onClose,
  onAddTrackToPlaylist,
  onCreatePlaylistWithTrack,
}: AddToPlaylistDialogProps) {
  if (!track) return null;

  return (
    <Dialog title="Add to Playlist" onClose={onClose}>
      <div className="playlist-dialog-header">
        <Artwork track={track} />
        <div>
          <p className="overline">ADD TO PLAYLIST</p>
          <h2 className="dialog-title">{track.title}</h2>
          <p className="dialog-subtitle">{track.artist}</p>
        </div>
      </div>

      <div className="add-to-playlist-options">
        <button
          className="quick-new-playlist-item"
          onClick={() => {
            const name = prompt("Enter new playlist name:");
            if (name && name.trim()) {
              onCreatePlaylistWithTrack(name.trim(), track);
              onClose();
            }
          }}
        >
          <Plus size={17} />
          <span>Create new playlist with this track</span>
        </button>

        <div className="existing-playlists-list">
          <label className="playlist-select-label">SELECT PLAYLIST</label>
          {customPlaylists.length === 0 ? (
            <p className="no-playlists-hint">
              You haven&apos;t created any custom playlists yet. Click above to create one!
            </p>
          ) : (
            customPlaylists.map((pl) => (
              <button
                key={pl.id}
                className="select-playlist-row"
                onClick={() => onAddTrackToPlaylist(pl.id, track)}
              >
                <div className="select-playlist-thumb">
                  <ListMusic size={17} />
                </div>
                <div className="select-playlist-meta">
                  <strong>{pl.title}</strong>
                  <small>{pl.tracks.length} tracks</small>
                </div>
                <ChevronRight size={15} />
              </button>
            ))
          )}
        </div>
      </div>
    </Dialog>
  );
}
