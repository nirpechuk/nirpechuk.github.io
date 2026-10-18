import { useId } from "react";
import parts from "./streetParts.json";
import { FLOOR_HEIGHT } from "../../game/building";

/** Original Brownstone artwork, assembled without stretching its stonework or windows. */
export function StreetArchitecture({ floors, overflow }: { floors: number; overflow: number }) {
  const id = `street-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}-`;
  const extra = (floors - 3) * FLOOR_HEIGHT;
  const art = (svg: string) => ({ __html: svg.replaceAll('id="bs', `id="${id}`).replaceAll("#bs", `#${id}`) });
  return (
    <svg className="street-architecture" width="1440" height={800 + extra} viewBox={`0 0 1440 ${800 + extra}`} fill="none" aria-hidden="true">
      <defs dangerouslySetInnerHTML={art(parts.defs)} />
      <rect x={-overflow} width={1440 + 2 * overflow} height={800 + extra} fill={`url(#${id}Sky)`} />
      <g dangerouslySetInnerHTML={art(parts.sky)} />
      <g transform={`translate(0 ${extra})`}>
        {/* Continue the edge masonry and road across wide laptop viewports. */}
        {[-overflow, 1440].map((x) => (
          <g key={x}>
            <rect x={x} y="280" width={overflow} height="410" fill={`url(#${id}Brick)`} />
            <rect x={x} y="280" width={overflow} height="410" fill={`url(#${id}Bricks)`} />
          </g>
        ))}
        <rect x={-overflow} y="690" width={1440 + 2 * overflow} height="40" fill="#2E2B29" />
        <rect x={-overflow} y="728" width={1440 + 2 * overflow} height="7" fill="#45403A" />
        <rect x={-overflow} y="735" width={1440 + 2 * overflow} height="65" fill={`url(#${id}Street)`} />
        <g dangerouslySetInnerHTML={art(parts.neighbours)} />
      </g>
      <g dangerouslySetInnerHTML={art(parts.facade.replaceAll('height="530"', `height="${530 + extra}"`))} />
      <g dangerouslySetInnerHTML={art(parts.roof)} />
      {Array.from({ length: floors }, (_, floor) => (
        <g key={floor} transform={`translate(0 ${floor * FLOOR_HEIGHT})`} dangerouslySetInnerHTML={art(parts.floor)} />
      ))}
      <g transform={`translate(0 ${extra})`} dangerouslySetInnerHTML={art(parts.ground)} />
    </svg>
  );
}
