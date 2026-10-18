/** Brownstone companions, with the same movement and interaction behaviour as the room. */
import { memo } from "react";
import type { PetKind } from "../game/types";
import { KitArt } from "./brownstone/KitArt";
export type PetAction = "idle" | "walk" | "sleep" | "happy" | "eat" | "sit";
export interface PetFigureProps {
  kind: PetKind;
  action: PetAction;
  sleepy?: boolean;
}
function PetFigureInner({ kind, action, sleepy = false }: PetFigureProps) {
  return (
    <g className={`pet pet-${kind} is-${action}${sleepy ? " is-sleepy" : ""}`}>
      <ellipse className="pet-shadow" cx="0" cy="0" rx="20" ry="3" fill="#080504" opacity=".35" />
      <g className="pet-hop">
        <g transform="translate(-28 -48)">
          <g className="pet-body">
            <KitArt id={`pet-${kind}${action === "sleep" ? "-sleep" : ""}`} width={56} height={50} />
            <circle className="pet-mouth" cx={kind === "duck" ? 43 : 30} cy={action === "sleep" ? 36 : 28} r="1" fill="transparent" />
          </g>
        </g>
      </g>
      <g className="pet-zzz" transform="translate(10 -38)">
        <text className="zzz zzz-1">z</text>
        <text className="zzz zzz-2" x="6" y="-6">
          z
        </text>
        <text className="zzz zzz-3" x="13" y="-13">
          Z
        </text>
      </g>
      <g className="pet-crumbs">
        <circle cx="18" cy="-3" r="1" fill="#d9a066" />
        <circle cx="21" cy="-2" r=".8" fill="#d9a066" />
      </g>
    </g>
  );
}
export const PetFigure = memo(PetFigureInner);
export function PetPortrait({ kind, action = "idle", size = 96 }: { kind: PetKind; action?: PetAction; size?: number }) {
  return (
    <svg className="pet-portrait" width={size} height={size} viewBox="-32 -52 64 58" aria-hidden="true">
      <PetFigure kind={kind} action={action} />
    </svg>
  );
}
