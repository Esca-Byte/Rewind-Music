"use client";

import React from "react";
import { BarChart3, Clock3, Copy, Flame, Headphones, Music2 } from "lucide-react";
import type { TimeTrack } from "@/lib/time/types";
import type { ListeningStatsSnapshot } from "@/components/time/use-listening-stats";

interface StatsViewProps {
  stats: ListeningStatsSnapshot;
  tracks: TimeTrack[];
}

function rankedEntries(values: Record<string, number>) {
  return Object.entries(values).sort((a, b) => b[1] - a[1]).slice(0, 5);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function StatsView({ stats, tracks }: StatsViewProps) {
  const duplicateGroups = Array.from(
    tracks.reduce((groups, track) => {
      const key = `${normalize(track.title)}::${normalize(track.artist)}`;
      const group = groups.get(key) || [];
      group.push(track);
      groups.set(key, group);
      return groups;
    }, new Map<string, TimeTrack[]>()).values()
  ).filter((group) => group.length > 1);
  const days = Object.keys(stats.days).sort().reverse();
  const streak = (() => {
    if (!days.length) return 0;
    const today = new Date();
    const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0).getTime();
    const latestMid = new Date(`${days[0]}T12:00:00`).getTime();
    // Streak only counts if you listened today or yesterday
    if (!Number.isFinite(latestMid) || todayMid - latestMid > 86_400_000) return 0;
    let count = 1;
    for (let i = 1; i < days.length; i += 1) {
      const prevMid = new Date(`${days[i - 1]}T12:00:00`).getTime();
      const currMid = new Date(`${days[i]}T12:00:00`).getTime();
      if (Math.round((prevMid - currMid) / 86_400_000) === 1) {
        count += 1;
      } else {
        break;
      }
    }
    return count;
  })();
  const hours = Math.floor(stats.totalSeconds / 3600);
  const minutes = Math.floor(stats.totalSeconds / 60) % 60;

  return (
    <>
      <div className="page-intro">
        <div>
          <p className="overline">YOUR LISTENING</p>
          <h1>Listening stats<em>.</em></h1>
          <p className="intro-description">A private snapshot of the music that stayed with you.</p>
        </div>
        <BarChart3 size={28} strokeWidth={1.3} />
      </div>

      <section className="stats-overview-grid">
        <article><Clock3 size={18} /><strong>{hours}h {minutes}m</strong><span>Listening time</span></article>
        <article><Headphones size={18} /><strong>{stats.playCount}</strong><span>Play sessions</span></article>
        <article><Flame size={18} /><strong>{streak} days</strong><span>Listening streak</span></article>
      </section>

      <div className="stats-columns">
        <section className="stats-card">
          <h2><Music2 size={16} /> Top artists</h2>
          {rankedEntries(stats.artists).map(([name, count], index) => (
            <div className="stats-rank-row" key={name}><b>{String(index + 1).padStart(2, "0")}</b><span>{name}</span><small>{count} plays</small></div>
          ))}
          {!Object.keys(stats.artists).length && <p className="stats-empty">Start listening to build your profile.</p>}
        </section>
        <section className="stats-card">
          <h2><BarChart3 size={16} /> Favorite genres</h2>
          {rankedEntries(stats.genres).map(([name, count]) => (
            <div className="stats-rank-row" key={name}><span>{name}</span><small>{count} plays</small></div>
          ))}
          {!Object.keys(stats.genres).length && <p className="stats-empty">Your genre map will appear here.</p>}
        </section>
      </div>

      <section className="stats-card duplicate-card">
        <h2><Copy size={16} /> Duplicate songs <small>{duplicateGroups.length} groups</small></h2>
        {duplicateGroups.length ? duplicateGroups.slice(0, 12).map((group) => (
          <div className="duplicate-row" key={`${group[0].title}-${group[0].artist}`}>
            <div><strong>{group[0].title}</strong><span>{group[0].artist}</span></div>
            <small>{group.length} copies</small>
          </div>
        )) : <p className="stats-empty">No duplicate songs found in your current library.</p>}
      </section>
    </>
  );
}
