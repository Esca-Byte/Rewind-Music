"use client";

import React from "react";
import { Rewind } from "lucide-react";
import { Dialog } from "@/components/common/Dialog";

interface AboutDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutDialog({ isOpen, onClose }: AboutDialogProps) {
  if (!isOpen) return null;

  return (
    <Dialog title="About Rewind Player" onClose={onClose}>
      <div className="guide-icon">
        <Rewind size={32} fill="currentColor" />
      </div>
      <p className="overline">MUSIC WITHOUT CUTOFFS</p>
      <h2 className="dialog-title">Stream without limits.</h2>
      <div className="listening-guide">
        <p>
          <strong>Official YouTube Recordings.</strong> Stream any track from your
          curated playlists or search YouTube without 30-second preview restrictions.
        </p>
        <p>
          <strong>Your Curated Playlists.</strong> Instantly switch between Kpop
          2026, Indie India, and English Songs, with full playback and shuffle.
        </p>
        <p>
          <strong>Private Collection & History.</strong> Favorites and listening
          history are saved locally for this browser.
        </p>
        <p>
          <strong>Keyboard Shortcuts.</strong> Space to play or pause. Escape to
          close dialogs.
        </p>
      </div>
    </Dialog>
  );
}
