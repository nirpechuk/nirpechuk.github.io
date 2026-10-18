import type { MoonShape, Player } from "../../game/types";
import { BACK_WALL, WINDOW_FRAME, windowOffsetFor } from "../../game/room";
import { today } from "../../game/dates";
import { roomAtmosphere } from "./lightModel";

/** Cool floor light recedes as the flat warms; window shadows subtract light, not paint. */
export function Moonlight({ id, player, moonShape, hasSillPlant }: { id: string; player: Player; moonShape: MoonShape; hasSillPlant: boolean }) {
  const opacity = roomAtmosphere(player, today()).moonlight;
  if (opacity === 0) return null;
  const cx = WINDOW_FRAME.cx + windowOffsetFor(player.id);
  const half = moonShape === "curtains" ? 20 : 35;
  const nearY = BACK_WALL.bottom + 12;
  const farY = moonShape === "blind" ? 436 : 497;
  const shift = (180 - cx) * 0.5;
  const patch = `${cx - half},${nearY} ${cx + half},${nearY} ${cx + shift + half * 1.7},${farY} ${cx + shift - half * 1.7},${farY}`;
  return (
    <g className="room-moonlight" pointerEvents="none" opacity={opacity}>
      <defs>
        <linearGradient id={`${id}-moon`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#c0d0f3" stopOpacity=".25" />
          <stop offset="1" stopColor="#9fb6e8" stopOpacity=".11" />
        </linearGradient>
        <mask id={`${id}-moon-shadows`} maskUnits="userSpaceOnUse" x="0" y={nearY} width="360" height={farY - nearY}>
          <polygon points={patch} fill="white" />
          <path
            d={`M${cx} ${nearY}L${cx + shift} ${farY}M${cx - 65} ${nearY + (farY - nearY) * 0.47}h160`}
            stroke="black"
            strokeWidth="4"
            opacity=".9"
          />
          {moonShape === "shutters" &&
            Array.from({ length: 12 }, (_, i) => (
              <path key={i} d={`M${cx - 70} ${nearY + i * 10}h180`} stroke="black" strokeWidth="5" opacity=".85" />
            ))}
          {moonShape === "lace" &&
            Array.from({ length: 20 }, (_, i) => (
              <circle key={i} cx={cx - 35 + (i % 5) * 17} cy={nearY + 15 + Math.floor(i / 5) * 22} r="3" fill="black" opacity=".5" />
            ))}
          {hasSillPlant &&
            Array.from({ length: 5 }, (_, i) => (
              <ellipse
                key={i}
                cx={cx + shift + (i - 2) * 9}
                cy={farY - 25 - (i % 2) * 13}
                rx="7"
                ry="17"
                transform={`rotate(${(i - 2) * 20} ${cx + shift + (i - 2) * 9} ${farY - 25 - (i % 2) * 13})`}
                fill="black"
                opacity=".45"
              />
            ))}
        </mask>
      </defs>
      <polygon
        points={`${cx - 32},${WINDOW_FRAME.top + WINDOW_FRAME.height} ${cx + 32},${WINDOW_FRAME.top + WINDOW_FRAME.height} ${cx + shift + half * 1.7},${farY} ${cx + shift - half * 1.7},${farY}`}
        fill={`url(#${id}-moon)`}
        opacity=".18"
      />
      <polygon points={patch} fill={`url(#${id}-moon)`} mask={`url(#${id}-moon-shadows)`} />
    </g>
  );
}
