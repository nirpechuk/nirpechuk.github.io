/** A Brownstone that gains a matching storey for every two new neighbours. */
import type { CSSProperties } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Lighting } from "../art/lighting";
import { streetAtmosphere } from "../art/brownstone/streetAtmosphere";
import { RoomScene } from "../art/RoomScene";
import { petMood, workoutsInWeekOf } from "../game/progression";
import type { GroupSnapshot, Player } from "../game/types";
import { playPop } from "./sound";
import { StreetArchitecture } from "../art/brownstone/StreetArchitecture";
import { buildingLayout, streetViewport, windowPosition } from "../game/building";

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
  const layout = buildingLayout(snapshot.players.length);
  const [viewport, setViewport] = useState(() => ({ ...streetViewport(1440, 800, layout.floors), measured: false }));
  const [canScrollUp, setCanScrollUp] = useState(false);
  const previousHeight = useRef(0);
  const people = snapshot.players;
  useLayoutEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const fit = () => setViewport({ ...streetViewport(scene.clientWidth, scene.clientHeight, layout.floors), measured: true });
    const observer = new ResizeObserver(fit);
    observer.observe(scene);
    fit();
    return () => observer.disconnect();
  }, [layout.floors]);
  useLayoutEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (!viewport.measured) return;
    if (previousHeight.current) {
      // New floors grow above existing residents; keep the viewed storey in place.
      scene.scrollTop += viewport.contentHeight - previousHeight.current;
    } else {
      const ownIndex = Math.max(
        0,
        people.findIndex((player) => player.id === meId)
      );
      scene.scrollTop = viewport.top + windowPosition(ownIndex, layout.floors).y * viewport.scale - scene.clientHeight * 0.55;
    }
    previousHeight.current = viewport.contentHeight;
    setCanScrollUp(scene.scrollTop > 8);
  }, [viewport, layout.floors, meId]);
  const scrollable = viewport.contentHeight > (sceneRef.current?.clientHeight ?? viewport.contentHeight) + 2;
  const atmosphere = streetAtmosphere(day, new Date().getHours());
  return (
    <main className={`building-screen brownstone-street phase-${lighting.phase}`}>
      <div className="street-scene">
        <header className="street-header">
          <div>
            <h1>{snapshot.group.name}</h1>
            <p>A little progress. A warmer place.</p>
          </div>
          <button className="chip" onClick={onInvite}>
            Invite a friend
          </button>
        </header>
        <div
          className="street-scroll"
          ref={sceneRef}
          onScroll={(event) => setCanScrollUp(event.currentTarget.scrollTop > 8)}
          aria-label="Building floors"
        >
          <div className="street-canvas" style={{ height: viewport.contentHeight }}>
            <div
              className="brownstone-world"
              style={{ height: layout.height, top: viewport.top, transform: `translateX(-50%) scale(${viewport.scale})` }}
            >
              <StreetArchitecture floors={layout.floors} overflow={viewport.overflow} />
              <div
                className={`street-atmosphere weather-${atmosphere.weather}${atmosphere.dusk ? " is-dusk" : ""}${reducedMotion ? " is-still" : ""}`}
                aria-hidden="true"
              >
                {atmosphere.weather !== "clear" &&
                  Array.from({ length: atmosphere.weather === "rain" ? 28 : 14 }, (_, i) => (
                    <i
                      key={i}
                      style={
                        {
                          "--i": i,
                          left: `${(i * 137 + 91) % 1440}px`,
                          top: `${(i * 193) % (layout.height - 40)}px`,
                          animationDelay: `${-i * 0.73}s`,
                        } as CSSProperties
                      }
                    />
                  ))}
              </div>
              {Array.from({ length: layout.capacity }, (_, i) => {
                const player = people[i];
                // Start on the lower storey and fill upwards, as friends move in.
                const { x, y } = windowPosition(i, layout.floors);
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
              <button
                className="brass-invite"
                style={{ top: 632 + layout.extraHeight }}
                onClick={onInvite}
                aria-label={`Invite code ${snapshot.group.code}`}
              >
                {snapshot.group.code}
              </button>
              <div className="street-reflections" aria-hidden="true">
                {people.slice(0, 2).map((player, i) => (
                  <span
                    key={player.id}
                    style={{
                      top: 742 + layout.extraHeight,
                      left: 560 + (i % 2) * 210,
                      opacity: 0.07 + windowGlow(workoutsInWeekOf(player, day)) * 0.12,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
        <footer className={`street-footer${scrollable ? " is-scrollable" : ""}`}>
          {scrollable && (
            <button
              className="chip more-floors"
              onClick={() => {
                const scene = sceneRef.current;
                if (!scene) return;
                scene.scrollTo({
                  top: canScrollUp ? Math.max(0, scene.scrollTop - scene.clientHeight * 0.75) : scene.scrollHeight,
                  behavior: reducedMotion ? "instant" : "smooth",
                });
              }}
            >
              {canScrollUp ? "↑ More floors" : "↓ Back to the street"}
            </button>
          )}
          <p>Pick a window. Come on in.</p>
          <span>Every workout makes the street a little brighter.</span>
        </footer>
      </div>
    </main>
  );
}
