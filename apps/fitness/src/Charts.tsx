import { useEffect, useRef, useState } from "react";
import { displayDay, type Point, rollingWeek, nutrition, type Entry, days } from "./model";
export function LineChart({ points, unit, trend = false, label }: { points: Point[]; unit: string; trend?: boolean; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  if (!points.length) return <div className="chart-empty">Your first {label.toLowerCase()} entry will start this chart.</div>;
  const w = Math.max(width, 220),
    h = 220,
    left = 47,
    right = 20,
    top = 22,
    bottom = 38;
  const lo = Math.min(...points.map((p) => p.value)),
    hi = Math.max(...points.map((p) => p.value)),
    pad = Math.max((hi - lo) * 0.25, 1);
  const a = new Date(points[0].day).getTime(),
    b = new Date(points.at(-1)!.day).getTime();
  const x = (day: string) => left + (b === a ? 0.5 : (new Date(day).getTime() - a) / (b - a)) * (w - left - right);
  const y = (v: number) => top + ((hi + pad - v) / (hi - lo + 2 * pad)) * (h - top - bottom);
  const smooth = trend ? rollingWeek(points) : points;
  const path = smooth.map((p, i) => `${i ? "L" : "M"}${x(p.day)},${y(p.value)}`).join(" ");
  return (
    <div ref={box} className="chart">
      <svg
        width="100%"
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`${label}: ${points.length} observations from ${displayDay(points[0].day)} to ${displayDay(points.at(-1)!.day)}. Unit: ${unit}.`}
      >
        {[0, 0.5, 1].map((t) => {
          const v = lo - pad + t * (hi - lo + 2 * pad);
          return (
            <g key={t}>
              <line x1={left} x2={w - right} y1={y(v)} y2={y(v)} className="gridline" />
              <text x={left - 9} y={y(v) + 4} textAnchor="end">
                {v.toFixed(0)}
              </text>
            </g>
          );
        })}
        <text x={left} y={12}>
          {unit}
        </text>
        <path d={path} className="trend-line" />
        {points.map((p) => (
          <circle key={p.day} cx={x(p.day)} cy={y(p.value)} r={trend ? 3 : 4} className={trend ? "raw-point" : "point"}>
            <title>
              {displayDay(p.day)}: {p.value.toFixed(1)} {unit}
            </title>
          </circle>
        ))}
        <text x={left} y={h - 10}>
          {displayDay(points[0].day)}
        </text>
        {points.length > 1 && (
          <text x={w - right} y={h - 10} textAnchor="end">
            {displayDay(points.at(-1)!.day)}
          </text>
        )}
      </svg>
      <div className="chart-caption">
        {trend ? "Dots: daily average · Line: 7-day mean of recorded measurements" : "Highest recorded working weight per day"}
      </div>
    </div>
  );
}
export function NutritionChart({ entries, end, metric }: { entries: Entry[]; end: string; metric: "calories" | "protein" }) {
  const rows = days(end, 14).map((day) => {
    const data = nutrition(entries, day);
    return { day, ...data, hasData: data.hasData && (metric === "calories" || data.proteinKnown) };
  });
  const max = Math.max(1, ...rows.filter((r) => r.hasData).map((r) => r[metric]));
  return (
    <div>
      <div
        className="bars"
        role="img"
        aria-label={`Last 14 days of recorded ${metric}. Incomplete journals have striped bars; absent data is marked with a dash.`}
      >
        {rows.map((r) => (
          <div className="bar-column" key={r.day}>
            <span className="bar-value">{r.hasData ? Math.round(r[metric]).toLocaleString() : "—"}</span>
            <div className="bar-space">
              <div
                className={`bar ${r.complete ? "" : "partial"}`}
                style={{ height: `${r.hasData ? Math.max(2, (r[metric] / max) * 100) : 0}%` }}
                title={`${displayDay(r.day)}: ${r.hasData ? Math.round(r[metric]) : "unrecorded"} ${metric === "calories" ? "kcal" : "g"}, ${r.complete ? "complete" : "incomplete"} journal`}
              />
            </div>
            <span className="bar-date">{Number(r.day.slice(-2))}</span>
          </div>
        ))}
      </div>
      <div className="chart-caption">
        {displayDay(rows[0].day)}–{displayDay(end)} · {metric === "calories" ? "kcal" : "grams"} · Solid: complete journal · Striped: partial journal
      </div>
    </div>
  );
}
