/**
 * The apartment diorama: a cutaway room with wallpapered walls, a window onto the sky, snap-slot
 * furniture, the pet, and (on your own flat) the present box. Shared by the home screen, visits
 * and the miniature windows of the building view.
 */

import type { PointerEvent as ReactPointerEvent, ReactNode, Ref } from "react";
import { useId, useMemo, useState } from "react";

import { itemById, surfaceById } from "../game/catalog";
import type { PetMood } from "../game/progression";
import { plantStage } from "../game/progression";
import type { Slot } from "../game/room";
import { BACK_ITEM_SCALE, FLOOR_Y, ITEM_SCALE, PET_FLOOR, project, ROOM_HEIGHT, ROOM_WIDTH, slotById, SLOTS, WINDOW_FRAME } from "../game/room";
import type { ItemDef, Placement, Player } from "../game/types";
import { ItemArt } from "./ItemArt";
import type { Lighting } from "./lighting";
import { PetFigure } from "./Pet";
import { RoomArchitecture } from "./RoomShell";
import type { PetSpot } from "./usePetBehaviour";
import { floorSpot, usePetBehaviour } from "./usePetBehaviour";

export interface EditingState {
  /** Item currently held (selected in the drawer or being dragged). */
  heldItemId: string | null;
  /** Slot under the pointer while dragging. */
  hoverSlotId: string | null;
  /** Placed item hidden because it is being dragged. */
  hiddenItemId: string | null;
}

export type BoxState = "present" | "teaser" | null;

interface RoomSceneProps {
  player: Player;
  variant: "home" | "visit" | "mini";
  lighting: Lighting;
  mood: PetMood;
  reducedMotion: boolean;
  editing?: EditingState | null;
  freshItemId?: string | null;
  box?: BoxState;
  celebrateKey?: number;
  treatKey?: number;
  /** Stickers friends left, stuck around the cardboard frame. */
  stickers?: string[];
  svgRef?: Ref<SVGSVGElement>;
  onSlotTap?: (slotId: string) => void;
  onItemPointerDown?: (event: ReactPointerEvent<SVGGElement>, slotId: string) => void;
  onBoxTap?: () => void;
  onPetTap?: () => void;
}

const FRAME = 7;
const STICKER_SPOTS: [number, number, number][] = [
  [10, 14, -12],
  [350, 16, 10],
  [8, 404, 8],
  [352, 402, -9],
  [96, 8, 6],
  [266, 410, -5],
];
const WINDOW_LEFT = WINDOW_FRAME.cx - WINDOW_FRAME.width / 2;
const WINDOW_BOTTOM = WINDOW_FRAME.top + WINDOW_FRAME.height;
/** The window is drawn in its own art coordinates, then scaled onto the back wall. */
const WINDOW_ART = { left: 136, top: 68, width: 88, height: 104 };
const WINDOW_TRANSFORM = `translate(${WINDOW_LEFT} ${WINDOW_FRAME.top}) scale(${BACK_ITEM_SCALE}) translate(${-WINDOW_ART.left} ${-WINDOW_ART.top})`;
/** Pets are drawn a little larger than furniture art so they stay readable at the back. */
const PET_SCALE = 1.2;
const BOX_DEPTH = 0.1;

function slotTransform(item: ItemDef, slot: Slot, flip: boolean): string {
  const anchorOffset = slot.anchor === "top" ? 0 : slot.anchor === "bottom" ? -item.h : -item.h / 2;
  const scaleX = flip ? -slot.scale : slot.scale;
  return `translate(${slot.x} ${slot.y}) scale(${scaleX} ${slot.scale}) translate(${-item.w / 2} ${anchorOffset})`;
}

function napSpot(item: ItemDef, slot: Slot, placement: Placement): PetSpot | null {
  if (!item.tags?.includes("nap") || !slot.world) return null;
  const seatX = (item.seatX ?? 0) * (placement.flip ? -1 : 1) * ITEM_SCALE;
  const depth = Math.min(slot.world.depth, PET_FLOOR.maxDepth + 0.12);
  if (slot.zone === "rug") return floorSpot(slot.world.x + seatX, depth);
  return { x: slot.world.x + seatX, depth: slot.world.depth - 0.02, lift: (item.seat ?? 0) * ITEM_SCALE, order: slot.depth + 0.5 };
}

function playSpot(item: ItemDef, slot: Slot): PetSpot | null {
  if (!item.tags?.includes("play") || !slot.world) return null;
  const besideDistance = (item.w / 2) * ITEM_SCALE + 20;
  const side = slot.world.x > 180 ? -besideDistance : besideDistance;
  const depth = Math.max(PET_FLOOR.minDepth, Math.min(PET_FLOOR.maxDepth, slot.world.depth - 0.04));
  return floorSpot(slot.world.x + side, depth);
}

interface PlacedEntry {
  slot: Slot;
  item: ItemDef;
  placement: Placement;
  stage: number;
}

function WindowView({ lighting, idPrefix, animate }: { lighting: Lighting; idPrefix: string; animate: boolean }) {
  const isNight = lighting.phase === "night";
  const { top, width, height } = WINDOW_ART;
  const left = WINDOW_ART.left;
  const bottom = top + height;
  const windowGlow = isNight ? "#ffe39a" : "#fff7e3";
  return (
    <g className="window-view" transform={WINDOW_TRANSFORM}>
      <defs>
        <linearGradient id={`${idPrefix}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={lighting.skyTop} />
          <stop offset="1" stopColor={lighting.skyBottom} />
        </linearGradient>
        <clipPath id={`${idPrefix}-window`}>
          <rect x={left} y={top} width={width} height={height} rx="3" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${idPrefix}-window)`}>
        <rect x={left} y={top} width={width} height={height} fill={`url(#${idPrefix}-sky)`} />
        {isNight ? (
          <>
            <path d="M206 84 A9 9 0 1 0 214 98 A7 7 0 1 1 206 84Z" fill="#fff3c4" />
            {[
              [146, 80],
              [162, 92],
              [188, 78],
              [174, 104],
              [216, 116],
              [152, 112],
            ].map(([x, y], index) => (
              <circle key={index} cx={x} cy={y} r={index % 2 ? 0.9 : 1.3} fill="#fff8dc" className={animate ? "anim anim-twinkle" : undefined} />
            ))}
          </>
        ) : (
          <circle cx="206" cy="90" r="9" fill={lighting.phase === "dusk" ? "#ffb877" : "#ffe7a0"} opacity="0.95" />
        )}
        {!isNight && (
          <g className={animate ? "cloud-drift" : undefined}>
            <g fill="#ffffff" opacity="0.92">
              <ellipse cx="160" cy="98" rx="12" ry="5" />
              <ellipse cx="168" cy="94" rx="8" ry="6" />
              <ellipse cx="152" cy="96" rx="6" ry="4" />
            </g>
            <g fill="#ffffff" opacity="0.8">
              <ellipse cx="204" cy="118" rx="10" ry="4" />
              <ellipse cx="210" cy="115" rx="6" ry="4.5" />
            </g>
          </g>
        )}
        <g className="skyline">
          <rect x="136" y="140" width="14" height="40" fill={isNight ? "#161b36" : "#6f7f93"} />
          <rect x="150" y="132" width="12" height="48" fill={isNight ? "#1c2242" : "#62728a"} />
          <rect x="162" y="146" width="18" height="34" fill={isNight ? "#161b36" : "#7a889a"} />
          <rect x="180" y="128" width="11" height="52" fill={isNight ? "#20284a" : "#66768d"} />
          <rect x="191" y="142" width="16" height="38" fill={isNight ? "#161b36" : "#73829a"} />
          <rect x="207" y="136" width="17" height="44" fill={isNight ? "#1c2242" : "#62728a"} />
          {isNight &&
            [
              [140, 146],
              [154, 138],
              [154, 152],
              [166, 152],
              [183, 136],
              [183, 150],
              [195, 148],
              [211, 142],
              [216, 156],
            ].map(([x, y], index) => <rect key={index} x={x} y={y} width="2.6" height="3" fill="#ffcf7a" className={animate && index % 3 === 0 ? "anim anim-flicker-soft" : undefined} />)}
        </g>
      </g>
      <rect x={left - 4} y={top - 4} width={width + 8} height={height + 8} rx="5" fill="none" stroke="#2b2228" strokeWidth="7" />
      <rect x={left - 7.5} y={top - 7.5} width={width + 15} height={height + 15} rx="7" fill="none" stroke="rgba(255,220,170,0.1)" strokeWidth="1.2" />
      <line x1={left + width / 2} y1={top} x2={left + width / 2} y2={bottom} stroke="#2b2228" strokeWidth="4" />
      <line x1={left} y1={top + height * 0.46} x2={left + width} y2={top + height * 0.46} stroke="#2b2228" strokeWidth="4" />
      <rect x={left} y={top} width={width} height={height} rx="3" fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth="5" />
      <path d={`M${left - 10} ${bottom + 3} L${left + width + 10} ${bottom + 3} L${left + width + 16} ${bottom + 9} L${left - 16} ${bottom + 9} Z`} fill="#3d3038" />
      <rect x={left - 16} y={bottom + 9} width={width + 32} height="4" fill="#271e24" />
      <rect x={left - 16} y={bottom + 13} width={width + 32} height="2" fill="rgba(0,0,0,0.35)" />
      {isNight && <rect x={left} y={top} width={width} height={height} fill={windowGlow} opacity="0.05" />}
    </g>
  );
}

function BareBulb({ glowPass, glow }: { glowPass: boolean; glow: number }) {
  const slot = slotById("ceilC");
  const pool = project(180, FLOOR_Y, 0.55);
  if (glowPass) {
    return (
      <g className="bulb-glow">
        <ellipse cx={pool.x} cy={pool.y} rx="125" ry="30" fill="#ffb865" opacity={0.14 + glow * 0.16} />
        <g transform={`translate(${slot.x} ${slot.y}) scale(${slot.scale})`}>
          <circle cx="0" cy="48" r="70" fill="#ffb865" opacity={0.18 + glow * 0.22} />
          <circle cx="0" cy="48" r="24" fill="#ffd89a" opacity={0.35 + glow * 0.4} />
        </g>
      </g>
    );
  }
  return (
    <g transform={`translate(${slot.x} ${slot.y}) scale(${slot.scale})`}>
      <g className="anim anim-sway-top bare-bulb">
        <line x1="0" y1="0" x2="0" y2="38" stroke="#6b5548" strokeWidth="1.2" />
        <rect x="-3.5" y="36" width="7" height="6" rx="1" fill="#8a8f9a" />
        <circle cx="0" cy="48" r="6.5" fill="#ffe6b0" className="bulb-core" />
        <path d="M-2 46 Q0 50 2 46" stroke="#ff9d3a" strokeWidth="0.9" fill="none" />
      </g>
    </g>
  );
}

const boxPoint = project(180, FLOOR_Y, BOX_DEPTH);
const sunbeamFar = { left: project(105, FLOOR_Y, 0.22), right: project(255, FLOOR_Y, 0.22) };

function PresentBox({ state, onTap }: { state: Exclude<BoxState, null>; onTap?: () => void }) {
  return (
    <g
      className={`present-box ${state === "present" ? "is-ready" : "is-teaser"}`}
      transform={`translate(${boxPoint.x} ${boxPoint.y}) scale(${boxPoint.k * ITEM_SCALE * 0.95})`}
      onClick={onTap}
      role="button"
      aria-label={state === "present" ? "Unpack your present" : "Your first box"}
    >
      <ellipse cx="0" cy="0" rx="24" ry="3.5" fill="rgba(12,6,16,0.35)" />
      <g className="present-box-body">
        <path d="M-21 -30 L21 -30 L22 0 L-22 0Z" fill="#9a7048" />
        <path d="M-21 -30 L21 -30 L21 -24 L-21 -24Z" fill="#7f5b39" />
        <path d="M-21 -30 L-27 -38 L-4 -38 L0 -30Z" fill="#ad8256" className="flap flap-left" />
        <path d="M21 -30 L27 -38 L4 -38 L0 -30Z" fill="#ad8256" className="flap flap-right" />
        <rect x="-4" y="-30" width="8" height="30" fill={state === "present" ? "#8c3a4b" : "#c9b08c"} opacity="0.95" />
        {state === "present" ? (
          <g transform="translate(0 -32)">
            <path d="M0 0 C-10 -10 -14 -2 -8 1 Z" fill="#8c3a4b" />
            <path d="M0 0 C10 -10 14 -2 8 1 Z" fill="#8c3a4b" />
            <circle cx="0" cy="0" r="2.6" fill="#a8485a" />
          </g>
        ) : (
          <text x="12" y="-10" className="box-label">?</text>
        )}
      </g>
    </g>
  );
}

export function RoomScene(props: RoomSceneProps) {
  const {
    player,
    variant,
    lighting,
    mood,
    reducedMotion,
    editing,
    freshItemId,
    box,
    celebrateKey = 0,
    treatKey = 0,
    stickers = [],
    svgRef,
    onSlotTap,
    onItemPointerDown,
    onBoxTap,
    onPetTap,
  } = props;
  const idPrefix = `room${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [pokes, setPokes] = useState(0);
  const interactive = variant !== "mini";
  const animate = !reducedMotion && variant !== "mini";

  const placed: PlacedEntry[] = useMemo(() => {
    const unlockById = new Map(player.unlocks.map((unlock) => [unlock.id, unlock]));
    return SLOTS.flatMap((slot) => {
      const placement = player.layout.slots[slot.id];
      if (!placement) return [];
      const item = itemById(placement.itemId);
      const stage = item.tags?.includes("grow") ? plantStage(unlockById.get(item.id), player) : 2;
      return [{ slot, item, placement, stage }];
    });
  }, [player]);

  const napSpots = placed.flatMap(({ item, slot, placement }) => napSpot(item, slot, placement) ?? []);
  const playSpots = placed.flatMap(({ item, slot }) => playSpot(item, slot) ?? []);
  const pose = usePetBehaviour({
    active: animate,
    reducedMotion,
    mood,
    napSpots,
    playSpots,
    celebrateKey: celebrateKey + pokes,
    treatKey,
  });

  const wallpaper = surfaceById(player.layout.wallpaper);
  const petPoint = project(pose.x, FLOOR_Y - pose.lift, pose.depth);
  const flooring = surfaceById(player.layout.flooring);
  const heldItem = editing?.heldItemId ? itemById(editing.heldItemId) : null;
  const ceilingCentreEmpty = !player.layout.slots.ceilC;

  type Drawable = { depth: number; key: string; node: ReactNode };
  const drawables: Drawable[] = placed
    .filter(({ item }) => item.id !== editing?.hiddenItemId)
    .map(({ slot, item, placement, stage }) => {
      const isStaticWallArt = (slot.zone === "wall" || slot.zone === "wallTop") && !item.anim && !item.layers.some((layer) => layer.anim);
      const swayClass = item.anim ? `anim anim-${item.anim}${slot.anchor === "top" ? "-top" : ""}` : undefined;
      return {
        depth: slot.depth,
        key: `item-${slot.id}`,
        node: (
          <g
            key={`item-${slot.id}-${item.id}`}
            className={`placed-item${interactive && onItemPointerDown ? " is-grabbable" : ""}`}
            data-slot={slot.id}
            data-item={item.id}
            onPointerDown={onItemPointerDown ? (event) => onItemPointerDown(event, slot.id) : undefined}
          >
            {slot.zone === "floor" && (
              <ellipse cx={slot.x} cy={slot.y - 1} rx={item.w * 0.42 * slot.scale} ry="3.4" fill="rgba(12,6,16,0.3)" />
            )}
            <g transform={slotTransform(item, slot, placement.flip)}>
              <g className={freshItemId === item.id ? "item-enter" : undefined}>
                <g className={swayClass} filter={isStaticWallArt ? `url(#${idPrefix}-lift)` : undefined}>
                  <ItemArt item={item} paletteIndex={placement.palette} stage={stage} glowStrength={lighting.glow} pass="body" />
                </g>
              </g>
            </g>
          </g>
        ),
      };
    });

  if (ceilingCentreEmpty) {
    drawables.push({ depth: slotById("ceilC").depth, key: "bulb", node: <BareBulb key="bulb" glowPass={false} glow={lighting.glow} /> });
  }
  if (box && variant === "home") {
    drawables.push({ depth: 100 + (1 - BOX_DEPTH) * 1000, key: "box", node: <PresentBox key="box" state={box} onTap={onBoxTap} /> });
  }
  drawables.push({
    depth: pose.order,
    key: "pet",
    node: (
      <g
        key="pet"
        className="pet-position"
        style={{
          transform: `translate(${petPoint.x}px, ${petPoint.y}px) scale(${petPoint.k * PET_SCALE})`,
          transitionDuration: `${pose.moveMs}ms`,
        }}
      >
        <g
          className="pet-facing"
          style={{ transform: `scale(${pose.facing}, 1)` }}
          onClick={
            interactive
              ? () => {
                  setPokes((count) => count + 1);
                  onPetTap?.();
                }
              : undefined
          }
        >
          <PetFigure kind={player.petKind} action={pose.action} sleepy={mood === "sleepy"} />
        </g>
      </g>
    ),
  });
  drawables.sort((a, b) => a.depth - b.depth);

  const validSlotIds = new Set(
    heldItem ? SLOTS.filter((slot) => heldItem.zones.includes(slot.zone) && heldItem.size <= slot.capacity).map((slot) => slot.id) : [],
  );

  return (
    <svg
      ref={svgRef}
      className={`room-scene room-${variant} phase-${lighting.phase}${animate ? " is-animated" : ""}`}
      viewBox={`${-FRAME} ${-FRAME} ${ROOM_WIDTH + FRAME * 2} ${ROOM_HEIGHT + FRAME * 2}`}
      role="img"
      aria-label={`${player.name}'s flat with ${player.petName} the ${player.petKind}`}
    >
      <defs>
        <radialGradient id={`${idPrefix}-vignette`} cx="0.5" cy="0.45" r="0.75">
          <stop offset="0.45" stopColor="#0c0610" stopOpacity="0" />
          <stop offset="1" stopColor="#0c0610" stopOpacity="0.55" />
        </radialGradient>
        <linearGradient id={`${idPrefix}-beam`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe2b0" stopOpacity="0.28" />
          <stop offset="1" stopColor="#ffe2b0" stopOpacity="0" />
        </linearGradient>
        <filter id={`${idPrefix}-soft`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <filter id={`${idPrefix}-lift`} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="1.2" dy="2.2" stdDeviation="1.1" floodColor="#0c0610" floodOpacity="0.4" />
        </filter>
      </defs>

      <RoomArchitecture idPrefix={idPrefix} wallpaper={wallpaper} flooring={flooring} />
      <g className="room-openings">
        <WindowView lighting={lighting} idPrefix={idPrefix} animate={animate} />
        {(lighting.phase === "day" || lighting.phase === "dawn") && (
          <g className="sunbeam" pointerEvents="none">
            <polygon
              points={`${WINDOW_LEFT + 3},${WINDOW_BOTTOM + 6} ${WINDOW_LEFT + WINDOW_FRAME.width - 3},${WINDOW_BOTTOM + 6} ${sunbeamFar.right.x},${sunbeamFar.right.y} ${sunbeamFar.left.x},${sunbeamFar.left.y}`}
              fill={`url(#${idPrefix}-beam)`}
            />
            {animate &&
              [
                [168, 230],
                [196, 262],
                [182, 300],
                [210, 214],
              ].map(([x, y], index) => <circle key={index} className={`dust dust-${index}`} cx={x} cy={y} r="1.1" fill="#fffbe8" />)}
          </g>
        )}
      </g>

      {drawables.map((drawable) => drawable.node)}

      <rect x="0" y="0" width={ROOM_WIDTH} height={ROOM_HEIGHT} fill="#120a1c" opacity={lighting.dim} className="night-dim" pointerEvents="none" />
      <rect x="0" y="0" width={ROOM_WIDTH} height={ROOM_HEIGHT} fill={`url(#${idPrefix}-vignette)`} pointerEvents="none" />
      <g className="glow-pass" pointerEvents="none" filter={`url(#${idPrefix}-soft)`}>
        {ceilingCentreEmpty && <BareBulb glowPass glow={lighting.glow} />}
        {placed
          .filter(({ item }) => item.layers.some((layer) => layer.glow) && item.id !== editing?.hiddenItemId)
          .map(({ slot, item, placement, stage }) => (
            <g key={`glow-${slot.id}`} transform={slotTransform(item, slot, placement.flip)}>
              <g className={item.anim ? `anim anim-${item.anim}${slot.anchor === "top" ? "-top" : ""}` : undefined}>
                <ItemArt item={item} paletteIndex={placement.palette} stage={stage} glowStrength={lighting.glow} pass="glow" />
              </g>
            </g>
          ))}
      </g>

      {heldItem && (
        <g className="slot-markers">
          {SLOTS.filter((slot) => validSlotIds.has(slot.id)).map((slot) => {
            const width = Math.min(heldItem.w, 150) * slot.scale + 10;
            const height = Math.min(heldItem.h, 130) * slot.scale + 10;
            const y = slot.anchor === "top" ? slot.y - 4 : slot.anchor === "bottom" ? slot.y - height + 5 : slot.y - height / 2;
            const occupied = Boolean(player.layout.slots[slot.id]);
            return (
              <g
                key={slot.id}
                className={`slot-marker${editing?.hoverSlotId === slot.id ? " is-hover" : ""}${occupied ? " is-occupied" : ""}`}
                data-slot={slot.id}
                onClick={onSlotTap ? () => onSlotTap(slot.id) : undefined}
              >
                <rect x={slot.x - width / 2} y={y} width={width} height={height} rx="10" />
                <text x={slot.x} y={y + height / 2 + 4}>{occupied ? "swap" : "+"}</text>
              </g>
            );
          })}
        </g>
      )}

      <path
        className="room-frame"
        fillRule="evenodd"
        d={`M${-FRAME} ${-FRAME} H${ROOM_WIDTH + FRAME} V${ROOM_HEIGHT + FRAME} H${-FRAME} Z M0 0 V${ROOM_HEIGHT} H${ROOM_WIDTH} V0 Z`}
        fill="#1e171c"
      />
      <rect x="0" y="0" width={ROOM_WIDTH} height={ROOM_HEIGHT} fill="none" stroke="rgba(255,214,160,0.12)" strokeWidth="1.2" />
      {stickers.slice(0, STICKER_SPOTS.length).map((sticker, index) => {
        const [x, y, rotation] = STICKER_SPOTS[index];
        return (
          <g key={index} className="frame-sticker" transform={`translate(${x} ${y}) rotate(${rotation})`}>
            <circle r="8.5" fill="#2a2129" stroke="#c9a96b" strokeWidth="1" />
            <text y="4" textAnchor="middle" fontSize="11" fill="#f0c97a">
              {sticker}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
