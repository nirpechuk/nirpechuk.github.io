import { useEffect, useRef, useState } from "react";
import { addDays, days, displayDay, nutrition, rollingWeek, weekStart, weightPoints, type Entry, type Point, type Settings } from "./model";
interface Observation {
  day: string;
  value: number | null;
  complete?: boolean;
}
function Plot({
  values,
  unit,
  range,
  zero = false,
  trend = false,
  target,
}: {
  values: Observation[];
  unit: string;
  range: [string, string];
  zero?: boolean;
  trend?: boolean;
  target?: number | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(500);
  const [selected, setSelected] = useState<Observation | null>(null);
  useEffect(() => {
    const r = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    if (ref.current) r.observe(ref.current);
    return () => r.disconnect();
  }, []);
  useEffect(() => setSelected(null), [range[0], range[1]]);
  const present = values.filter((v): v is Observation & { value: number } => v.value !== null);
  const w = Math.max(width, 220),
    h = 225,
    l = 46,
    r = 18,
    t = 25,
    b = 33,
    pw = w - l - r,
    ph = h - t - b;
  const actual = present.map((p) => p.value);
  if (target) actual.push(target);
  const low = actual.length ? Math.min(...actual) : 0,
    high = actual.length ? Math.max(...actual) : 1;
  const pad = Math.max((high - low) * 0.2, unit === "kcal" ? 100 : unit === "g" ? 10 : 1);
  const ymin = zero ? 0 : low - pad,
    ymax = high + pad;
  const from = new Date(range[0]).getTime(),
    to = new Date(range[1]).getTime();
  const x = (d: string) => l + ((new Date(d).getTime() - from) / Math.max(1, to - from)) * pw;
  const y = (n: number) => t + ((ymax - n) / (ymax - ymin)) * ph;
  let pen = false;
  const path = values
    .map((v) => {
      if (v.value === null) {
        pen = false;
        return "";
      }
      const part = `${pen ? "L" : "M"}${x(v.day)},${y(v.value)}`;
      pen = true;
      return part;
    })
    .join(" ");
  const valid = present.filter((p) => p.complete !== false).map((p) => ({ day: p.day, value: p.value }));
  const mean = rollingWeek(valid);
  const meanPath = mean.map((p, i) => `${i ? "L" : "M"}${x(p.day)},${y(p.value)}`).join(" ");
  const ticks = Array.from({ length: 5 }, (_, i) => ymin + ((ymax - ymin) * i) / 4);
  function inspect(clientX: number, left: number) {
    const dx = clientX - left;
    const nearest = values.reduce<Observation | null>((best, p) => (!best || Math.abs(x(p.day) - dx) < Math.abs(x(best.day) - dx) ? p : best), null);
    setSelected(nearest);
  }
  return (
    <div className="scientific-plot" ref={ref}>
      <svg
        width="100%"
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`${unit} over time, ${present.length} recorded days. ${present.length ? `Range ${low.toFixed(1)} to ${high.toFixed(1)}.` : "No observations yet."}`}
        onPointerMove={(e) => inspect(e.clientX, e.currentTarget.getBoundingClientRect().left)}
        onPointerLeave={() => setSelected(null)}
      >
        {Array.from({ length: 9 }, (_, i) => (
          <line key={`v${i}`} x1={l + (pw * i) / 8} x2={l + (pw * i) / 8} y1={t} y2={h - b} className="plot-minor" />
        ))}
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={l} x2={w - r} y1={y(v)} y2={y(v)} className="plot-grid" />
            {present.length > 0 && (
              <text x={l - 8} y={y(v) + 4} textAnchor="end">
                {unit === "lb" || unit === "kg" ? v.toFixed(1) : Math.round(v).toLocaleString()}
              </text>
            )}
          </g>
        ))}
        <text x={l} y={12} className="axis-unit">
          {unit}
        </text>
        <line x1={l} x2={w - r} y1={h - b} y2={h - b} className="plot-axis" />
        {target && (
          <>
            <line x1={l} x2={w - r} y1={y(target)} y2={y(target)} className="plot-target" />
            <text x={w - r - 3} y={y(target) - 5} textAnchor="end">
              target {target}
            </text>
          </>
        )}
        <path d={path} className={trend ? "observation-line" : "measurement-line"} />
        {trend && <path d={meanPath} className="mean-line" />}
        {present.map((p) => (
          <circle
            key={p.day}
            cx={x(p.day)}
            cy={y(p.value)}
            r={p.complete === false ? 3.1 : 2.5}
            className={p.complete === false ? "incomplete-point" : "observation-point"}
          >
            <title>
              {displayDay(p.day)}: {p.value.toFixed(1)} {unit}
              {p.complete === false ? " · partial journal" : ""}
            </title>
          </circle>
        ))}
        {!present.length && (
          <text x={l + pw / 2} y={t + ph / 2} textAnchor="middle" className="plot-empty">
            Awaiting observations
          </text>
        )}
        {selected && <line x1={x(selected.day)} x2={x(selected.day)} y1={t} y2={h - b} className="plot-cursor" />}
        <text x={l} y={h - 10}>
          {displayDay(range[0])}
        </text>
        <text x={l + pw / 2} y={h - 10} textAnchor="middle">
          {displayDay(addDays(range[0], Math.round((to - from) / 86400000 / 2)))}
        </text>
        <text x={w - r} y={h - 10} textAnchor="end">
          {displayDay(range[1])}
        </text>
      </svg>
      <div className="plot-readout" aria-live="polite">
        {selected
          ? `${displayDay(selected.day)} / ${selected.value === null ? "unrecorded" : `${selected.value.toFixed(unit === "lb" || unit === "kg" ? 1 : 0)} ${unit}${selected.complete === false ? " / partial journal" : ""}`}`
          : trend
            ? "● observations   ━ 7-day mean   ○ partial day"
            : "● observations   ○ partial day"}
      </div>
    </div>
  );
}
function Figure({
  number,
  title,
  subtitle,
  children,
  aside,
  className = "",
}: {
  number: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  aside?: string;
  className?: string;
}) {
  return (
    <section className={`notebook-figure ${className}`}>
      <div className="figure-top">
        <span className="figure-number">Fig. {number}</span>
        <span>{aside}</span>
      </div>
      <h2>{title}</h2>
      <p className="figure-subtitle">{subtitle}</p>
      {children}
    </section>
  );
}
export function Notebook({ entries, settings, end, onWeigh }: { entries: Entry[]; settings: Settings; end: string; onWeigh: () => void }) {
  const [windowDays, setWindowDays] = useState(56);
  const dates = days(end, windowDays),
    start = dates[0];
  const period = entries.filter((e) => e.day >= start && e.day <= end);
  const daily = dates.map((day) => ({ day, ...nutrition(entries, day) }));
  const complete = daily.filter((d) => d.complete);
  const observed = complete.filter((d) => d.hasData);
  const weights = weightPoints(period, settings.weight_unit);
  const first = weights[0],
    last = weights.at(-1);
  const weightMap = new Map(weights.map((p) => [p.day, p.value]));
  const workouts = period.filter((e) => e.kind === "workout");
  const mean = (key: "calories" | "protein") => {
    const rows = observed.filter((d) => key === "calories" || d.proteinKnown);
    return rows.length ? Math.round(rows.reduce((s, d) => s + d[key], 0) / rows.length) : null;
  };
  const weekDates = [...new Set(dates.map(weekStart))];
  const weekly = weekDates.map((day) => ({ day, count: workouts.filter((e) => weekStart(e.day) === day).length }));
  const maxSessions = Math.max(settings.weekly_sessions, 1, ...weekly.map((w) => w.count));
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, i) => {
    const rows = observed.filter((d) => (new Date(d.day + "T12:00:00Z").getUTCDay() + 6) % 7 === i);
    return { label, n: rows.length, value: rows.length ? rows.reduce((s, d) => s + d.calories, 0) / rows.length : 0 };
  });
  const weekdayMax = Math.max(1, ...weekdays.map((d) => d.value));
  const macroRows = daily.filter((d) => d.complete && d.proteinKnown && d.carbsKnown && d.fatKnown);
  const macros = macroRows.reduce((s, d) => ({ protein: s.protein + d.protein * 4, carbs: s.carbs + d.carbs * 4, fat: s.fat + d.fat * 9 }), {
    protein: 0,
    carbs: 0,
    fat: 0,
  });
  const macroTotal = macros.protein + macros.carbs + macros.fat;
  const macroColors = { protein: "var(--protein)", carbs: "var(--carbs)", fat: "var(--fat)" };
  const p = macroTotal ? (macros.protein / macroTotal) * 100 : 0,
    c = macroTotal ? (macros.carbs / macroTotal) * 100 : 0;
  const notes = period
    .filter((e) => e.data.notes && (e.kind === "workout" || e.kind === "measurement"))
    .sort((a, b) => b.day.localeCompare(a.day))
    .slice(0, 3);
  return (
    <div className="notebook">
      <div className="study-toolbar">
        <div>
          <span className="notebook-stamp">Personal observations</span>
          <span className="study-range">
            {displayDay(start)} — {displayDay(end, { month: "short", day: "numeric", year: "numeric" })}
          </span>
        </div>
        <div className="range-options" aria-label="Observation period">
          {[28, 56, 84].map((n) => (
            <button key={n} aria-pressed={windowDays === n} onClick={() => setWindowDays(n)}>
              {n / 7} weeks
            </button>
          ))}
        </div>
      </div>
      <div className="study-summary">
        <div>
          <span>Body mass</span>
          <strong>
            {last ? last.value.toFixed(1) : "—"}
            <small>{settings.weight_unit}</small>
          </strong>
          <em>
            {first && last && first !== last
              ? `${last.value - first.value >= 0 ? "+" : ""}${(last.value - first.value).toFixed(1)} ${settings.weight_unit} over this period`
              : "No trend yet"}
          </em>
        </div>
        <div>
          <span>Mean energy intake</span>
          <strong>
            {mean("calories")?.toLocaleString() ?? "—"}
            <small>kcal / day</small>
          </strong>
          <em>{observed.length} complete days observed</em>
        </div>
        <div>
          <span>Mean protein</span>
          <strong>
            {mean("protein") ?? "—"}
            <small>g / day</small>
          </strong>
          <em>Complete journals with protein recorded</em>
        </div>
        <div>
          <span>Training recorded</span>
          <strong>
            {workouts.length}
            <small>sessions</small>
          </strong>
          <em>
            {complete.length} / {windowDays} food journals complete
          </em>
        </div>
      </div>
      <div className="figure-grid">
        <Figure
          number="01"
          title="Body mass, longitudinally"
          subtitle="Daily measurements and a seven-day trend. Variation is part of the record."
          aside={`n = ${weights.length} days`}
          className="weight-figure"
        >
          <Plot values={dates.map((day) => ({ day, value: weightMap.get(day) ?? null }))} range={[start, end]} unit={settings.weight_unit} trend />
          <button className="text-button figure-action" onClick={onWeigh}>
            Record a weigh-in
          </button>
        </Figure>
        <Figure
          number="02"
          title="Energy intake"
          subtitle="Hollow observations are incomplete journals. Gaps are unrecorded days."
          aside="kcal / day"
        >
          <Plot
            values={daily.map((d) => ({ day: d.day, value: d.hasData ? d.calories : null, complete: d.complete }))}
            range={[start, end]}
            unit="kcal"
            zero
            trend
            target={settings.calorie_goal}
          />
        </Figure>
        <Figure
          number="03"
          title="Protein intake"
          subtitle="Unknown protein is left blank. Mean uses complete journals with protein recorded."
          aside="g / day"
        >
          <Plot
            values={daily.map((d) => ({ day: d.day, value: d.proteinKnown ? d.protein : null, complete: d.complete }))}
            range={[start, end]}
            unit="g"
            zero
            trend
            target={settings.protein_goal}
          />
        </Figure>
        <Figure
          number="04"
          title="Macronutrient balance"
          subtitle="Share of recorded macro energy across complete, fully specified days."
          aside={`n = ${macroRows.length} days`}
        >
          <div className="macro-study">
            <div
              className="macro-ring"
              style={{
                background: macroTotal
                  ? `conic-gradient(var(--protein) 0 ${p}%,var(--carbs) ${p}% ${p + c}%,var(--fat) ${p + c}% 100%)`
                  : "var(--soft)",
              }}
              role="img"
              aria-label={
                macroTotal
                  ? `Macro energy: protein ${Math.round(p)}%, carbs ${Math.round(c)}%, fat ${Math.round(100 - p - c)}%`
                  : "No complete macro observations"
              }
            >
              <div>
                <span>{macroRows.length}</span>
                <small>complete days</small>
              </div>
            </div>
            <div className="macro-key">
              {(["protein", "carbs", "fat"] as const).map((key) => (
                <div key={key}>
                  <i style={{ background: macroColors[key] }} />
                  <span>{key[0].toUpperCase() + key.slice(1)}</span>
                  <strong>{macroTotal ? `${Math.round((macros[key] / macroTotal) * 100)}%` : "—"}</strong>
                  <small>
                    {macroRows.length ? `${Math.round(macros[key] / (key === "fat" ? 9 : 4) / macroRows.length)} g / day` : "No observations"}
                  </small>
                </div>
              ))}
            </div>
          </div>
          <div className="figure-note">Energy conversion: protein 4 · carbs 4 · fat 9 kcal/g. May differ from labeled calories.</div>
        </Figure>
        <Figure
          number="05"
          title="Training frequency"
          subtitle="Sessions recorded each calendar week. The current week is still in progress."
          aside="sessions / week"
        >
          <div className="weekly-chart">
            {weekly.map((w) => (
              <div className="weekly-column" key={w.day}>
                <span>{w.count}</span>
                <div className="weekly-track">
                  <div style={{ height: `${(w.count / maxSessions) * 100}%` }} className={w.day === weekStart(end) ? "ongoing" : ""} />
                  {settings.weekly_sessions > 0 && <i style={{ bottom: `${(settings.weekly_sessions / maxSessions) * 100}%` }} />}
                </div>
                <small>{displayDay(w.day)}</small>
              </div>
            ))}
          </div>
          <div className="figure-note">
            Dashed reference: your current commitment of {settings.weekly_sessions} sessions/week. Edge weeks may be partial.
          </div>
        </Figure>
        <Figure number="06" title="The shape of a week" subtitle="Average calorie intake by weekday; complete journals only." aside="kcal / day">
          <div className="weekday-chart">
            {weekdays.map((d) => (
              <div key={d.label}>
                <span>{d.label}</span>
                <div className="weekday-track">
                  <div style={{ width: `${(d.value / weekdayMax) * 100}%` }} />
                </div>
                <strong>{d.n ? Math.round(d.value).toLocaleString() : "—"}</strong>
                <small>n={d.n}</small>
              </div>
            ))}
          </div>
          <div className="figure-note">Descriptive patterns, not causes. Sample size is shown beside each day.</div>
        </Figure>
      </div>
      <section className="observation-ledger">
        <div className="ledger-heading">
          <span className="figure-number">Plate 07</span>
          <h2>The observation ledger</h2>
          <p>
            One column per day.
            <br />
            An honest record of what was recorded.
          </p>
        </div>
        <div className="ledger-grid">
          <div className="ledger-date">
            <span>{displayDay(start)}</span>
            <span>{displayDay(end)}</span>
          </div>
          {(["Food", "Training", "Weight", "Photos"] as const).map((label) => (
            <div className="ledger-row" key={label}>
              <span>{label}</span>
              <div>
                {dates.map((day) => {
                  const n = nutrition(entries, day);
                  const exists =
                    label === "Food"
                      ? n.complete
                      : period.some(
                          (e) => e.day === day && e.kind === (label === "Training" ? "workout" : label === "Weight" ? "measurement" : "photo")
                        );
                  const partial = label === "Food" && !n.complete && n.hasData;
                  return (
                    <i
                      key={day}
                      className={exists ? "recorded" : partial ? "partial" : ""}
                      title={`${displayDay(day)} · ${label}: ${exists ? "recorded" : partial ? "partial" : "not recorded"}`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="field-notes">
        <div>
          <span className="figure-number">Notes in the margin</span>
          <h2>What the numbers leave out.</h2>
        </div>
        {notes.length ? (
          <div className="note-excerpts">
            {notes.map((n) => (
              <article key={n.id}>
                <time>{displayDay(n.day)}</time>
                <p>{n.data.notes}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">Sleep, energy, a new routine, an unusually hard session. Notes on your entries will collect here.</p>
        )}
      </section>
    </div>
  );
}
