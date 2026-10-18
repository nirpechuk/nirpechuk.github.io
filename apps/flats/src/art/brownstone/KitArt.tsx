/** Reviewed, build-time SVG art; never accepts markup from a player or the network. */
import { useId, useMemo } from "react";
import { recolorMaterial } from "./materials";
import assets from "./assets.json";
import type { ItemDef } from "../../game/types";

interface Asset {
  bounds: number[];
  svg: string;
}
const kit: Record<string, Asset[]> = assets;

export function hasKitArt(id: string) {
  return Boolean(kit[id]);
}

export function KitArt({
  id,
  width,
  height,
  stage = 2,
  item,
  paletteIndex = 0,
  wallColor,
}: {
  id: string;
  width: number;
  height: number;
  stage?: number;
  item?: ItemDef;
  paletteIndex?: number;
  wallColor?: string;
}) {
  const prefix = `kit${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const asset = kit[id]?.[Math.min(stage, kit[id].length - 1)];
  const markup = useMemo(() => {
    if (!asset) return "";
    let svg = asset.svg.replaceAll("__ID__", prefix);
    const palette = item?.palettes[paletteIndex % item.palettes.length];
    if (palette) svg = recolorMaterial(svg, id, palette, paletteIndex, wallColor);
    return svg;
  }, [asset, prefix, item, id, paletteIndex, wallColor]);
  if (!asset) return null;
  return (
    <svg
      width={width}
      height={height}
      viewBox={asset.bounds.join(" ")}
      preserveAspectRatio="none"
      overflow="visible"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
