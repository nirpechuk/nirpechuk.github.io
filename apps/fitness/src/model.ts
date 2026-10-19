export type Kind = "meal" | "workout" | "measurement" | "checkin" | "photo";
export type Unit = "lb" | "kg";
export interface Exercise {
  name: string;
  weight: number;
  unit: Unit;
  reps: number[];
}
export interface EntryData {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  confidence?: "estimated" | "label" | "weighed";
  notes?: string;
  exercises?: Exercise[];
  minutes?: number;
  weight?: number;
  unit?: Unit;
  complete?: boolean;
  path?: string;
  view?: "front" | "side" | "back" | "other";
}
export interface Entry {
  id: string;
  owner_id: string;
  day: string;
  kind: Kind;
  title: string;
  data: EntryData;
  source: "web" | "agent";
  revision: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}
export interface Settings {
  calorie_goal: number | null;
  protein_goal: number | null;
  weekly_sessions: number;
  weight_unit: Unit;
}
export const defaults: Settings = { calorie_goal: null, protein_goal: null, weekly_sessions: 3, weight_unit: "lb" };
export const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export function addDays(day: string, n: number) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const displayDay = (day: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) =>
  new Date(day + "T12:00:00Z").toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
export const days = (end: string, count: number) => Array.from({ length: count }, (_, i) => addDays(end, i - count + 1));
export function weekStart(day: string) {
  const n = new Date(day + "T12:00:00Z").getUTCDay();
  return addDays(day, -((n + 6) % 7));
}
export function inUnit(weight: number, from: Unit, to: Unit) {
  return from === to ? weight : from === "kg" ? weight * 2.2046226218 : weight / 2.2046226218;
}
export function nutrition(entries: Entry[], day: string) {
  const meals = entries.filter((e) => e.kind === "meal" && e.day === day && !e.archived_at);
  return {
    calories: meals.reduce((s, e) => s + (e.data.calories ?? 0), 0),
    protein: meals.reduce((s, e) => s + (e.data.protein ?? 0), 0),
    carbs: meals.reduce((s, e) => s + (e.data.carbs ?? 0), 0),
    fat: meals.reduce((s, e) => s + (e.data.fat ?? 0), 0),
    complete: entries.some((e) => e.kind === "checkin" && e.day === day && e.data.complete && !e.archived_at),
    hasData: meals.length > 0,
    estimated: meals.some((e) => e.data.confidence === "estimated"),
  };
}
export interface Point {
  day: string;
  value: number;
}
export function weightPoints(entries: Entry[], unit: Unit): Point[] {
  const groups = new Map<string, number[]>();
  entries
    .filter((e) => e.kind === "measurement" && !e.archived_at)
    .forEach((e) => groups.set(e.day, [...(groups.get(e.day) ?? []), inUnit(e.data.weight!, e.data.unit!, unit)]));
  return [...groups]
    .map(([day, values]) => ({ day, value: values.reduce((a, b) => a + b, 0) / values.length }))
    .sort((a, b) => a.day.localeCompare(b.day));
}
export function rollingWeek(points: Point[]): Point[] {
  return points.map((p) => {
    const window = points.filter((v) => v.day <= p.day && v.day >= addDays(p.day, -6));
    return { day: p.day, value: window.reduce((s, v) => s + v.value, 0) / window.length };
  });
}
export function strengthPoints(entries: Entry[], exercise: string, unit: Unit): Point[] {
  const values = new Map<string, number>();
  entries
    .filter((e) => e.kind === "workout" && !e.archived_at)
    .forEach((e) =>
      (e.data.exercises ?? [])
        .filter((x) => x.name.toLowerCase() === exercise.toLowerCase())
        .forEach((x) => values.set(e.day, Math.max(values.get(e.day) ?? 0, inUnit(x.weight, x.unit, unit))))
    );
  return [...values].map(([day, value]) => ({ day, value })).sort((a, b) => a.day.localeCompare(b.day));
}
export function description(e: Entry) {
  if (e.kind === "meal") return `${Math.round(e.data.calories ?? 0).toLocaleString()} kcal · ${Math.round(e.data.protein ?? 0)} g protein`;
  if (e.kind === "measurement") return `${e.data.weight?.toFixed(1)} ${e.data.unit}`;
  if (e.kind === "checkin") return e.data.complete ? "Food journal complete" : "Food journal reopened";
  if (e.kind === "photo") return `${e.data.view} view`;
  return [
    e.data.minutes ? `${e.data.minutes} min` : null,
    ...(e.data.exercises ?? []).map((x) => `${x.name}: ${x.weight} ${x.unit} × ${x.reps.join(", ")}`),
  ]
    .filter(Boolean)
    .join(" · ");
}
export function demoEntries(end = today()): Entry[] {
  const out: Entry[] = [];
  const push = (day: string, kind: Kind, title: string, data: EntryData) =>
    out.push({
      id: crypto.randomUUID(),
      owner_id: "example",
      day,
      kind,
      title,
      data,
      source: "web",
      revision: 1,
      created_at: day + "T12:00:00Z",
      updated_at: day + "T12:00:00Z",
      archived_at: null,
    });
  days(end, 56).forEach((day, i) => {
    if (i % 8 !== 3) {
      push(day, "meal", "Breakfast", {
        calories: 420 + (i % 4) * 25,
        protein: 28 + (i % 4) * 3,
        carbs: 45 + (i % 3) * 5,
        fat: 12,
        confidence: "weighed",
        notes: "Greek yogurt, oats, berries",
      });
      push(day, "meal", "Lunch", {
        calories: 690 + (i % 3) * 40,
        protein: 38 + (i % 5) * 4,
        carbs: 70 + (i % 3) * 8,
        fat: 18 + (i % 4) * 2,
        confidence: "estimated",
      });
      if (i < 55)
        push(day, "meal", "Dinner & snacks", {
          calories: 920 + (i % 5) * 35,
          protein: 50 + (i % 7) * 5,
          carbs: 85 + (i % 5) * 9,
          fat: 22 + (i % 4) * 4,
          confidence: "label",
        });
    }
    if (i < 55 && i % 8 !== 3 && i % 11 !== 2) push(day, "checkin", "Food journal", { complete: true });
    if (i % 3 === 0) push(day, "measurement", "Morning weight", { weight: 172 - i * 0.035 + Math.sin(i) * 0.7, unit: "lb" });
    if (i % 7 === 0 || i % 7 === 2 || i % 7 === 4)
      push(day, "workout", i % 2 ? "Upper body" : "Full body", {
        minutes: 45 + (i % 4) * 5,
        notes:
          i % 14 === 0
            ? [
                "Starting a new training block. Keep the first week measured.",
                "Sleep felt better this week; the same sets moved more easily.",
                "Added weight while keeping the last set controlled.",
                "A steady session. The small increments are adding up.",
              ][Math.floor(i / 14) % 4]
            : undefined,
        exercises: [
          { name: "Bench press", weight: 115 + Math.floor(i / 14) * 5, unit: "lb", reps: [8, 8, 7] },
          { name: "Squat", weight: 155 + Math.floor(i / 14) * 10, unit: "lb", reps: [8, 8, 8] },
        ],
      });
  });
  return out;
}
