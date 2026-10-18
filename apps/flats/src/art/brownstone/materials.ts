/** Only the chosen material changes colour. Brass hardware, foliage and glass stay intact. */
import type { Palette } from "../../game/types";

const MATERIALS: Record<string, string> = {
  "yarn-basket": "Rattan",
  fireplace: "Tiles",
  "comfy-sofa": "Leather",
  armchair: "Mustard",
  "floor-cushion": "OxSide|OxVel",
  "canopy-bed": "Midnight",
  "egg-chair": "Rattan",
  "wooden-stool": "Oak",
  "wingback-chair": "Teal",
  "peacock-chair": "Rattan",
  "chaise-longue": "OchreVel",
  "crate-shelf": "Pine",
  "upright-piano": "Lacquer",
  "paper-lantern": "Paper",
  "arc-lamp": "Brass",
  "globe-chandelier": "Brass",
  "woven-rug": "Jute",
  "mountain-poster": "Sky",
  "gallery-trio": "Brass",
  "bar-cart": "Brass",
  telescope: "BrassTube",
  "wall-clock": "Brass",
  "scalloped-mirror": "Scallop",
  "gilt-mirror": "Brass",
  "plain-curtains": "Linen",
  "floral-curtains": "Floral",
  "velvet-drapes": "Velvet",
  "roller-blind": "Blind",
  "wicker-pendant": "Rattan",
  "pierced-lantern": "Brass",
  "succulent-pot": "Terra",
  monstera: "Cream",
  "hanging-pothos": "Cream",
  "blossom-vase": "Celadon",
  "dried-roses": "Amber",
  "eucalyptus-garland": "Euc",
};
const SOLIDS: Record<string, string[]> = {
  "snail-terrarium": ["#B88A5A", "#8A6038", "#6A4428"],
  "pleated-pendant": ["#E9D3A8", "#C9A87A"],
  "comfy-sofa": ["#6E3418", "#4E2410", "#D08A50", "#8C4422", "#A2582C", "#5A2A12", "#B56A38", "#C88050"],
  armchair: ["#6E4E16", "#A87A28", "#8A6220", "#D8A848", "#B0802C", "#C8983A"],
  "floor-lamp": ["#EFE3CA", "#D9C8A4"],
  "candle-cluster": ["#F7EEDC", "#D8C6A4"],
  "fairy-lights": ["#FFD891"],
  "lava-lamp": ["#6A1A2E", "#FF6A30", "#FFB04A"],
  "neon-moon": ["#FF6F9A", "#FFD3E0"],
  "striped-rug": ["#8A3A24", "#1F2D4A", "#D9A54A"],
  "postcard-string": ["#C98A6A", "#D8B888"],
  "woven-wall-hanging": ["#C08A3E", "#A8583A"],
  "quilt-bunting": ["#C08A3E", "#7A9A6A", "#C98A6A"],
  "walnut-shutters": ["#6A4528", "#2E1B0F"],
  "cafe-curtain": ["#D8CDB8", "#A89C84"],
  "artists-easel": ["#6A4A30", "#8A6A48", "#7A5A3C"],
  "wall-sconce": ["#F2E3C4"],
};
const originalPalette: Record<string, number> = { "comfy-sofa": 3, armchair: 3 };

function rgb(hex: string) {
  return [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
}
function shade(source: string, base: string) {
  const channels = rgb(source);
  const luminance = (channels[0] * 0.3 + channels[1] * 0.59 + channels[2] * 0.11) / 255;
  const factor = 0.45 + luminance * 1.05;
  return (
    "#" +
    rgb(base)
      .map((c) =>
        Math.round(Math.min(255, c * factor))
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}
export function recolorMaterial(svg: string, id: string, palette: Palette, index: number, wallColor?: string): string {
  const original = index === (originalPalette[id] ?? 0);
  // Metal and black hardware retain their finish; only fabric, wood and paint take the room's hue.
  const metal = /^(arc-lamp|globe-chandelier|gallery-trio|bar-cart|telescope|wall-clock|gilt-mirror|pierced-lantern)$/.test(id);
  if (original && (!wallColor || metal)) return svg;
  const material = MATERIALS[id] ?? "Walnut";
  const colors = new Set((SOLIDS[id] ?? []).map((c) => c.toUpperCase()));
  for (const gradient of svg.matchAll(
    /<(?:(?:linear|radial)Gradient|pattern)\b[^>]*id="([^"]+)"[^>]*>[\s\S]*?<\/(?:(?:linear|radial)Gradient|pattern)>/g
  )) {
    if (new RegExp(material).test(gradient[1])) {
      for (const color of gradient[0].match(/#[0-9a-f]{6}\b/gi) ?? []) colors.add(color.toUpperCase());
    }
  }
  return svg.replace(/#[0-9a-f]{6}\b/gi, (color) => {
    if (!colors.has(color.toUpperCase())) return color;
    const materialColor = original ? color : shade(color, palette.p);
    if (!wallColor || metal) return materialColor;
    const wall = rgb(wallColor);
    return (
      "#" +
      rgb(materialColor)
        .map((c, i) =>
          Math.round(c * 0.94 + wall[i] * 0.06)
            .toString(16)
            .padStart(2, "0")
        )
        .join("")
    );
  });
}
