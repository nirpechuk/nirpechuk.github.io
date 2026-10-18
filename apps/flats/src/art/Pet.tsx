/** Renders a pet rig with CSS-driven idle, walk, sleep, happy and eat states. */

import type { CSSProperties } from "react";
import { memo } from "react";

import type { Layer, PetKind } from "../game/types";
import { layerCenter, layerPath } from "./paper";
import type { PetSpec } from "./pets";
import { petSpec } from "./pets";

export type PetAction = "idle" | "walk" | "sleep" | "happy" | "eat" | "sit";

const SHADOW = "rgba(12, 6, 16, 0.3)";

function resolve(color: string | undefined, spec: PetSpec): string | undefined {
  if (color === "p" || color === "s" || color === "a") return spec.colors[color];
  return color;
}

function Part({ layers, spec, keyPrefix }: { layers: Layer[]; spec: PetSpec; keyPrefix: string }) {
  return (
    <>
      {layers.map((layer, index) => {
        const path = layerPath(layer, `${spec.kind}:${keyPrefix}:${index}`);
        const isStroke = layer.t === "line" || layer.fill === "none";
        const fill = isStroke ? "none" : resolve(layer.fill, spec);
        const stroke = resolve(layer.stroke, spec);
        const pivot = layer.at ?? layerCenter(layer);
        const transform = layer.rot ? `rotate(${layer.rot} ${pivot[0]} ${pivot[1]})` : undefined;
        return (
          <g key={index} transform={transform}>
            {!layer.flat && (
              <path
                d={path}
                transform="translate(0.6 0.9)"
                fill={isStroke ? "none" : SHADOW}
                stroke={isStroke ? SHADOW : undefined}
                strokeWidth={isStroke ? layer.sw : undefined}
                strokeLinecap="round"
              />
            )}
            <path
              d={path}
              fill={fill}
              stroke={stroke}
              strokeWidth={layer.sw}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={layer.o}
            />
          </g>
        );
      })}
    </>
  );
}

function pivotStyle([x, y]: [number, number]): CSSProperties {
  return { transformBox: "view-box", transformOrigin: `${x}px ${y}px` };
}

export interface PetFigureProps {
  kind: PetKind;
  action: PetAction;
  sleepy?: boolean;
}

function PetFigureInner({ kind, action, sleepy = false }: PetFigureProps) {
  const spec = petSpec(kind);
  const { parts, pivots } = spec;
  return (
    <g className={`pet pet-${kind} is-${action}${sleepy ? " is-sleepy" : ""}`}>
      <ellipse className="pet-shadow" cx="-1" cy="0" rx="15" ry="2.6" fill={SHADOW} />
      <g className="pet-hop">
        <g className="pet-tail" style={pivotStyle(pivots.tail)}>
          <Part layers={parts.tail} spec={spec} keyPrefix="tail" />
        </g>
        <g className="pet-legs pet-legs-back">
          <Part layers={parts.legsBack} spec={spec} keyPrefix="legsBack" />
        </g>
        <g className="pet-legs pet-legs-front">
          <Part layers={parts.legsFront} spec={spec} keyPrefix="legsFront" />
        </g>
        <g className="pet-body" style={pivotStyle([0, 0])}>
          <Part layers={parts.body} spec={spec} keyPrefix="body" />
          <g className="pet-head" style={pivotStyle(pivots.head)}>
            <g className="pet-ears" style={pivotStyle(pivots.ears)}>
              <Part layers={parts.earsBehind} spec={spec} keyPrefix="earsBehind" />
            </g>
            <Part layers={parts.head} spec={spec} keyPrefix="head" />
            <Part layers={parts.earsFront} spec={spec} keyPrefix="earsFront" />
            <g className="pet-eyes-open">
              <Part layers={parts.eyesOpen} spec={spec} keyPrefix="eyesOpen" />
            </g>
            <g className="pet-eyes-closed">
              <Part layers={parts.eyesClosed} spec={spec} keyPrefix="eyesClosed" />
            </g>
            <Part layers={parts.face} spec={spec} keyPrefix="face" />
            <g className="pet-happy-face">
              <Part layers={parts.happy} spec={spec} keyPrefix="happy" />
            </g>
          </g>
        </g>
      </g>
      <g className="pet-zzz" transform={`translate(10 ${spec.top - 2})`}>
        <text className="zzz zzz-1" x="0" y="0">z</text>
        <text className="zzz zzz-2" x="6" y="-6">z</text>
        <text className="zzz zzz-3" x="13" y="-13">Z</text>
      </g>
      <g className="pet-crumbs">
        <circle cx="18" cy="-3" r="1" fill="#d9a066" />
        <circle cx="21" cy="-2" r="0.8" fill="#d9a066" />
        <circle cx="16" cy="-1.5" r="0.7" fill="#d9a066" />
      </g>
    </g>
  );
}

export const PetFigure = memo(PetFigureInner);

/** Standalone pet portrait for onboarding and cards. */
export function PetPortrait({ kind, action = "idle", size = 96 }: { kind: PetKind; action?: PetAction; size?: number }) {
  return (
    <svg className="pet-portrait" width={size} height={size} viewBox="-32 -50 64 56" aria-hidden="true">
      <PetFigure kind={kind} action={action} />
    </svg>
  );
}
