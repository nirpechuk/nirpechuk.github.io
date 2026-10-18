/** The Brownstone street. Architecture is static; every resident, window and flower is live. */
import type { CSSProperties } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Lighting } from "../art/lighting";
import { streetAtmosphere } from "../art/brownstone/streetAtmosphere";
import { RoomScene } from "../art/RoomScene";
import { petMood, workoutsInWeekOf } from "../game/progression";
import type { GroupSnapshot, Player } from "../game/types";
import { playPop } from "./sound";

export function windowGlow(weekCount: number): number {
  return [0.08, 0.32, 0.45, 0.58, 0.7, 0.8, 0.9, 1][Math.max(0, Math.min(7, Math.floor(weekCount)))];
}
interface BuildingProps {
  snapshot: GroupSnapshot;
  meId: string;
  day: string;
  lighting: Lighting;
  reducedMotion: boolean;
  openPlayerId: string | null;
  onOpenFlat: (playerId: string, fromRect: DOMRect, glow: number) => void;
  onInvite: () => void;
}

function ResidentWindow({
  player,
  day,
  lighting,
  reducedMotion,
  isMe,
  isOpen,
  stars,
  onOpen,
}: {
  player: Player;
  day: string;
  lighting: Lighting;
  reducedMotion: boolean;
  isMe: boolean;
  isOpen: boolean;
  stars: number;
  onOpen: (rect: DOMRect, glow: number) => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [opening, setOpening] = useState(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (isOpen) setOpening(false);
  }, [isOpen]);
  const count = workoutsInWeekOf(player, day);
  const glow = windowGlow(count);
  return (
    <div className={`brownstone-resident${isMe ? " is-me" : ""}`} style={{ "--glow": glow } as CSSProperties}>
      <button
        type="button"
        className={`flat-window${opening || isOpen ? " is-opening" : ""}`}
        data-player={player.id}
        aria-label={`Visit ${player.name}'s flat`}
        title={`${player.name} · ${count} workout${count === 1 ? "" : "s"} this week`}
        onClick={(event) => {
          if (opening || isOpen) return;
          const room = event.currentTarget.querySelector(".room-scene");
          if (!room) return;
          playPop();
          setOpening(true);
          timer.current = setTimeout(() => onOpen(room.getBoundingClientRect(), glow), reducedMotion ? 0 : 500);
        }}
      >
        <div className="window-glass">
          <RoomScene player={player} variant="mini" lighting={lighting} mood={petMood(player, day)} reducedMotion />
          <div className="window-dim" />
          <div className="window-warm" />
          <div className="glass-sheen" />
        </div>
        <div className="window-panes" aria-hidden="true">
          <span className="pane pane-left" />
          <span className="pane pane-right" />
        </div>
        {stars > 0 && (
          <span className="window-stars" aria-label={`${stars} ${stars === 1 ? "star" : "stars"} from friends`}>
            {"✦".repeat(Math.min(stars, 5))}
          </span>
        )}
      </button>
      <div className="brownstone-planter">
        <span className="live-flowers" aria-hidden="true">
          {Array.from({ length: count }, (_, i) => (
            <i key={i} style={{ "--i": i } as CSSProperties} />
          ))}
        </span>
        <span>
          {player.name}
          {isMe ? " · You" : player.demo ? " · Demo" : ""}
        </span>
      </div>
    </div>
  );
}

export function Building({ snapshot, meId, day, lighting, reducedMotion, openPlayerId, onOpenFlat, onInvite }: BuildingProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(snapshot.players.length / 6));
  const activePage = Math.min(page, pages - 1);
  useLayoutEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const fit = () => {
      const { clientWidth: width, clientHeight: height } = scene;
      // Fill laptop/desktop viewports edge to edge; keep the whole building visible on phones.
      setScale(width >= 768 ? Math.max(width / 1440, height / 800) : Math.max(0.25, Math.min((height - 80) / 800, (width - 22) / 470, 1.6)));
    };
    const observer = new ResizeObserver(fit);
    observer.observe(scene);
    fit();
    return () => observer.disconnect();
  }, []);
  const atmosphere = streetAtmosphere(day, new Date().getHours());
  const people = snapshot.players.slice(activePage * 6, activePage * 6 + 6);
  return (
    <main className={`building-screen brownstone-street phase-${lighting.phase}`}>
      <div className="street-scene" ref={sceneRef}>
        <header className="street-header">
          <div>
            <h1>{snapshot.group.name}</h1>
            <p>A little progress. A warmer place.</p>
          </div>
          <button className="chip" onClick={onInvite}>
            Invite a friend
          </button>
        </header>
        <div className="brownstone-world" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
          <img
            className="street-architecture"
            src={`${import.meta.env.BASE_URL}brownstone/street.svg`}
            width="1440"
            height="800"
            alt=""
            draggable="false"
          />
          <div
            className={`street-atmosphere weather-${atmosphere.weather}${atmosphere.dusk ? " is-dusk" : ""}${reducedMotion ? " is-still" : ""}`}
            aria-hidden="true"
          >
            {atmosphere.weather !== "clear" &&
              Array.from({ length: atmosphere.weather === "rain" ? 28 : 14 }, (_, i) => (
                <i
                  key={i}
                  style={
                    { "--i": i, left: `${(i * 137 + 91) % 1440}px`, top: `${(i * 97) % 760}px`, animationDelay: `${-i * 0.73}s` } as CSSProperties
                  }
                />
              ))}
          </div>
          {Array.from({ length: 6 }, (_, i) => {
            const player = people[i];
            // Start on the lower storey and fill upwards, as friends move in.
            const x = 560 + (i % 2) * 210;
            const y = 495 - Math.floor(i / 2) * 145;
            return (
              <div key={player?.id ?? `empty-${i}`} className="brownstone-unit" style={{ left: x, top: y }}>
                {player ? (
                  <ResidentWindow
                    player={player}
                    day={day}
                    lighting={lighting}
                    reducedMotion={reducedMotion}
                    isMe={player.id === meId}
                    isOpen={openPlayerId === player.id}
                    stars={snapshot.reactions.filter((r) => r.to === player.id && r.kind === "sticker").length}
                    onOpen={(rect, glow) => onOpenFlat(player.id, rect, glow)}
                  />
                ) : (
                  <button className="brownstone-vacancy" onClick={onInvite} aria-label="Empty flat — invite a friend">
                    <span>
                      Room for
                      <br />a friend
                    </span>
                  </button>
                )}
              </div>
            );
          })}
          <button className="brass-invite" onClick={onInvite} aria-label={`Invite code ${snapshot.group.code}`}>
            {snapshot.group.code}
          </button>
          <div className="street-reflections" aria-hidden="true">
            {people.map((player, i) => (
              <span key={player.id} style={{ left: 560 + (i % 2) * 210, opacity: 0.07 + windowGlow(workoutsInWeekOf(player, day)) * 0.12 }} />
            ))}
          </div>
        </div>
        <footer className="street-footer">
          {pages > 1 && (
            <nav className="building-pages" aria-label="More neighbours">
              <button className="chip" disabled={activePage === 0} onClick={() => setPage(activePage - 1)}>
                Previous
              </button>
              <span>
                Windows {activePage * 6 + 1}–{Math.min((activePage + 1) * 6, snapshot.players.length)}
              </span>
              <button className="chip" disabled={activePage === pages - 1} onClick={() => setPage(activePage + 1)}>
                Next
              </button>
            </nav>
          )}
          <p>Pick a window. Come on in.</p>
          <span>Every workout makes the street a little brighter.</span>
        </footer>
      </div>
    </main>
  );
}
