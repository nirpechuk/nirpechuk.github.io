import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildingLayout, streetViewport, windowPosition } from "./building";
import { StreetArchitecture } from "../art/brownstone/StreetArchitecture";

describe("a growing brownstone", () => {
  it("adds a storey only when both flats on the previous floor are occupied", () => {
    for (const [residents, floors] of [
      [0, 3],
      [3, 3],
      [6, 3],
      [7, 4],
      [8, 4],
      [9, 5],
      [30, 15],
    ]) {
      const layout = buildingLayout(residents);
      expect(layout.floors).toBe(floors);
      expect(layout.capacity).toBeGreaterThanOrEqual(residents);
      const positions = Array.from({ length: residents }, (_, i) => windowPosition(i, floors));
      expect(new Set(positions.map((p) => `${p.x},${p.y}`)).size).toBe(residents);
      for (const position of positions) expect(position.y).toBeGreaterThanOrEqual(205);
    }
  });
  it("keeps every existing resident at the same height above the street", () => {
    for (let i = 0; i < 6; i++) {
      const old = windowPosition(i, 3);
      const grown = windowPosition(i, 15);
      expect(grown.x).toBe(old.x);
      expect(buildingLayout(30).height - grown.y).toBe(buildingLayout(6).height - old.y);
    }
  });
  it("fits four floors on a laptop and scrolls taller buildings without tiny windows", () => {
    for (const [width, height] of [
      [1512, 826],
      [1280, 720],
    ]) {
      const small = streetViewport(width, height, 4);
      expect(small.contentHeight).toBe(height);
      const tall = streetViewport(width, height, 15);
      expect(tall.scale * 110).toBeGreaterThan(80);
      expect(tall.contentHeight).toBeGreaterThan(height);
    }
    for (const width of [320, 390, 430]) {
      const mobile = streetViewport(width, 844, 15);
      expect(mobile.scale * 440).toBeLessThan(width);
      expect(mobile.top).toBeGreaterThanOrEqual(72);
      expect(mobile.contentHeight).toBeGreaterThan(844);
    }
  });
  it("renders one doorway per building with closed references and unique IDs", () => {
    const html = renderToStaticMarkup(
      <>
        <StreetArchitecture floors={3} overflow={20} />
        <StreetArchitecture floors={15} overflow={20} />
      </>
    );
    expect(html.match(/THE FLATS/g)).toHaveLength(2);
    expect(html).not.toMatch(/NaN|Infinity|<script|<foreignObject/);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of html.matchAll(/url\(#([^\)]+)\)/g)) expect(ids).toContain(m[1]);
  });
});
