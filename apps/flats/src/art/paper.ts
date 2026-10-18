/**
 * Illustration geometry. Primitives from the catalogue become SVG paths with a very slight,
 * deterministic irregularity (per item and layer) so shapes feel drawn rather than mechanical,
 * without changing between renders. Results are cached because rooms re-render often.
 */

import { seededRandom } from "../game/progression";
import type { Layer } from "../game/types";

type Point = [number, number];

const geometryCache = new Map<string, string>();

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function jitterAmount(width: number, height: number): number {
  return clamp(Math.min(width, height) * 0.012, 0.04, 0.22);
}

function format(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

function linePath(points: Point[], closed: boolean): string {
  const [first, ...rest] = points;
  const body = rest.map(([x, y]) => `L${format(x)} ${format(y)}`).join("");
  return `M${format(first[0])} ${format(first[1])}${body}${closed ? "Z" : ""}`;
}

/** Closed curve through midpoints, using each sample as a quadratic control point. */
function smoothClosedPath(points: Point[]): string {
  const midpoint = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const count = points.length;
  const start = midpoint(points[count - 1], points[0]);
  let path = `M${format(start[0])} ${format(start[1])}`;
  for (let index = 0; index < count; index++) {
    const control = points[index];
    const end = midpoint(control, points[(index + 1) % count]);
    path += `Q${format(control[0])} ${format(control[1])} ${format(end[0])} ${format(end[1])}`;
  }
  return `${path}Z`;
}

function subdividePolygon(corners: Point[], random: () => number, amount: number): Point[] {
  const points: Point[] = [];
  for (let index = 0; index < corners.length; index++) {
    const [x1, y1] = corners[index];
    const [x2, y2] = corners[(index + 1) % corners.length];
    const length = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(1, Math.round(length / clamp(length / 3, 2.5, 7)));
    const normalX = length === 0 ? 0 : -(y2 - y1) / length;
    const normalY = length === 0 ? 0 : (x2 - x1) / length;
    for (let step = 0; step < steps; step++) {
      const t = step / steps;
      const wobble = step === 0 ? (random() - 0.5) * amount * 0.6 : (random() - 0.5) * 2 * amount;
      points.push([x1 + (x2 - x1) * t + normalX * wobble, y1 + (y2 - y1) * t + normalY * wobble]);
    }
  }
  return points;
}

function roundedRectCorners(x: number, y: number, width: number, height: number, radius: number): Point[] {
  const r = Math.min(radius, width / 2, height / 2);
  if (r <= 0.01) {
    return [
      [x, y],
      [x + width, y],
      [x + width, y + height],
      [x, y + height],
    ];
  }
  const arcSteps = 5;
  const corners: [number, number, number][] = [
    [x + width - r, y + r, -Math.PI / 2],
    [x + width - r, y + height - r, 0],
    [x + r, y + height - r, Math.PI / 2],
    [x + r, y + r, Math.PI],
  ];
  const points: Point[] = [];
  for (const [centerX, centerY, startAngle] of corners) {
    for (let step = 0; step <= arcSteps; step++) {
      const angle = startAngle + (step / arcSteps) * (Math.PI / 2);
      points.push([centerX + Math.cos(angle) * r, centerY + Math.sin(angle) * r]);
    }
  }
  return points;
}

function ellipsePoints(
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  random: () => number,
): Point[] {
  const perimeter = Math.PI * (radiusX + radiusY);
  const count = Math.round(clamp(perimeter / 3.5, 14, 72));
  const amount = jitterAmount(radiusX * 2, radiusY * 2);
  const points: Point[] = [];
  for (let index = 0; index < count; index++) {
    const angle = (index / count) * Math.PI * 2;
    const wobble = 1 + ((random() - 0.5) * 2 * amount) / Math.max(radiusX, radiusY);
    points.push([centerX + Math.cos(angle) * radiusX * wobble, centerY + Math.sin(angle) * radiusY * wobble]);
  }
  return points;
}

function heartPoints(centerX: number, centerY: number, radius: number, random: () => number): Point[] {
  const scale = radius / 16;
  const count = 36;
  const points: Point[] = [];
  for (let index = 0; index < count; index++) {
    const t = (index / count) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    const wobble = 1 + (random() - 0.5) * 0.04;
    points.push([centerX + x * scale * wobble, centerY + (y + 2) * scale * wobble]);
  }
  return points;
}

function starCorners(centerX: number, centerY: number, radius: number, pointCount: number): Point[] {
  const corners: Point[] = [];
  for (let index = 0; index < pointCount * 2; index++) {
    const angle = -Math.PI / 2 + (index * Math.PI) / pointCount;
    const r = index % 2 === 0 ? radius : radius * 0.48;
    corners.push([centerX + Math.cos(angle) * r, centerY + Math.sin(angle) * r]);
  }
  return corners;
}

function pairs(values: number[]): Point[] {
  if (values.length % 2 !== 0) throw new Error(`Point list has an odd number of values: ${values.join(",")}`);
  const points: Point[] = [];
  for (let index = 0; index < values.length; index += 2) points.push([values[index], values[index + 1]]);
  return points;
}

/** SVG path data for a layer, hand-cut with a wobble seeded by `seedKey`. */
export function layerPath(layer: Layer, seedKey: string): string {
  const cached = geometryCache.get(seedKey);
  if (cached !== undefined) return cached;
  const random = seededRandom(seedKey);
  let path: string;
  switch (layer.t) {
    case "rect": {
      const corners = roundedRectCorners(layer.x, layer.y, layer.w, layer.h, layer.r ?? 0);
      const amount = jitterAmount(layer.w, layer.h);
      path = (layer.r ?? 0) > 0.01
        ? linePath(corners.map(([x, y]) => [x + (random() - 0.5) * amount, y + (random() - 0.5) * amount]), true)
        : linePath(subdividePolygon(corners, random, amount), true);
      break;
    }
    case "circle":
      path = smoothClosedPath(ellipsePoints(layer.cx, layer.cy, layer.r, layer.r, random));
      break;
    case "ellipse":
      path = smoothClosedPath(ellipsePoints(layer.cx, layer.cy, layer.rx, layer.ry, random));
      break;
    case "poly": {
      const corners = pairs(layer.pts);
      const xs = corners.map(([x]) => x);
      const ys = corners.map(([, y]) => y);
      const amount = jitterAmount(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      path = linePath(subdividePolygon(corners, random, amount), true);
      break;
    }
    case "heart":
      path = smoothClosedPath(heartPoints(layer.cx, layer.cy, layer.r, random));
      break;
    case "star":
      path = linePath(subdividePolygon(starCorners(layer.cx, layer.cy, layer.r, layer.n ?? 5), random, 0.15), true);
      break;
    case "line":
      path = linePath(pairs(layer.pts), false);
      break;
    case "path":
      path = layer.d;
      break;
  }
  geometryCache.set(seedKey, path);
  return path;
}

/** Centre of a layer's geometry, used as the default pivot for rotation. */
export function layerCenter(layer: Layer): Point {
  switch (layer.t) {
    case "rect":
      return [layer.x + layer.w / 2, layer.y + layer.h / 2];
    case "circle":
    case "ellipse":
    case "heart":
    case "star":
      return [layer.cx, layer.cy];
    case "poly":
    case "line": {
      const points = pairs(layer.pts);
      const sum = points.reduce<Point>((total, [x, y]) => [total[0] + x, total[1] + y], [0, 0]);
      return [sum[0] / points.length, sum[1] / points.length];
    }
    case "path":
      return [0, 0];
  }
}
