/** Progression rules: present tiers, item draws, streaks, pet mood and plant growth. */

import { daysBetween, monthOf, weekStart, addDays } from "./dates";
import type { Catalog, ItemDef, Player, SurfaceDef, Tier, Unlock, Workout } from "./types";

export type CatalogEntry = ItemDef | SurfaceDef;

export const CHOICES_PER_PRESENT = 3;
const SEASONAL_CHANCE = 0.55;
const SURPRISE_CHANCE = 0.12;
const LUXE_SURPRISE_CHANCE = 0.3;

export function isSurface(entry: CatalogEntry): entry is SurfaceDef {
  return "kind" in entry;
}

export function sortedWorkouts(player: Player): Workout[] {
  return [...player.workouts].sort((a, b) => a.day.localeCompare(b.day));
}

export function workoutsInWeekOf(player: Player, day: string): number {
  const start = weekStart(day);
  return player.workouts.filter((workout) => weekStart(workout.day) === start).length;
}

export function tierForWeeklyCount(weeklyCount: number): Tier {
  if (weeklyCount >= 4) return 3;
  if (weeklyCount >= 2) return 2;
  return 1;
}

/** Tier of the present earned by each workout, in chronological order. */
export function presentTiers(player: Player): Tier[] {
  const countsByWeek = new Map<string, number>();
  return sortedWorkouts(player).map((workout) => {
    const week = weekStart(workout.day);
    const ordinal = (countsByWeek.get(week) ?? 0) + 1;
    countsByWeek.set(week, ordinal);
    return tierForWeeklyCount(ordinal);
  });
}

export function presentsWaiting(player: Player): number {
  const waiting = player.workouts.length - player.unlocks.length;
  if (waiting < 0) throw new Error(`Player ${player.id} has more unlocks than workouts.`);
  return waiting;
}

export interface Present {
  index: number;
  tier: Tier;
}

export function nextPresent(player: Player): Present | null {
  if (presentsWaiting(player) === 0) return null;
  const index = player.unlocks.length;
  return { index, tier: presentTiers(player)[index] };
}

export function hasLoggedOn(player: Player, day: string): boolean {
  return player.workouts.some((workout) => workout.day === day);
}

function hashString(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Small deterministic PRNG (mulberry32). */
export function seededRandom(seed: string): () => number {
  let state = hashString(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(values: T[], random: () => number): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function inSeason(entry: CatalogEntry, day: string): boolean {
  if (!entry.season) return false;
  const month = monthOf(day);
  const { from, to } = entry.season;
  return from <= to ? month >= from && month <= to : month >= from || month <= to;
}

export function allEntries(catalog: Catalog): CatalogEntry[] {
  return [...catalog.items, ...catalog.surfaces];
}

/**
 * The item ids offered by a present. Deterministic in (player, present index, month) so
 * reloading the page never rerolls the offer.
 */
export function drawChoices(catalog: Catalog, player: Player, present: Present, day: string): string[] {
  const owned = new Set(player.unlocks.map((unlock) => unlock.id));
  const random = seededRandom(`${player.id}:${present.index}:${monthOf(day)}`);
  const available = allEntries(catalog).filter((entry) => !owned.has(entry.id));
  const standard = available.filter((entry) => entry.rarity === "standard");
  const seasonal = available.filter((entry) => entry.rarity === "seasonal" && inSeason(entry, day));
  const surprise = available.filter((entry) => entry.rarity === "surprise");

  const picks: CatalogEntry[] = [];
  const take = (candidates: CatalogEntry[]) => {
    const fresh = candidates.filter((entry) => !picks.includes(entry));
    if (fresh.length > 0 && picks.length < CHOICES_PER_PRESENT) {
      picks.push(fresh[Math.floor(random() * fresh.length)]);
    }
  };

  if (random() < SEASONAL_CHANCE) take(seasonal);
  if (random() < (present.tier === 3 ? LUXE_SURPRISE_CHANCE : SURPRISE_CHANCE)) take(surprise);
  take(standard.filter((entry) => entry.tier === present.tier));

  const eligible = shuffled(
    standard.filter((entry) => entry.tier <= present.tier),
    random,
  );
  const higher = shuffled(
    standard.filter((entry) => entry.tier > present.tier),
    random,
  );
  for (const fallback of [eligible, higher, shuffled([...seasonal, ...surprise], random)]) {
    for (const entry of fallback) {
      if (picks.length >= CHOICES_PER_PRESENT) break;
      if (!picks.includes(entry)) picks.push(entry);
    }
  }
  return shuffled(picks, random).map((entry) => entry.id);
}

/** Consecutive Monday-start weeks with at least one workout, ending this week (or last week). */
export function weekStreak(player: Player, day: string): number {
  const activeWeeks = new Set(player.workouts.map((workout) => weekStart(workout.day)));
  let week = weekStart(day);
  if (!activeWeeks.has(week)) week = addDays(week, -7);
  let streak = 0;
  while (activeWeeks.has(week)) {
    streak++;
    week = addDays(week, -7);
  }
  return streak;
}

export type PetMood = "perky" | "content" | "sleepy";

export function petMood(player: Player, day: string): PetMood {
  if (hasLoggedOn(player, day)) return "perky";
  const workouts = sortedWorkouts(player);
  const lastActiveDay = workouts.length > 0 ? workouts[workouts.length - 1].day : player.createdDay;
  return daysBetween(lastActiveDay, day) >= 7 ? "sleepy" : "content";
}

export const PLANT_STAGE_THRESHOLDS = [2, 5] as const;

/** Growth stage (0-2) of a plant from the workouts logged since it was unpacked. */
export function plantStage(unlock: Unlock | undefined, player: Player): number {
  if (!unlock) return 0;
  const workoutsSince = player.workouts.length - unlock.atWorkout;
  if (workoutsSince >= PLANT_STAGE_THRESHOLDS[1]) return 2;
  if (workoutsSince >= PLANT_STAGE_THRESHOLDS[0]) return 1;
  return 0;
}

const COSINESS_TITLES: [number, string][] = [
  [0, "Bare little box"],
  [1, "Moving in"],
  [3, "Getting homey"],
  [6, "Snug nook"],
  [9, "Cosy nest"],
  [13, "Dreamy den"],
  [17, "Storybook flat"],
];

export function cosinessTitle(placedCount: number): string {
  let title = COSINESS_TITLES[0][1];
  for (const [minimum, label] of COSINESS_TITLES) {
    if (placedCount >= minimum) title = label;
  }
  return title;
}

/** "A", "A & B", or "A, B and 3 others" for a list of names. */
export function joinNames(names: string[]): string {
  if (names.length <= 2) return names.join(" & ");
  const others = names.length - 2;
  return `${names[0]}, ${names[1]} and ${others} other${others === 1 ? "" : "s"}`;
}

export interface WeekRecap {
  weekStart: string;
  counts: { playerId: string; count: number }[];
  total: number;
  stars: string[];
}

/** Summary of one finished week: only celebrates, never ranks the least active. */
export function weekRecap(players: Player[], recapWeekStart: string): WeekRecap {
  const counts = players.map((player) => ({
    playerId: player.id,
    count: player.workouts.filter((workout) => weekStart(workout.day) === recapWeekStart).length,
  }));
  const total = counts.reduce((sum, entry) => sum + entry.count, 0);
  const best = Math.max(0, ...counts.map((entry) => entry.count));
  const stars = best === 0 ? [] : counts.filter((entry) => entry.count === best).map((entry) => entry.playerId);
  return { weekStart: recapWeekStart, counts, total, stars };
}
