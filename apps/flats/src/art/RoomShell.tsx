/**
 * The room's architecture in one-point perspective: a floor whose boards and tiles converge on
 * the vanishing point, side walls with panelling and skirting, a beamed ceiling and the back
 * wall. SVG patterns cannot be drawn in perspective, so floors are generated as projected
 * polygons from a description of the pattern on the floor plane.
 */

import type { ReactNode } from "react";

import { seededRandom } from "../game/progression";
import { BACK_SCALE, BACK_WALL, DADO_HEIGHT, FLOOR_Y, project, ROOM_HEIGHT, ROOM_WIDTH } from "../game/room";
import type { SurfaceDef } from "../game/types";
import { SurfacePattern } from "./Surfaces";

/** World length of the floor from the front edge to the back wall, in world units. */
const FLOOR_LENGTH = 300;
const SKIRTING_HEIGHT = 14;
const CROWN_HEIGHT = 8;

type Quad = [number, number, number, number];

function floorPoint(worldX: number, depth: number): string {
  const point = project(worldX, FLOOR_Y, depth);
  return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
}

/** A rectangle on the floor plane: x0..x1 across, d0..d1 in depth. */
function floorQuad([x0, x1, d0, d1]: Quad): string {
  return [floorPoint(x0, d0), floorPoint(x1, d0), floorPoint(x1, d1), floorPoint(x0, d1)].join(" ");
}

function wallQuad(worldX: number, y0: number, y1: number, d0: number, d1: number): string {
  return [project(worldX, y0, d0), project(worldX, y0, d1), project(worldX, y1, d1), project(worldX, y1, d0)]
    .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");
}

interface FloorPiece {
  quad: Quad;
  fill: string;
  opacity?: number;
}

function plankPieces(colors: string[], boardWidth: number, seed: string): FloorPiece[] {
  const random = seededRandom(seed);
  const pieces: FloorPiece[] = [];
  const boards = Math.ceil(ROOM_WIDTH / boardWidth);
  const boardLength = 110 / FLOOR_LENGTH;
  for (let board = 0; board < boards; board++) {
    let depth = -random() * boardLength;
    while (depth < 1) {
      const start = Math.max(0, depth);
      const end = Math.min(1, depth + boardLength);
      const color = colors[Math.floor(random() * colors.length)];
      pieces.push({ quad: [board * boardWidth, (board + 1) * boardWidth, start, end], fill: color });
      depth += boardLength;
    }
  }
  return pieces;
}

function gridPieces(colors: string[], tileSize: number, pattern: "checker" | "tiles"): FloorPiece[] {
  const pieces: FloorPiece[] = [];
  const depthStep = tileSize / FLOOR_LENGTH;
  const columns = Math.ceil(ROOM_WIDTH / tileSize);
  const rows = Math.ceil(1 / depthStep);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const d0 = row * depthStep;
      const d1 = Math.min(1, d0 + depthStep);
      const x0 = column * tileSize;
      const x1 = x0 + tileSize;
      if (pattern === "checker") {
        if ((row + column) % 2 === 1) pieces.push({ quad: [x0, x1, d0, d1], fill: colors[1] ?? colors[0] });
      } else {
        const inset = 1.2;
        pieces.push({ quad: [x0 + inset, x1 - inset, d0 + inset / FLOOR_LENGTH, d1 - inset / FLOOR_LENGTH], fill: colors[0] });
      }
    }
  }
  return pieces;
}

/** Basket-weave parquet: square cells split into three strips, alternating direction. */
function parquetPieces(colors: string[]): FloorPiece[] {
  const pieces: FloorPiece[] = [];
  const cell = 36;
  const depthStep = cell / FLOOR_LENGTH;
  const columns = Math.ceil(ROOM_WIDTH / cell);
  const rows = Math.ceil(1 / depthStep);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x0 = column * cell;
      const d0 = row * depthStep;
      for (let strip = 0; strip < 3; strip++) {
        const fill = colors[(strip + row + column) % colors.length];
        if ((row + column) % 2 === 0) {
          const sx0 = x0 + (strip * cell) / 3;
          pieces.push({ quad: [sx0 + 0.6, sx0 + cell / 3 - 0.6, d0, Math.min(1, d0 + depthStep)], fill });
        } else {
          const sd0 = d0 + (strip * depthStep) / 3;
          pieces.push({ quad: [x0, x0 + cell, sd0, Math.min(1, sd0 + depthStep / 3 - 0.002)], fill });
        }
      }
    }
  }
  return pieces;
}

function terrazzoChips(colors: string[], seed: string): ReactNode {
  const random = seededRandom(seed);
  return Array.from({ length: 70 }, (_, index) => {
    const depth = random();
    const point = project(random() * ROOM_WIDTH, FLOOR_Y, depth);
    const radius = (1.2 + random() * 1.8) * point.k;
    return <ellipse key={index} cx={point.x} cy={point.y} rx={radius * 1.4} ry={radius * 0.55} fill={colors[1 + (index % (colors.length - 1))]} opacity="0.85" />;
  });
}

export function PerspectiveFloor({ surface }: { surface: SurfaceDef }) {
  const [base, ...accents] = surface.colors;
  const floorOutline = floorQuad([0, ROOM_WIDTH, 0, 1]);
  let pieces: FloorPiece[] = [];
  if (surface.pattern === "planks") pieces = plankPieces(surface.colors, 30, surface.id);
  if (surface.pattern === "plain") pieces = plankPieces(surface.colors, 40, surface.id);
  if (surface.pattern === "checker") pieces = gridPieces(surface.colors, 40, "checker");
  if (surface.pattern === "tiles") pieces = gridPieces(surface.colors, 30, "tiles");
  if (surface.pattern === "herringbone") pieces = parquetPieces(surface.colors);
  const seamColor = "rgba(10, 5, 12, 0.35)";
  return (
    <g className="perspective-floor">
      <polygon points={floorOutline} fill={surface.pattern === "tiles" ? accents[0] ?? base : base} />
      {pieces.map((piece, index) => (
        <polygon
          key={index}
          points={floorQuad(piece.quad)}
          fill={piece.fill}
          stroke={surface.pattern === "checker" ? undefined : seamColor}
          strokeWidth="0.5"
        />
      ))}
      {surface.pattern === "terrazzo" && terrazzoChips(surface.colors, surface.id)}
    </g>
  );
}

export function RoomArchitecture({ idPrefix, wallpaper, flooring }: { idPrefix: string; wallpaper: SurfaceDef; flooring: SurfaceDef }) {
  const left = 0;
  const right = ROOM_WIDTH;
  const panelDepths = [0.22, 0.48, 0.74];
  const beamDepths = [0.18, 0.68];
  return (
    <g className="room-shell">
      <defs>
        <SurfacePattern id={`${idPrefix}-wall`} surface={wallpaper} scale={BACK_SCALE} />
        <SurfacePattern id={`${idPrefix}-sidewall`} surface={wallpaper} scale={0.8} />
        <linearGradient id={`${idPrefix}-leftshade`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0c0610" stopOpacity="0.62" />
          <stop offset="1" stopColor="#0c0610" stopOpacity="0.25" />
        </linearGradient>
        <linearGradient id={`${idPrefix}-rightshade`} x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="#0c0610" stopOpacity="0.68" />
          <stop offset="1" stopColor="#0c0610" stopOpacity="0.3" />
        </linearGradient>
        <linearGradient id={`${idPrefix}-floorshade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0c0610" stopOpacity="0.55" />
          <stop offset="0.45" stopColor="#0c0610" stopOpacity="0.12" />
          <stop offset="1" stopColor="#0c0610" stopOpacity="0.32" />
        </linearGradient>
        <linearGradient id={`${idPrefix}-ceilingshade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#120c14" />
          <stop offset="1" stopColor="#2a2029" />
        </linearGradient>
      </defs>

      <polygon points={`0,0 ${ROOM_WIDTH},0 ${BACK_WALL.right},${BACK_WALL.top} ${BACK_WALL.left},${BACK_WALL.top}`} fill={`url(#${idPrefix}-ceilingshade)`} />
      {beamDepths.map((depth) => (
        <g key={depth}>
          <polygon points={wallQuadCeiling(depth, depth + 0.07, 12)} fill="#2f252d" />
          <polygon
            points={[project(left, 0, depth), project(right, 0, depth), project(right, 12, depth), project(left, 12, depth)]
              .map((point) => `${point.x},${point.y}`)
              .join(" ")}
            fill="#1a1318"
          />
        </g>
      ))}

      <rect x={BACK_WALL.left} y={BACK_WALL.top} width={BACK_WALL.right - BACK_WALL.left} height={BACK_WALL.bottom - BACK_WALL.top} fill={`url(#${idPrefix}-wall)`} />

      <polygon points={wallQuad(left, 0, FLOOR_Y, 0, 1)} fill={`url(#${idPrefix}-sidewall)`} />
      <polygon points={wallQuad(left, 0, FLOOR_Y, 0, 1)} fill={`url(#${idPrefix}-leftshade)`} />
      <polygon points={wallQuad(right, 0, FLOOR_Y, 0, 1)} fill={`url(#${idPrefix}-sidewall)`} />
      <polygon points={wallQuad(right, 0, FLOOR_Y, 0, 1)} fill={`url(#${idPrefix}-rightshade)`} />
      {panelDepths.map((depth) =>
        [left, right].map((worldX) => {
          const top = project(worldX, CROWN_HEIGHT, depth);
          const bottom = project(worldX, FLOOR_Y - SKIRTING_HEIGHT, depth);
          return <line key={`${worldX}-${depth}`} x1={top.x} y1={top.y} x2={bottom.x} y2={bottom.y} stroke="rgba(0,0,0,0.28)" strokeWidth="1" />;
        }),
      )}

      {[left, right].map((worldX) => (
        <g key={`dado-${worldX}`}>
          <polygon points={wallQuad(worldX, FLOOR_Y - DADO_HEIGHT, FLOOR_Y, 0, 1)} fill="#140d14" opacity="0.5" />
          <polygon points={wallQuad(worldX, FLOOR_Y - DADO_HEIGHT - 3, FLOOR_Y - DADO_HEIGHT, 0, 1)} fill="#2e242b" />
        </g>
      ))}
      <BackWallDado />

      <PerspectiveFloor surface={flooring} />
      <polygon points={floorQuad([0, ROOM_WIDTH, 0, 1])} fill={`url(#${idPrefix}-floorshade)`} />

      {[left, right].map((worldX) => (
        <g key={worldX}>
          <polygon points={wallQuad(worldX, FLOOR_Y - SKIRTING_HEIGHT, FLOOR_Y, 0, 1)} fill="#1f181d" />
          <polygon points={wallQuad(worldX, 0, CROWN_HEIGHT, 0, 1)} fill="#1a1418" />
        </g>
      ))}
      <rect
        x={BACK_WALL.left}
        y={BACK_WALL.bottom - SKIRTING_HEIGHT * BACK_SCALE}
        width={BACK_WALL.right - BACK_WALL.left}
        height={SKIRTING_HEIGHT * BACK_SCALE}
        fill="#241c22"
      />
      <rect
        x={BACK_WALL.left}
        y={BACK_WALL.bottom - SKIRTING_HEIGHT * BACK_SCALE}
        width={BACK_WALL.right - BACK_WALL.left}
        height="0.8"
        fill="rgba(255,220,170,0.14)"
      />
      <rect x={BACK_WALL.left} y={BACK_WALL.top} width={BACK_WALL.right - BACK_WALL.left} height={CROWN_HEIGHT * BACK_SCALE} fill="#1a1418" />
      {[
        [BACK_WALL.left, BACK_WALL.top, BACK_WALL.left, BACK_WALL.bottom],
        [BACK_WALL.right, BACK_WALL.top, BACK_WALL.right, BACK_WALL.bottom],
        [0, ROOM_HEIGHT, BACK_WALL.left, BACK_WALL.bottom],
        [ROOM_WIDTH, ROOM_HEIGHT, BACK_WALL.right, BACK_WALL.bottom],
      ].map(([x1, y1, x2, y2], index) => (
        <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(0,0,0,0.4)" strokeWidth="1.2" />
      ))}
    </g>
  );
}

/** Underside of a ceiling beam spanning the room between two depths. */
function wallQuadCeiling(d0: number, d1: number, beamDrop: number): string {
  return [project(0, beamDrop, d0), project(ROOM_WIDTH, beamDrop, d0), project(ROOM_WIDTH, beamDrop, d1), project(0, beamDrop, d1)]
    .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");
}

/** Darker panelled lower wall with a rail, on the back wall. */
function BackWallDado() {
  const width = BACK_WALL.right - BACK_WALL.left;
  const height = DADO_HEIGHT * BACK_SCALE;
  const top = BACK_WALL.bottom - height;
  const panelCount = 4;
  const gap = 5;
  const panelWidth = (width - gap * (panelCount + 1)) / panelCount;
  return (
    <g className="dado">
      <rect x={BACK_WALL.left} y={top} width={width} height={height} fill="#140d14" opacity="0.5" />
      {Array.from({ length: panelCount }, (_, index) => (
        <rect
          key={index}
          x={BACK_WALL.left + gap + index * (panelWidth + gap)}
          y={top + 6}
          width={panelWidth}
          height={height - 6 - 14 * BACK_SCALE - 4}
          rx="1.5"
          fill="none"
          stroke="rgba(255,225,190,0.07)"
          strokeWidth="1"
        />
      ))}
      <rect x={BACK_WALL.left} y={top - 2} width={width} height="2.5" fill="#2e242b" />
      <rect x={BACK_WALL.left} y={top - 2} width={width} height="0.7" fill="rgba(255,225,190,0.16)" />
    </g>
  );
}
