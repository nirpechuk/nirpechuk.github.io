import type { Player } from "../../game/types";
import { ROOM_HEIGHT, ROOM_WIDTH, WINDOW_FRAME, windowOffsetFor } from "../../game/room";
import { today } from "../../game/dates";
import { lightColor, roomAtmosphere, type RoomLight } from "./lightModel";

/** A single darkness mask, real emitters, then a quiet vignette. */
export function BrownstoneLight({
  id,
  player,
  lights,
  freshItemId,
  celebrateKey,
  editing,
  reducedMotion,
}: {
  id: string;
  player: Player;
  lights: RoomLight[];
  freshItemId?: string | null;
  celebrateKey: number;
  editing: boolean;
  reducedMotion: boolean;
}) {
  const atmosphere = roomAtmosphere(player, today());
  const cx = WINDOW_FRAME.cx + windowOffsetFor(player.id);
  const visible = lights.slice(0, 12);
  const shift = (180 - cx) * 0.5;
  return (
    <g pointerEvents="none" className="brownstone-light">
      <defs>
        <radialGradient id={`${id}-hole`}>
          <stop offset="0" stopColor="black" />
          <stop offset=".48" stopColor="black" stopOpacity=".65" />
          <stop offset="1" stopColor="black" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-vig`} cx=".5" cy=".45" r=".75">
          <stop offset=".5" stopColor="#080504" stopOpacity="0" />
          <stop offset="1" stopColor="#080504" stopOpacity=".7" />
        </radialGradient>
        <mask id={`${id}-dark`} maskUnits="userSpaceOnUse" x="0" y="0" width={ROOM_WIDTH} height={ROOM_HEIGHT}>
          <rect width={ROOM_WIDTH} height={ROOM_HEIGHT} fill="white" />
          <ellipse cx={cx} cy={244} rx="60" ry="100" fill={`url(#${id}-hole)`} opacity=".85" />
          <ellipse cx={cx + shift / 2} cy="426" rx="72" ry="90" fill={`url(#${id}-hole)`} opacity={0.45 * atmosphere.moonlight} />
          {visible.map((light) => (
            <circle key={light.id} cx={light.x} cy={light.y} r={light.radius} fill={`url(#${id}-hole)`} opacity={light.strength} />
          ))}
        </mask>
        {visible.map((light) => (
          <radialGradient key={light.id} id={`${id}-${light.id}-warm`}>
            <stop stopColor={lightColor(light.warmth)} stopOpacity=".75" />
            <stop offset=".4" stopColor={lightColor(light.warmth)} stopOpacity=".23" />
            <stop offset="1" stopColor="#ff8a30" stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>
      <rect width={ROOM_WIDTH} height={ROOM_HEIGHT} fill="#22304e" opacity={atmosphere.coolTint} style={{ mixBlendMode: "multiply" }} />
      <rect
        width={ROOM_WIDTH}
        height={ROOM_HEIGHT}
        fill="#080504"
        opacity={editing ? atmosphere.darkness * 0.65 : atmosphere.darkness}
        mask={`url(#${id}-dark)`}
      />
      <g style={{ mixBlendMode: "screen" }}>
        {visible.map((light) => (
          <g
            key={`${light.id}-${celebrateKey}`}
            className={!reducedMotion && (freshItemId === light.id || celebrateKey) ? "light-warmup" : undefined}
          >
            <g opacity={light.strength} className={light.pattern === "flicker" && !reducedMotion ? "light-candle" : undefined}>
              <circle cx={light.x} cy={light.y} r={light.radius} fill={`url(#${id}-${light.id}-warm)`} />
              {light.throw === "down" && (
                <path
                  d={`M${light.x - 9} ${light.y} L${light.x + 9} ${light.y} L${light.x + light.radius * 0.6} ${Math.min(490, light.y + light.radius * 1.7)} L${light.x - light.radius * 0.6} ${Math.min(490, light.y + light.radius * 1.7)} Z`}
                  fill={`url(#${id}-${light.id}-warm)`}
                  opacity=".36"
                />
              )}
              {(light.pattern === "stars" || light.pattern === "dapple") &&
                Array.from({ length: 14 }, (_, i) => {
                  const angle = i * 2.399;
                  const radius = light.radius * (0.3 + (i % 4) * 0.15);
                  const x = light.x + Math.cos(angle) * radius;
                  const y = light.y + Math.sin(angle) * radius * 0.7;
                  return light.pattern === "stars" ? (
                    <path key={i} d={`M${x} ${y - 3}l1 2 2 1-2 1-1 2-1-2-2-1 2-1Z`} fill="#ffd18c" opacity=".17" />
                  ) : (
                    <ellipse key={i} cx={x} cy={y} rx="3" ry="1.5" fill="#ffd18c" opacity=".16" />
                  );
                })}
              {light.pattern === "stripes" &&
                Array.from({ length: 7 }, (_, i) => (
                  <path key={i} d={`M${light.x} ${light.y}l${(i - 3) * 18} ${light.radius}`} stroke="#ffe2b0" strokeWidth="2" opacity=".05" />
                ))}
            </g>
          </g>
        ))}
      </g>
      <rect width={ROOM_WIDTH} height={ROOM_HEIGHT} fill={`url(#${id}-vig)`} />
      <image
        href={`${import.meta.env.BASE_URL}brownstone/grain.png`}
        width={ROOM_WIDTH}
        height={ROOM_HEIGHT}
        preserveAspectRatio="none"
        opacity=".08"
        style={{ mixBlendMode: "overlay" }}
      />
    </g>
  );
}
