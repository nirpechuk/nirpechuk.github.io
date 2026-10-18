/**
 * The group view: an apartment building at night, seen from the street. Every friend's flat is a
 * window (a live miniature of their room) with a window box that blooms with their weekly
 * workouts. Tapping a window swings its panes open and zooms into the flat.
 */

import type { CSSProperties } from "react";
import { useState } from "react";

import type { Lighting } from "../art/lighting";
import { RoomScene } from "../art/RoomScene";
import { petMood, weekStreak, workoutsInWeekOf } from "../game/progression";
import type { GroupSnapshot, Player } from "../game/types";
import { Hint, Tag } from "./common";
import { playPop } from "./sound";

const FLATS_PER_FLOOR = 2;
const PANE_SWING_MS = 380;
const FLOWER_COLORS = ["#d9707a", "#e8a050", "#b08ad0", "#d98a9a", "#8ab0d8"];
/** Window brightness by workouts this week: a quiet week is a dim window, a busy one glows. */
const GLOW_BY_WEEKLY_COUNT = [0.08, 0.42, 0.62, 0.8, 1];

export function windowGlow(weekCount: number): number {
  return GLOW_BY_WEEKLY_COUNT[Math.min(weekCount, GLOW_BY_WEEKLY_COUNT.length - 1)];
}

type WindowSlot = { kind: "flat"; player: Player } | { kind: "vacancy" } | { kind: "curtained" };

interface BuildingProps {
  snapshot: GroupSnapshot;
  meId: string;
  day: string;
  lighting: Lighting;
  reducedMotion: boolean;
  recapBanner: string | null;
  onOpenFlat: (playerId: string, fromRect: DOMRect) => void;
  onInvite: () => void;
}

function FlowerBox({ count }: { count: number }) {
  const flowers = Math.min(count, 5);
  return (
    <div className="flower-box" aria-hidden="true">
      <div className="flower-row">
        {Array.from({ length: 5 }, (_, index) => (
          <span
            key={index}
            className={`flower${index < flowers ? " is-bloom" : " is-sprout"}`}
            style={{ "--flower": FLOWER_COLORS[index], "--i": index } as CSSProperties}
          />
        ))}
      </div>
      <div className="flower-planter" />
    </div>
  );
}

function FlatWindow({
  player,
  isMe,
  day,
  lighting,
  reducedMotion,
  onOpen,
}: {
  player: Player;
  isMe: boolean;
  day: string;
  lighting: Lighting;
  reducedMotion: boolean;
  onOpen: (fromRect: DOMRect) => void;
}) {
  const [opening, setOpening] = useState(false);
  const weekCount = workoutsInWeekOf(player, day);
  const streak = weekStreak(player, day);
  return (
    <div className={`flat-slot${isMe ? " is-me" : ""}`}>
      <button
        type="button"
        className={`flat-window${opening ? " is-opening" : ""}`}
        style={{ "--glow": windowGlow(weekCount) } as CSSProperties}
        data-player={player.id}
        aria-label={`Visit ${player.name}'s flat`}
        onClick={(event) => {
          if (opening) return;
          playPop();
          const glass = event.currentTarget.querySelector(".window-glass");
          if (!glass) throw new Error("Window glass element missing.");
          setOpening(true);
          window.setTimeout(
            () => {
              onOpen(glass.getBoundingClientRect());
              setOpening(false);
            },
            reducedMotion ? 0 : PANE_SWING_MS,
          );
        }}
      >
        <div className="window-glass">
          <RoomScene player={player} variant="mini" lighting={lighting} mood={petMood(player, day)} reducedMotion={reducedMotion} />
          <div className="window-dim" />
          <div className="window-warm" />
          <div className="glass-sheen" />
        </div>
        <div className="window-panes" aria-hidden="true">
          <span className="pane pane-left" />
          <span className="pane pane-right" />
        </div>
        <span className="window-lintel" aria-hidden="true" />
      </button>
      <FlowerBox count={weekCount} />
      <div className="name-tag">
        <span className="name-tag-string" aria-hidden="true" />
        <strong>{isMe ? "You" : player.name}</strong>
        <span>& {player.petName}</span>
        <span className="name-tag-count">{weekCount} this week</span>
        {streak > 1 && <span className="name-tag-streak">★ {streak} wk</span>}
        {player.demo && <span className="name-tag-demo">demo</span>}
      </div>
    </div>
  );
}

function Vacancy({ onInvite }: { onInvite: () => void }) {
  return (
    <div className="flat-slot">
      <button type="button" className="flat-window is-vacant" onClick={onInvite} aria-label="Invite a friend">
        <div className="window-glass vacancy-glass">
          <span className="for-rent">
            Vacant
            <small>Invite a friend</small>
          </span>
        </div>
        <span className="window-lintel" aria-hidden="true" />
      </button>
      <FlowerBox count={0} />
    </div>
  );
}

function Curtained() {
  return (
    <div className="flat-slot" aria-hidden="true">
      <div className="flat-window is-curtained">
        <div className="window-glass curtained-glass" />
        <span className="window-lintel" />
      </div>
      <FlowerBox count={2} />
    </div>
  );
}

export function Building({ snapshot, meId, day, lighting, reducedMotion, recapBanner, onOpenFlat, onInvite }: BuildingProps) {
  const slots: WindowSlot[] = [
    ...snapshot.players.map((player) => ({ kind: "flat" as const, player })),
    { kind: "vacancy" as const },
  ];
  if (slots.length % FLATS_PER_FLOOR !== 0) slots.push({ kind: "curtained" });
  const floors: WindowSlot[][] = [];
  for (let index = 0; index < slots.length; index += FLATS_PER_FLOOR) floors.push(slots.slice(index, index + FLATS_PER_FLOOR));
  const groupTotal = snapshot.players.reduce((sum, player) => sum + workoutsInWeekOf(player, day), 0);

  return (
    <main className={`building-screen phase-${lighting.phase}`}>
      <header className="building-header">
        <h1 className="flat-title">{snapshot.group.name}</h1>
        <div className="flat-tags">
          <Tag tone="mint">{groupTotal} workouts this week</Tag>
          <button type="button" className="tag tone-sky code-tag" onClick={onInvite}>
            Invite · {snapshot.group.code}
          </button>
        </div>
      </header>
      {recapBanner && <p className="recap-banner card">{recapBanner}</p>}

      <div className="street-scene">
        <div className="sky-layer" aria-hidden="true">
          <span className="sky-cloud cloud-a" />
          <span className="sky-cloud cloud-b" />
          <span className="sky-cloud cloud-c" />
          <span className="sky-orb" />
        </div>
        <div className="building">
          <span className="building-side" aria-hidden="true" />
          <div className="roof" aria-hidden="true">
            <div className="roof-garden">
              <span className="roof-plant plant-a" />
              <span className="roof-plant plant-b" />
              <span className="roof-plant plant-c" />
              <span className="water-tower" />
              <span className="chimney">
                <span className="smoke smoke-1" />
                <span className="smoke smoke-2" />
              </span>
            </div>
            <div className="roof-sign">Flats</div>
          </div>
          <div className="facade">
            {[...floors].reverse().map((floor, reversedIndex) => (
              <div className="floor" key={floors.length - reversedIndex}>
                {floor.map((slot, index) => {
                  if (slot.kind === "vacancy") return <Vacancy key="vacancy" onInvite={onInvite} />;
                  if (slot.kind === "curtained") return <Curtained key={`curtained-${index}`} />;
                  return (
                    <FlatWindow
                      key={slot.player.id}
                      player={slot.player}
                      isMe={slot.player.id === meId}
                      day={day}
                      lighting={lighting}
                      reducedMotion={reducedMotion}
                      onOpen={(rect) => onOpenFlat(slot.player.id, rect)}
                    />
                  );
                })}
                <span className="floor-ledge" aria-hidden="true" />
              </div>
            ))}
            <div className="lobby">
              <div className="awning" aria-hidden="true" />
              <div className="front-door" aria-hidden="true">
                <span className="door-window" />
                <span className="door-knob" />
              </div>
              <div className="mailbox" aria-hidden="true">
                <span>{snapshot.group.code}</span>
              </div>
              <span className="lobby-plant" aria-hidden="true" />
            </div>
          </div>
        </div>
        <div className="sidewalk" aria-hidden="true">
          <span className="street-tree" />
          <span className="street-lamp" />
        </div>
      </div>
      <div className="building-hint">
        <Hint hintKey="building">Tap any window to pop in and visit. The busier someone's week, the brighter their window glows.</Hint>
      </div>
    </main>
  );
}
