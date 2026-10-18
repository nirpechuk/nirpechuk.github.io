/** SVG patterns for wallpapers and floorings, defined by the catalogue's pattern kind and colours. */

import type { ReactNode } from "react";

import { seededRandom } from "../game/progression";
import type { SurfaceDef } from "../game/types";

function tile(id: string, width: number, height: number, children: ReactNode, transform?: string) {
  return (
    <pattern id={id} width={width} height={height} patternUnits="userSpaceOnUse" patternTransform={transform}>
      {children}
    </pattern>
  );
}

function starPath(centerX: number, centerY: number, radius: number): string {
  let path = "";
  for (let index = 0; index < 10; index++) {
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    const r = index % 2 === 0 ? radius : radius * 0.45;
    path += `${index === 0 ? "M" : "L"}${(centerX + Math.cos(angle) * r).toFixed(2)} ${(centerY + Math.sin(angle) * r).toFixed(2)}`;
  }
  return `${path}Z`;
}

export function SurfacePattern({ id, surface }: { id: string; surface: SurfaceDef }) {
  const [base, second = base, third = second, fourth = third] = surface.colors;
  switch (surface.pattern) {
    case "plain":
      return tile(
        id,
        48,
        12,
        <>
          <rect width="48" height="12" fill={base} />
          {surface.kind === "flooring" && <line x1="0" y1="11.5" x2="48" y2="11.5" stroke={second} strokeWidth="1" />}
        </>,
      );
    case "stripes":
      return tile(
        id,
        24,
        24,
        <>
          <rect width="24" height="24" fill={base} />
          <rect x="12" width="12" height="24" fill={second} />
          <line x1="12" y1="0" x2="12" y2="24" stroke="#ffffff" strokeOpacity="0.07" strokeWidth="1" />
        </>,
      );
    case "dots":
      return tile(
        id,
        20,
        20,
        <>
          <rect width="20" height="20" fill={base} />
          <circle cx="5" cy="5" r="2.6" fill={second} />
          <circle cx="15" cy="15" r="2.6" fill={second} />
        </>,
      );
    case "gingham":
      return tile(
        id,
        18,
        18,
        <>
          <rect width="18" height="18" fill={base} />
          <rect width="9" height="18" fill={second} opacity="0.6" />
          <rect width="18" height="9" fill={second} opacity="0.6" />
        </>,
      );
    case "checker":
      return tile(
        id,
        28,
        28,
        <>
          <rect width="28" height="28" fill={base} />
          <rect width="14" height="14" fill={second} />
          <rect x="14" y="14" width="14" height="14" fill={second} />
        </>,
      );
    case "stars":
      return tile(
        id,
        46,
        46,
        <>
          <rect width="46" height="46" fill={base} />
          <path d={starPath(10, 12, 4)} fill={second} />
          <path d={starPath(33, 32, 3)} fill={second} opacity="0.85" />
          <circle cx="34" cy="9" r="1.1" fill={second} />
          <circle cx="16" cy="36" r="1" fill={second} />
          <circle cx="42" cy="22" r="0.8" fill={second} />
        </>,
      );
    case "scallop":
      return tile(
        id,
        20,
        14,
        <>
          <rect width="20" height="14" fill={base} />
          <path d="M0 14 A10 10 0 0 1 20 14" fill="none" stroke={second} strokeWidth="2" />
          <path d="M-10 7 A10 10 0 0 1 10 7 M10 7 A10 10 0 0 1 30 7" fill="none" stroke={second} strokeWidth="2" />
        </>,
      );
    case "vines":
      return tile(
        id,
        40,
        48,
        <>
          <rect width="40" height="48" fill={base} />
          <path d="M10 0 C2 12 18 24 10 36 C6 42 10 48 10 48" fill="none" stroke={second} strokeWidth="1.4" />
          <ellipse cx="6" cy="10" rx="3.4" ry="2" fill={second} transform="rotate(-30 6 10)" />
          <ellipse cx="15" cy="22" rx="3.4" ry="2" fill={second} transform="rotate(30 15 22)" />
          <ellipse cx="6" cy="34" rx="3.4" ry="2" fill={second} transform="rotate(-30 6 34)" />
          <circle cx="30" cy="16" r="2.4" fill={third} />
          <circle cx="28" cy="38" r="1.6" fill={third} opacity="0.8" />
        </>,
      );
    case "planks":
      return tile(
        id,
        72,
        16,
        <>
          <rect width="72" height="8" fill={base} />
          <rect y="8" width="72" height="8" fill={second} />
          <rect x="30" y="8" width="42" height="8" fill={third} />
          <line x1="0" y1="8" x2="72" y2="8" stroke="#7b5636" strokeOpacity="0.35" />
          <line x1="0" y1="16" x2="72" y2="16" stroke="#7b5636" strokeOpacity="0.35" />
          <line x1="48" y1="0" x2="48" y2="8" stroke="#7b5636" strokeOpacity="0.35" />
          <line x1="30" y1="8" x2="30" y2="16" stroke="#7b5636" strokeOpacity="0.35" />
        </>,
      );
    case "herringbone":
      return tile(
        id,
        24,
        24,
        <>
          <rect width="24" height="24" fill={base} />
          <rect x="0" y="0" width="12" height="6" fill={second} stroke="#7b5636" strokeOpacity="0.3" />
          <rect x="12" y="6" width="12" height="6" fill={base} stroke="#7b5636" strokeOpacity="0.3" />
          <rect x="0" y="12" width="12" height="6" fill={base} stroke="#7b5636" strokeOpacity="0.3" />
          <rect x="12" y="18" width="12" height="6" fill={second} stroke="#7b5636" strokeOpacity="0.3" />
        </>,
        "rotate(45)",
      );
    case "tiles":
      return tile(
        id,
        24,
        24,
        <>
          <rect width="24" height="24" fill={second} />
          <rect x="1" y="1" width="22" height="22" rx="2" fill={base} />
        </>,
      );
    case "terrazzo": {
      const random = seededRandom(surface.id);
      const chips = Array.from({ length: 14 }, (_, index) => ({
        x: random() * 56,
        y: random() * 56,
        r: 0.6 + random() * 1.2,
        color: [second, third, fourth][index % 3],
      }));
      return tile(
        id,
        56,
        56,
        <>
          <rect width="56" height="56" fill={base} />
          {chips.map((chip, index) => (
            <ellipse key={index} cx={chip.x} cy={chip.y} rx={chip.r * 1.3} ry={chip.r} fill={chip.color} />
          ))}
        </>,
      );
    }
  }
}

/** Small square swatch of a surface, for cards and the decorating drawer. */
export function SurfaceThumb({ surface, size = 64 }: { surface: SurfaceDef; size?: number }) {
  const id = `thumb-${surface.id}`;
  return (
    <svg className="item-thumb" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <SurfacePattern id={id} surface={surface} />
      </defs>
      <rect x="6" y="6" width="52" height="52" rx="6" fill={`url(#${id})`} />
      <rect x="6" y="6" width="52" height="52" rx="6" fill="none" stroke="rgba(84,52,32,0.25)" strokeWidth="2" />
    </svg>
  );
}
