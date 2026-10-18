/** Local-calendar day and Monday-start week helpers. Days are YYYY-MM-DD strings. */

export function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDay(day: string): Date {
  const [year, month, dayOfMonth] = day.split("-").map(Number);
  if (!year || !month || !dayOfMonth) throw new Error(`Invalid day key: ${day}`);
  return new Date(year, month - 1, dayOfMonth);
}

export function addDays(day: string, delta: number): string {
  const date = parseDay(day);
  date.setDate(date.getDate() + delta);
  return dayKey(date);
}

/** The Monday that starts the week containing `day`. */
export function weekStart(day: string): string {
  const date = parseDay(day);
  const daysSinceMonday = (date.getDay() + 6) % 7;
  return addDays(day, -daysSinceMonday);
}

export function daysBetween(fromDay: string, toDay: string): number {
  const millisecondsPerDay = 86_400_000;
  return Math.round((parseDay(toDay).getTime() - parseDay(fromDay).getTime()) / millisecondsPerDay);
}

export function today(): string {
  return dayKey(new Date());
}

export function monthOf(day: string): number {
  return parseDay(day).getMonth() + 1;
}
