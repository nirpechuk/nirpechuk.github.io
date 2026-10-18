import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CATALOG, itemById } from "../../game/catalog";
import { emptyLayout, roomSlots, windowOffsetFor, SLOTS, WINDOW_FRAME, ROOM_WIDTH, projectWallPoint, itemScale } from "../../game/room";
import type { Player } from "../../game/types";
import { roomAtmosphere, placedLight } from "./lightModel";
import { recolorMaterial } from "./materials";
import assets from "./assets.json";
import { RoomScene } from "../RoomScene";
import { lightingForHour } from "../lighting";
import { buildDemoNeighbours } from "../../backend/demo";
const player: Player = {
  id: "test",
  name: "Test",
  petKind: "cat",
  petName: "Miso",
  createdDay: "2026-10-01",
  workouts: [],
  unlocks: [],
  layout: emptyLayout(),
};

describe("Brownstone atmosphere", () => {
  it("warms smoothly as items are placed and softens through quiet weeks without changing possessions", () => {
    const furnished = {
      ...player,
      layout: { ...player.layout, slots: Object.fromEntries(SLOTS.map((s) => [s.id, { itemId: "candle-cluster", palette: 0, flip: false }])) },
    };
    const before = structuredClone(furnished);
    expect(roomAtmosphere(player, "2026-10-01").darkness).toBe(0.66);
    expect(roomAtmosphere(furnished, "2026-10-01").darkness).toBeCloseTo(0.55);
    expect(roomAtmosphere(furnished, "2026-10-01").coolTint).toBe(0);
    expect(roomAtmosphere(furnished, "2026-10-08").strength).toBe(0.7);
    expect(roomAtmosphere(furnished, "2026-10-22").strength).toBe(0.45);
    expect(roomAtmosphere({ ...furnished, workouts: [{ day: "2026-10-22" }] }, "2026-10-22").strength).toBe(1);
    expect(furnished).toEqual(before);
  });
  it("fades floor moonlight through the cozy stages and keeps Homey rooms free of it, even after quiet weeks", () => {
    const at = (count: number) => ({
      ...player,
      layout: {
        ...player.layout,
        slots: Object.fromEntries(SLOTS.slice(0, count).map((slot) => [slot.id, { itemId: "candle-cluster", palette: 0, flip: false }])),
      },
    });
    const levels = [0, 6, 14, 20].map((count) => roomAtmosphere(at(count), "2026-10-01").moonlight);
    expect(levels[0]).toBe(1);
    expect(levels[1]).toBeLessThan(levels[0]);
    expect(levels[2]).toBeLessThan(levels[1]);
    expect(levels[3]).toBe(0);
    expect(roomAtmosphere(at(20), "2026-11-01").moonlight).toBe(0);
  });

  it("layers early moonlight over rugs but behind furniture and pets, and omits it at Homey", () => {
    const furnished = buildDemoNeighbours("2026-10-18")[0];
    const render = (p: Player) =>
      renderToStaticMarkup(<RoomScene player={p} variant="mini" lighting={lightingForHour(21)} mood="sleepy" reducedMotion />);
    const html = render(furnished);
    const moon = html.indexOf('class="room-moonlight"');
    expect(moon).toBeGreaterThan(html.indexOf('data-item="striped-rug"'));
    expect(moon).toBeLessThan(html.indexOf('data-item="comfy-sofa"'));
    expect(moon).toBeLessThan(html.indexOf('class="pet-body"'));
    expect(html).toContain("-moon-shadows");
    const full = structuredClone(furnished);
    const used = new Set(Object.values(full.layout.slots).map((p) => p.itemId));
    for (const slot of SLOTS) {
      if (full.layout.slots[slot.id]) continue;
      const item = CATALOG.items.find((item) => !used.has(item.id) && item.zones.includes(slot.zone) && item.size <= slot.capacity)!;
      used.add(item.id);
      full.layout.slots[slot.id] = { itemId: item.id, palette: 0, flip: false };
    }
    expect(render(full)).not.toContain('class="room-moonlight"');
  });

  it("projects emitters with the furniture, including flipped side-wall sconces", () => {
    const item = { ...itemById("wall-sconce"), light: { ...itemById("wall-sconce").light!, x: 0.2 } };
    const slot = roomSlots("test").find((s) => s.id === "sideWallL")!;
    const scale = itemScale(item, slot);
    for (const flip of [true, false]) {
      const light = placedLight(item, slot, flip, 0.7)!;
      const position = projectWallPoint(slot, (0.2 - 0.5) * item.w * scale * (flip ? -1 : 1), 0);
      expect(light.x).toBeCloseTo(position.x);
      expect(light.y).toBeCloseTo(position.y);
      expect(light.strength).toBe(0.7);
      expect(light.radius).toBeGreaterThan(0);
    }
  });
  it("keeps saved slot identities and adapts sill/window anchors for all three room types", () => {
    const offsets = new Set<number>();
    for (let i = 0; i < 60; i++) {
      const slots = roomSlots(`resident-${i}`);
      offsets.add(windowOffsetFor(`resident-${i}`));
      expect(slots.map((s) => s.id)).toEqual(SLOTS.map((s) => s.id));
      const window = slots.find((s) => s.zone === "window")!,
        sill = slots.find((s) => s.zone === "sill")!;
      expect(window.x).toBe(sill.x);
      expect(window.x - WINDOW_FRAME.width / 2).toBeGreaterThan(0);
      expect(window.x + WINDOW_FRAME.width / 2).toBeLessThan(ROOM_WIDTH);
    }
    expect([...offsets].sort()).toEqual([-54, 0, 54]);
  });
});

describe("Brownstone artwork and migration", () => {
  it("has closed, namespaced SVG references and no executable or remote content", () => {
    for (const [id, stages] of Object.entries(assets))
      for (const asset of stages) {
        expect(asset.svg, id).not.toMatch(/<script|<foreignObject|on\w+=|https?:\/\//i);
        const defs = new Set([...asset.svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
        for (const m of asset.svg.matchAll(/(?:url\(#|href="#)([\w-]+)/g)) expect(defs.has(m[1]), `${id}: ${m[1]}`).toBe(true);
        expect(asset.bounds.every(Number.isFinite), id).toBe(true);
      }
    for (const item of CATALOG.items) expect(item.layers.length || item.id in assets, item.id).toBeTruthy();
  });
  it("gives every alternative palette a real material change", () => {
    for (const item of CATALOG.items) {
      const art = (assets as Record<string, { svg: string }[]>)[item.id]?.[0]?.svg;
      if (!art) continue;
      const original = recolorMaterial(art, item.id, item.palettes[0], 0);
      for (let i = 1; i < item.palettes.length; i++)
        expect.soft(recolorMaterial(art, item.id, item.palettes[i], i), `${item.id} ${i}`).not.toBe(original);
    }
  });
  it("keeps the server catalogue in exactly the client draw order, with identical gameplay metadata", () => {
    const sql = readFileSync(new URL("../../../supabase/migrations/003_brownstone_catalog.sql", import.meta.url), "utf8");
    const rows = sql.split("$catalog$")[1].split("\n");
    expect(rows.length).toBe(CATALOG.items.length + CATALOG.surfaces.length);
    for (const [index, entry] of [...CATALOG.items, ...CATALOG.surfaces].entries()) {
      const v = rows[index].split("|");
      expect(v[0]).toBe(entry.id);
      expect(+v[1]).toBe(entry.tier);
      expect(v[2]).toBe(entry.rarity);
      if ("palettes" in entry) {
        expect(+v[6]).toBe(entry.palettes.length);
        expect(v[4].split(",")).toEqual(entry.zones);
        expect(+v[5]).toBe(entry.size);
      } else expect(v[3]).toBe(entry.kind);
    }
  });
  it("renders empty and furnished rooms without invalid coordinates or colliding SVG IDs", () => {
    for (const p of [player, ...buildDemoNeighbours("2026-10-17")]) {
      const html = renderToStaticMarkup(
        <>
          <RoomScene player={p} variant="mini" lighting={lightingForHour(21)} mood="sleepy" reducedMotion />
          <RoomScene player={p} variant="mini" lighting={lightingForHour(21)} mood="perky" reducedMotion />
        </>
      );
      expect(html).not.toMatch(/NaN|Infinity|undefined/);
      expect(html.match(/class="pet-mouth"/g)).toHaveLength(2);
      const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
