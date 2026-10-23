/** Reconstructed history uses today's positions; captured snapshots are immutable. */
import { today } from "./dates";
import { emptyLayout } from "./room";
import type { FlatSnapshot, Player } from "./types";

export function captureSnapshot(player: Player, kind: FlatSnapshot["kind"]): FlatSnapshot {
  return { id: crypto.randomUUID(), recordedAt: new Date().toISOString(), day: today(), kind, approximate: false, player: structuredClone(player) };
}

export function reconstructHistory(player: Player): FlatSnapshot[] {
  const days = [...new Set([...player.workouts, ...player.unlocks].map((entry) => entry.day))].sort();
  const firstDay = [player.createdDay, ...days].sort()[0];
  const frame = (state: Player, day: string, kind: FlatSnapshot["kind"]): FlatSnapshot => ({
    ...captureSnapshot(state, kind),
    day,
    approximate: true,
  });
  const frames = [frame({ ...player, workouts: [], unlocks: [], layout: emptyLayout() }, firstDay, "beginning")];
  for (const day of days) {
    const unlocks = player.unlocks.filter((unlock) => unlock.day <= day);
    const owned = new Set(unlocks.map((unlock) => unlock.id));
    frames.push(
      frame(
        {
          ...player,
          workouts: player.workouts.filter((workout) => workout.day <= day),
          unlocks,
          layout: {
            slots: Object.fromEntries(Object.entries(player.layout.slots).filter(([, item]) => owned.has(item.itemId))),
            wallpaper: owned.has(player.layout.wallpaper) ? player.layout.wallpaper : emptyLayout().wallpaper,
            flooring: owned.has(player.layout.flooring) ? player.layout.flooring : emptyLayout().flooring,
          },
        },
        day,
        "reconstructed"
      )
    );
  }
  frames.push(captureSnapshot(player, "recording_started"));
  return frames;
}

export function historyChange(before: Player, after: Player): FlatSnapshot["kind"] {
  if (JSON.stringify(before.layout) !== JSON.stringify(after.layout)) return "decorated";
  if (JSON.stringify(before.unlocks) !== JSON.stringify(after.unlocks)) return "unpacked";
  return after.workouts.length > before.workouts.length ? "workout" : "updated";
}
