/**
 * The group view: an apartment building at night, seen from the street. Every friend's flat is a
 * window (a live miniature of their room) with a window box that blooms with their weekly
 * workouts. Tapping a window swings its panes open and zooms into the flat.
 */

import type { CSSProperties } from "react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import type { Lighting } from "../art/lighting";
import { RoomScene } from "../art/RoomScene";
import { RoomArchitecture } from "../art/RoomShell";
import { surfaceById } from "../game/catalog";
import { DEFAULT_FLOORING, DEFAULT_WALLPAPER } from "../game/room";
import { petMood, workoutsInWeekOf } from "../game/progression";
import type { GroupSnapshot, Player } from "../game/types";
import { playPop } from "./sound";

const FLATS_PER_FLOOR = 2;
const MIN_ROOMS = 6;
/** Keep in sync with the `.pane` transition in styles.css. */
const PANE_OPEN_MS = 700;
/** A short beat with the window fully open before the zoom begins. */
const PAUSE_BEFORE_ZOOM_MS = 250;
const FLOWER_COLORS = ["#d9707a", "#e8a050", "#b08ad0", "#d98a9a", "#8ab0d8"];
/** Window brightness by workouts this week: a quiet week is a dim window, a busy one glows. */
const GLOW_BY_WEEKLY_COUNT = [0.08, 0.42, 0.62, 0.8, 1];

export function windowGlow(weekCount: number): number {
  return GLOW_BY_WEEKLY_COUNT[Math.min(weekCount, GLOW_BY_WEEKLY_COUNT.length - 1)];
}

type WindowSlot = { kind: "flat"; player: Player } | { kind: "vacancy" };

interface BuildingProps {
  snapshot: GroupSnapshot;
  meId: string;
  day: string;
  lighting: Lighting;
  reducedMotion: boolean;
  /** Player whose flat is open in the visit view; their window stays open meanwhile. */
  openPlayerId: string | null;
  onOpenFlat: (playerId: string, fromRect: DOMRect, glow: number) => void;
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
  isOpen,
  onOpen,
}: {
  player: Player;
  isMe: boolean;
  day: string;
  lighting: Lighting;
  reducedMotion: boolean;
  isOpen: boolean;
  onOpen: (fromRect: DOMRect, glow: number) => void;
}) {
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const [opening, setOpening] = useState(false);
  const weekCount = workoutsInWeekOf(player, day);
  const glow = windowGlow(weekCount);
  useEffect(() => {
    if (isOpen) setOpening(false);
  }, [isOpen]);
  return (
    <div className={`flat-slot${isMe ? " is-me" : ""}`}>
      <button
        type="button"
        className={`flat-window${opening || isOpen ? " is-opening" : ""}`}
        style={{ "--glow": glow } as CSSProperties}
        data-player={player.id}
        aria-label={`Visit ${player.name}'s flat`}
        onClick={(event) => {
          if (opening || isOpen) return;
          playPop();
          const room = event.currentTarget.querySelector(".window-glass .room-scene");
          if (!room) throw new Error("Window room element missing.");
          setOpening(true);
          timer.current = window.setTimeout(
            () => onOpen(room.getBoundingClientRect(), glow),
            reducedMotion ? 0 : PANE_OPEN_MS + PAUSE_BEFORE_ZOOM_MS
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
        <strong>{isMe ? `${player.name} · You` : player.name}</strong>
        {player.demo && <span className="name-tag-demo">demo</span>}
      </div>
    </div>
  );
}

function Vacancy({ onInvite }: { onInvite: () => void }) {
  const id = useId();
  return (
    <div className="flat-slot is-empty">
      <button type="button" className="flat-window is-vacant" onClick={onInvite} aria-label="Empty flat — invite a friend">
        <div className="window-glass vacancy-glass">
          <svg className="vacancy-interior" viewBox="-7 -7 374 434" aria-hidden="true">
            <RoomArchitecture idPrefix={id} wallpaper={surfaceById(DEFAULT_WALLPAPER)} flooring={surfaceById(DEFAULT_FLOORING)} />
            <rect x="139" y="94" width="82" height="120" rx="2" fill="#403c48" stroke="#5e5654" strokeWidth="6" />
            <path d="M180 94v120m-41-60h82" fill="none" stroke="#211c27" strokeWidth="5" />
          </svg>
          <div className="glass-sheen" />
        </div>
        <div className="window-panes" aria-hidden="true">
          <span className="pane pane-left" />
          <span className="pane pane-right" />
        </div>
        <span className="window-lintel" aria-hidden="true" />
      </button>
      <FlowerBox count={0} />
    </div>
  );
}

/** A freestanding neon wordmark: warm glass tubing on a few weathered roof planks. */
function RoofSign() {
  const lettering = useId();
  return (
    <svg className="roof-sign" viewBox="0 0 300 112" aria-hidden="true">
      <defs>
        <text id={lettering} x="150" y="79" textAnchor="middle">
          Flats
        </text>
      </defs>
      <g className="roof-sign-supports" fill="#42332e" stroke="#201c20" strokeWidth="1">
        <path d="M57 34h6v76h-6zM239 34h6v76h-6z" />
        <path className="roof-sign-center-support" d="M146 30h7v80h-7z" />
        <path d="M36 47h229v6H36zM38 86h225v5H38z" />
        <path d="m61 106 33-24 3 4-34 25zM212 83l31 24-3 4-31-24z" />
      </g>
      <g stroke="#89705a" strokeWidth="1" opacity="0.42">
        <path d="M59 38v62m182-63v62M41 49h217M42 88h216" />
        <path className="roof-sign-center-support" d="M149 35v67" />
      </g>
      <path d="M244 69q14 14 3 27t9 15" stroke="#211c22" strokeWidth="1.5" fill="none" />
      <g fill="#b99771" opacity="0.65">
        {[60, 149, 242].map((x) => (
          <circle key={x} className={x === 149 ? "roof-sign-center-support" : undefined} cx={x} cy="50" r="1.3" />
        ))}
      </g>
      <g className="roof-neon">
        <use href={`#${lettering}`} className="roof-neon-tube" />
        <use href={`#${lettering}`} className="roof-neon-core" />
      </g>
    </svg>
  );
}

export function Building({ snapshot, meId, day, lighting, reducedMotion, openPlayerId, onOpenFlat, onInvite }: BuildingProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const buildingRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [streetHeight, setStreetHeight] = useState(700);
  useLayoutEffect(() => {
    const scene = sceneRef.current;
    const building = buildingRef.current;
    if (!scene || !building) return;
    const fit = () => {
      const nextScale = Math.min(1.15, (scene.clientWidth - 72) / 434, (scene.clientHeight - 180) / building.offsetHeight);
      setScale(nextScale);
      setStreetHeight(building.offsetHeight * nextScale);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(scene);
    observer.observe(building);
    fit();
    return () => observer.disconnect();
  }, []);
  const slots: WindowSlot[] = snapshot.players.map((player) => ({ kind: "flat", player }));
  // Keep at least three storeys and leave space for the next friend to move in.
  const roomCount = Math.max(MIN_ROOMS, Math.ceil((slots.length + 1) / FLATS_PER_FLOOR) * FLATS_PER_FLOOR);
  while (slots.length < roomCount) slots.push({ kind: "vacancy" });
  const floors: WindowSlot[][] = [];
  for (let index = 0; index < slots.length; index += FLATS_PER_FLOOR) floors.push(slots.slice(index, index + FLATS_PER_FLOOR));

  return (
    <main className={`building-screen phase-${lighting.phase}`}>
      <div
        className="street-scene"
        ref={sceneRef}
        style={
          {
            "--neighbour-height": `${streetHeight}px`,
            "--building-left": `${190 * scale + 16}px`,
            "--building-right": `${244 * scale - 16}px`,
          } as CSSProperties
        }
      >
        <div className="sky-layer" aria-hidden="true">
          <span className="sky-cloud cloud-a" />
          <span className="sky-cloud cloud-b" />
          <span className="sky-cloud cloud-c" />
          <svg className="sky-orb" viewBox="0 0 34 34" aria-hidden="true">
            {lighting.phase === "night" ? <path d="M22 1.8A16 16 0 1 0 22 32.2C10 27 10 7 22 1.8Z" /> : <circle cx="17" cy="17" r="16" />}
          </svg>
        </div>
        <div className="neighbourhood" aria-hidden="true">
          <div className="townhouses">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`townhouse townhouse-${i}`}>
                <div className="townhouse-roof">
                  <span className="little-chimney" />
                </div>
                <div className="neighbour-facade">
                  <div className="neighbour-windows">
                    {Array.from({ length: i === 1 ? 8 : 6 }, (_, n) => (
                      <span key={n} className={`neighbour-window window-${n % 4}`}>
                        <i />
                      </span>
                    ))}
                  </div>
                  <div className="neighbour-door">
                    <span />
                  </div>
                  <div className="neighbour-stoop" />
                  <span className="neighbour-planter" />
                </div>
                <span className="neighbour-side" />
              </div>
            ))}
          </div>
          <div className="neighbour-apartments">
            {[0, 1].map((i) => (
              <div key={i} className={`neighbour-apartment apartment-${i}`}>
                <span className="apartment-cornice" />
                <span className="little-chimney" />
                <div className="neighbour-facade">
                  <div className="neighbour-windows">
                    {Array.from({ length: i ? 9 : 12 }, (_, n) => (
                      <span key={n} className={`neighbour-window window-${n % 4}`}>
                        <i />
                      </span>
                    ))}
                  </div>
                  <div className="neighbour-door">
                    <span />
                  </div>
                  <span className="neighbour-planter" />
                </div>
                <span className="neighbour-side" />
              </div>
            ))}
          </div>
        </div>
        <div className="street-ground" aria-hidden="true" />
        <svg className="street-details" viewBox="0 0 1440 240" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
          <g fill="#172b2c">
            <path d="M50 190L78 23 111 190Z M1120 190L1165 3 1210 190Z" />
            <path d="M218 190L248 53 280 190Z M1280 190L1316 30 1358 190Z" />
          </g>
          <g stroke="#564440" strokeWidth="7" fill="none">
            <path d="M335 160V210 M475 160V210 M325 168H485 M325 181H485 M330 147H480" />
            <path d="M1010 184h65m-52-28 24 28 20-39m-18 0h27" />
          </g>
          <g fill="none" stroke="#9c8a78" strokeWidth="3">
            <circle cx="1012" cy="188" r="24" />
            <circle cx="1084" cy="188" r="24" />
            <path d="M1012 188l21-32 19 32h-40l48-34 24 34m-24-34-6-17h13" />
          </g>
          <g fill="#c19c74">
            <ellipse cx="300" cy="211" rx="4" ry="2" />
            <ellipse cx="932" cy="214" rx="5" ry="2" />
            <ellipse cx="1142" cy="226" rx="3" ry="2" />
          </g>
          <g stroke="#59484c" strokeWidth="5" fill="none">
            <path d="M178 210V62q0-12 12-12h18 M1244 210V62q0-12-12-12h-18" />
          </g>
          <g fill="#ffda96">
            <path d="M198 48h20l-4 18h-12Z M1204 48h20l-4 18h-12Z" />
          </g>
          <g fill="#ffda96" opacity=".06">
            <ellipse cx="208" cy="165" rx="60" ry="80" />
            <ellipse cx="1214" cy="165" rx="60" ry="80" />
          </g>
        </svg>
        <div className="building-anchor">
          <div className="building" ref={buildingRef} style={{ "--building-scale": scale } as CSSProperties}>
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
              <RoofSign />
            </div>
            <div className="facade">
              {[...floors].reverse().map((floor, reversedIndex) => (
                <div className="floor" key={floors.length - reversedIndex}>
                  {floor.map((slot, index) => {
                    if (slot.kind === "vacancy") return <Vacancy key={`vacancy-${index}`} onInvite={onInvite} />;
                    return (
                      <FlatWindow
                        key={slot.player.id}
                        player={slot.player}
                        isMe={slot.player.id === meId}
                        day={day}
                        lighting={lighting}
                        reducedMotion={reducedMotion}
                        isOpen={openPlayerId === slot.player.id}
                        onOpen={(rect, glow) => onOpenFlat(slot.player.id, rect, glow)}
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
        </div>
        <p className="building-hint">Pick a window. Come on in.</p>
      </div>
    </main>
  );
}
