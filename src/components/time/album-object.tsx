import type { CSSProperties } from "react";
import type { Era } from "@/lib/time/eras";
import type { TimeTrack } from "@/lib/time/types";

export function getTrackCoverUrl(track: TimeTrack): string {
  if (track.cover && !track.cover.startsWith("/time/")) {
    return track.cover;
  }
  if (track.videoId) {
    return `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`;
  }
  return track.cover || "";
}

export function Artwork({ track, className = "", eager = false }: { track: TimeTrack; className?: string; eager?: boolean }) {
  // Local covers with fallback to YouTube thumbnail if local file is missing
  // eslint-disable-next-line @next/next/no-img-element
  const coverUrl = getTrackCoverUrl(track);
  return (
    <img
      src={coverUrl}
      alt={`${track.album} — ${track.artist}`}
      className={className}
      loading={eager ? "eager" : "lazy"}
      onError={(e) => {
        const img = e.currentTarget;
        if (track.videoId && !img.src.includes("ytimg")) {
          img.src = `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`;
        }
      }}
    />
  );
}


export function AlbumObject({ track, format, playing = false, hero = false }: { track: TimeTrack; format: Era["format"]; playing?: boolean; hero?: boolean }) {
  const coverUrl = getTrackCoverUrl(track);
  return (
    <div className={`album-object format-${format} ${playing ? "rotating" : ""} ${hero ? "hero-object" : ""}`} style={{ "--art": `url("${coverUrl}")` } as CSSProperties} aria-hidden="true">
      {(format === "vinyl" || format === "cd") && <div className="album-disc"><div className="disc-label"><Artwork track={track} eager={hero} /></div><i className="disc-hole" /></div>}
      <div className="album-sleeve"><Artwork track={track} eager={hero} /><div className="sleeve-shine" /></div>
      {format === "cassette" && <><div className="tape-brand">REWIND <span>HIGH BIAS · 90</span></div><div className="tape-window"><i /><b /><i /></div><div className="tape-base"><i /><i /></div><small>SIDE A <span>{track.year}</span></small></>}
      {format === "cd" && <div className="cd-spine" />}
      {format === "digital" && <div className="digital-label"><span /><b>LOSSLESS FEELING.</b></div>}
    </div>
  );
}
