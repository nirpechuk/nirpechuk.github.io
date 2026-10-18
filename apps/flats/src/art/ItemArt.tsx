/** Renders a catalogue item from its JSON layers in the shared illustrated style. */

import type { CSSProperties } from "react";
import { memo } from "react";

import type { ItemDef, Layer, Palette } from "../game/types";
import { layerCenter, layerPath } from "./paper";

/** A soft contact shadow under every layer, giving furniture depth in the dim rooms. */
const LAYER_SHADOW_OFFSET = "translate(0.5 0.9)";
const LAYER_SHADOW_COLOR = "rgba(12, 6, 16, 0.28)";

export type ItemPass = "body" | "glow" | "all";

function resolveColor(color: string | undefined, palette: Palette): string | undefined {
  if (color === undefined) return undefined;
  if (color === "p" || color === "s" || color === "a") return palette[color];
  return color;
}

function visibleAtStage(layer: Layer, stage: number): boolean {
  if (layer.minStage !== undefined && stage < layer.minStage) return false;
  if (layer.maxStage !== undefined && stage >= layer.maxStage) return false;
  return true;
}

function animationStyle(layer: Layer): CSSProperties | undefined {
  if (!layer.anim || !layer.at) return undefined;
  return { transformBox: "view-box", transformOrigin: `${layer.at[0]}px ${layer.at[1]}px` };
}

interface LayerProps {
  layer: Layer;
  seedKey: string;
  palette: Palette;
  glowStrength: number;
}

function PaperLayer({ layer, seedKey, palette, glowStrength }: LayerProps) {
  const path = layerPath(layer, seedKey);
  const isStrokeOnly = layer.t === "line" || layer.fill === "none" || (layer.t === "path" && !layer.fill);
  const fill = isStrokeOnly ? "none" : resolveColor(layer.fill, palette) ?? palette.p;
  const stroke = resolveColor(layer.stroke, palette);
  const strokeWidth = layer.sw ?? (stroke ? 1 : undefined);
  const baseOpacity = layer.o ?? 1;
  const opacity = layer.glow ? baseOpacity * glowStrength : baseOpacity;

  let rotation: string | undefined;
  if (layer.rot) {
    const [pivotX, pivotY] = layer.at ?? layerCenter(layer);
    rotation = `rotate(${layer.rot} ${pivotX} ${pivotY})`;
  }

  const shape = (
    <g transform={rotation}>
      {!layer.flat && !layer.glow && (
        <path
          d={path}
          transform={LAYER_SHADOW_OFFSET}
          fill={isStrokeOnly ? "none" : LAYER_SHADOW_COLOR}
          stroke={isStrokeOnly ? LAYER_SHADOW_COLOR : undefined}
          strokeWidth={isStrokeOnly ? strokeWidth : undefined}
          strokeLinecap="round"
        />
      )}
      <path
        d={path}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={opacity}
        className={layer.glow ? "glow-layer" : undefined}
      />
    </g>
  );

  if (!layer.anim) return shape;
  return (
    <g className={`anim anim-${layer.anim}${layer.at ? " anim-pivot" : ""}`} style={animationStyle(layer)}>
      {shape}
    </g>
  );
}

export interface ItemArtProps {
  item: ItemDef;
  paletteIndex: number;
  stage?: number;
  /** 0..1, how strongly glow layers show (lamps glow warmer in the evening). */
  glowStrength?: number;
  pass?: ItemPass;
}

function ItemArtInner({ item, paletteIndex, stage = 0, glowStrength = 0.6, pass = "all" }: ItemArtProps) {
  const palette = item.palettes[paletteIndex % item.palettes.length];
  return (
    <>
      {item.layers.map((layer, index) => {
        if (!visibleAtStage(layer, stage)) return null;
        if (pass === "body" && layer.glow) return null;
        if (pass === "glow" && !layer.glow) return null;
        return (
          <PaperLayer
            key={index}
            layer={layer}
            seedKey={`${item.id}:${index}`}
            palette={palette}
            glowStrength={glowStrength}
          />
        );
      })}
    </>
  );
}

export const ItemArt = memo(ItemArtInner);

/** A standalone square SVG thumbnail of an item, for cards and the inventory. */
export function ItemThumb({ item, paletteIndex = 0, stage = 2, size = 64 }: {
  item: ItemDef;
  paletteIndex?: number;
  stage?: number;
  size?: number;
}) {
  const padding = 6;
  const span = Math.max(item.w, item.h) + padding * 2;
  const offsetX = (span - item.w) / 2;
  const offsetY = (span - item.h) / 2;
  return (
    <svg
      className="item-thumb"
      width={size}
      height={size}
      viewBox={`0 0 ${span} ${span}`}
      aria-hidden="true"
    >
      <g transform={`translate(${offsetX} ${offsetY})`}>
        <ItemArt item={item} paletteIndex={paletteIndex} stage={stage} pass="body" />
      </g>
    </svg>
  );
}
