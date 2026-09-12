"use client";

import { ChevronLeft, ChevronRight, Clock3, Minus, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { MAX_YEAR, MIN_YEAR, clampYear } from "@/lib/time/eras";

const zooms = [60, 40, 20, 10];
const albumYears = [1973, 1977, 1982, 1985, 1991, 1997, 2000, 2001, 2006, 2013, 2015, 2016, 2020, 2022, 2024];

export function Timeline({ year, onChange }: { year: number; onChange: (year: number) => void }) {
  const [zoom, setZoom] = useState(1);
  const [windowStart, setWindowStart] = useState(1990);
  const [dragging, setDragging] = useState(false);
  const ruler = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  const range = zooms[zoom];
  // Follow a destination selected from the sidebar or year form.
  let start = windowStart;
  if (year < start || year > start + range) {
    start = Math.max(MIN_YEAR, Math.min(MAX_YEAR - range, Math.floor(year - range / 2)));
  }
  const end = start + range;
  const selectedLeft = ((year - start) / range) * 100;
  const years = Array.from({ length: range + 1 }, (_, i) => start + i);

  const fromPointer = (x: number) => {
    const rect = ruler.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
    onChange(clampYear(start + ratio * range));
  };

  const changeZoom = (next: number) => {
    if (next < 0 || next >= zooms.length) return;
    const nextRange = zooms[next];
    setWindowStart(Math.max(MIN_YEAR, Math.min(MAX_YEAR - nextRange, Math.floor(year - nextRange / 2))));
    setZoom(next);
  };

  return (
    <section className={`time-panel ${dragging ? "is-dragging" : ""}`} aria-label="Music year timeline">
      <div className="time-panel-toolbar">
        <div className="time-panel-label"><Clock3 size={15} /><strong>THE TIMELINE</strong><span>Drag to find your moment</span></div>
        <div className="timeline-zoom"><span>{range} years</span><button aria-label="Zoom out timeline" disabled={zoom === 0} onClick={() => changeZoom(zoom - 1)}><Minus size={15} /></button><i /><button aria-label="Zoom in timeline" disabled={zoom === zooms.length - 1} onClick={() => changeZoom(zoom + 1)}><Plus size={15} /></button></div>
      </div>
      <div className="timeline-ruler-wrap">
        <button className="timeline-edge left" aria-label="Travel five years back" disabled={year <= MIN_YEAR} onClick={() => onChange(clampYear(year - 5))}><ChevronLeft size={17} /></button>
        <div
          ref={ruler}
          className="timeline-ruler"
          role="slider" tabIndex={0}
          aria-label="Travel through musical years" aria-valuemin={MIN_YEAR} aria-valuemax={MAX_YEAR} aria-valuenow={year}
          aria-valuetext={`${year}. Use arrow keys to travel, or drag the timeline.`}
          onPointerDown={(e) => { e.preventDefault(); drag.current = true; setDragging(true); e.currentTarget.setPointerCapture(e.pointerId); fromPointer(e.clientX); }}
          onPointerMove={(e) => { if (drag.current) fromPointer(e.clientX); }}
          onPointerUp={(e) => { drag.current = false; setDragging(false); if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
          onPointerCancel={() => { drag.current = false; setDragging(false); }}
          onKeyDown={(e) => {
            let target = year;
            if (e.key === "ArrowRight" || e.key === "ArrowUp") target++;
            else if (e.key === "ArrowLeft" || e.key === "ArrowDown") target--;
            else if (e.key === "PageUp") target += 10;
            else if (e.key === "PageDown") target -= 10;
            else if (e.key === "Home") target = MIN_YEAR;
            else if (e.key === "End") target = MAX_YEAR;
            else return;
            e.preventDefault(); onChange(clampYear(target));
          }}
        >
          <div className="timeline-baseline" />
          {years.map((tick) => {
            const major = tick % (range <= 10 ? 1 : range <= 20 ? 5 : 10) === 0;
            return <div key={tick} className={`ruler-tick ${major ? "major" : ""} ${tick > 2026 ? "future" : ""}`} style={{ left: `${((tick - start) / range) * 100}%` }} aria-hidden="true"><i />{major && <span>{tick}</span>}</div>;
          })}
          {albumYears.filter((y) => y >= start && y <= end).map((y) => <span key={y} className={`timeline-memory-dot ${y === year ? "selected" : ""}`} style={{ left: `${((y - start) / range) * 100}%` }} aria-hidden="true" />)}
          <div className="timeline-needle" style={{ left: `${selectedLeft}%` }} aria-hidden="true"><strong>{year}</strong><i /><span /></div>
        </div>
        <button className="timeline-edge right" aria-label="Travel five years forward" disabled={year >= MAX_YEAR} onClick={() => onChange(clampYear(year + 5))}><ChevronRight size={17} /></button>
      </div>
      <div className="timeline-foot"><span><i /> A year worth listening to</span><span>PAST MEETS PLAY.</span></div>
    </section>
  );
}
