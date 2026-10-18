/** Renders a catalogue item from its JSON layers in the shared illustrated style. */

import type { CSSProperties } from "react";
import { memo, useId } from "react";

import type { ItemDef, Layer, Palette } from "../game/types";
import { layerCenter, layerPath } from "./paper";
import { OBJECT_REACTIONS } from "./interactions";

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
  glowFill?: string;
}

function PaperLayer({ layer, seedKey, palette, glowStrength, glowFill }: LayerProps) {
  const path = layerPath(layer, seedKey);
  const isStrokeOnly = layer.t === "line" || layer.fill === "none" || (layer.t === "path" && !layer.fill);
  const fill = isStrokeOnly ? "none" : (resolveColor(layer.fill, palette) ?? palette.p);
  const stroke = resolveColor(layer.stroke, palette);
  const strokeWidth = layer.sw ?? (stroke ? 1 : undefined);
  const baseOpacity = layer.o ?? 1;
  const opacity = layer.glow ? baseOpacity * glowStrength : baseOpacity;

  let rotation: string | undefined;
  if (layer.rot) {
    const [pivotX, pivotY] = layer.at ?? layerCenter(layer);
    rotation = `rotate(${layer.rot} ${pivotX} ${pivotY})`;
  }

  const [glowX, glowY] = layerCenter(layer);
  const shape = (
    <g transform={rotation} opacity={layer.glow ? opacity : undefined}>
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
        fill={layer.glow ? glowFill : fill}
        transform={layer.glow ? `translate(${glowX} ${glowY}) scale(1.65) translate(${-glowX} ${-glowY})` : undefined}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={layer.glow ? undefined : opacity}
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
  /** Changes on each tap, so a repeated tap starts the response again. */
  reactionKey?: number;
}

function ItemArtInner({ item, paletteIndex, stage = 0, glowStrength = 0.6, pass = "all", reactionKey = 0 }: ItemArtProps) {
  const palette = item.palettes[paletteIndex % item.palettes.length];
  const glowId = useId();
  return (
    <>
      {pass !== "body" && (
        <defs>
          {item.layers.map(
            (layer, index) =>
              layer.glow && (
                <radialGradient key={index} id={`${glowId}-${index}`}>
                  <stop offset="0" stopColor={resolveColor(layer.fill, palette) ?? palette.p} stopOpacity="0.78" />
                  <stop offset="0.45" stopColor={resolveColor(layer.fill, palette) ?? palette.p} stopOpacity="0.336" />
                  <stop offset="1" stopColor={resolveColor(layer.fill, palette) ?? palette.p} stopOpacity="0" />
                </radialGradient>
              )
          )}
        </defs>
      )}
      {item.layers.map((layer, index) => {
        if (!visibleAtStage(layer, stage)) return null;
        if (pass === "body" && layer.glow) return null;
        if (pass === "glow" && !layer.glow) return null;
        const reaction = reactionKey ? OBJECT_REACTIONS[item.id]?.find((part) => part.layers.includes(index)) : undefined;
        return (
          <g
            key={`${index}:${reaction ? reactionKey : 0}`}
            className={reaction ? `item-reaction reaction-${reaction.effect}` : undefined}
            data-layer={index}
            style={
              reaction
                ? {
                    transformBox: reaction.origin ? "view-box" : "fill-box",
                    transformOrigin: reaction.origin ? `${reaction.origin[0]}px ${reaction.origin[1]}px` : "50% 100%",
                    animationDelay: `${reaction.delay}s`,
                  }
                : undefined
            }
          >
            <PaperLayer
              layer={layer}
              seedKey={`${item.id}:${index}`}
              palette={palette}
              glowStrength={glowStrength}
              glowFill={`url(#${glowId}-${index})`}
            />
          </g>
        );
      })}
    </>
  );
}

export const ItemArt = memo(ItemArtInner);

/** A standalone square SVG thumbnail of an item, for cards and the inventory. */
export function ItemThumb({ item, paletteIndex = 0, stage = 2, size = 64 }: { item: ItemDef; paletteIndex?: number; stage?: number; size?: number }) {
  const padding = 6;
  const span = Math.max(item.w, item.h) + padding * 2;
  const offsetX = (span - item.w) / 2;
  const offsetY = (span - item.h) / 2;
  return (
    <svg className="item-thumb" width={size} height={size} viewBox={`0 0 ${span} ${span}`} aria-hidden="true">
      <g transform={`translate(${offsetX} ${offsetY})`}>
        <ItemArt item={item} paletteIndex={paletteIndex} stage={stage} pass="body" />
      </g>
    </svg>
  );
}
