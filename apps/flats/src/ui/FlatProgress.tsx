import { KitArt } from "../art/brownstone/KitArt";
import { FLAT_STAGES, flatProgress } from "../game/flatProgress";

/** Tiny rooms make the milestones readable before their labels are read. */
function StageRoom({ stage }: { stage: number }) {
  return (
    <svg viewBox="0 0 80 90" aria-hidden="true" className="stage-room">
      <path d="M5 5h70v80H5Z" fill={["#242731", "#393129", "#34443b", "#524033"][stage]} stroke="#a68b64" strokeWidth="1" />
      <path d="M5 5l12 13v47L5 85M75 5L63 18v47l12 20M17 65h46" fill="none" stroke="#c1a576" strokeOpacity=".22" />
      <path d="M5 85l12-20h46l12 20Z" fill="#32251d" />
      <rect x="29" y="23" width="22" height="37" rx="2" fill="#151c31" stroke="#b59c71" strokeOpacity=".5" />
      <path d="M40 24v35m-10-18h20" stroke="#71819e" strokeWidth=".7" />
      <path d="M45 27a4 4 0 1 0 3 6 4 4 0 0 1-3-6" fill="#d6d8cc" />
      <path d="M30 61h20l10 22H22Z" fill="#9cb4e4" opacity=".1" />
      {stage === 0 && (
        <g transform="translate(12 62)">
          <KitArt id="moving-boxes" width={25} height={20} />
        </g>
      )}
      {stage > 0 && (
        <>
          <circle cx="62" cy="49" r="15" fill="#efb85e" opacity=".13" />
          <g transform="translate(55 44)">
            <KitArt id="floor-lamp" width={14} height={35} />
          </g>
        </>
      )}
      {stage === 1 && (
        <g transform="translate(14 52)">
          <KitArt id="armchair" width={26} height={29} />
        </g>
      )}
      {stage >= 2 && (
        <>
          <g transform="translate(21 59)">
            <KitArt id="comfy-sofa" width={34} height={20} />
          </g>
          <g transform="translate(8 48)">
            <KitArt id="monstera" width={17} height={32} />
          </g>
        </>
      )}
      {stage === 3 && (
        <>
          <g transform="translate(22 19)">
            <KitArt id="floral-curtains" width={35} height={45} />
          </g>
          <g transform="translate(7 12)">
            <KitArt id="fairy-lights" width={66} height={9} />
          </g>
          <circle cx="61" cy="24" r="7" fill="#f3d18c" opacity=".7" />
        </>
      )}
    </svg>
  );
}

export function FlatProgress({ placed }: { placed: number }) {
  const progress = flatProgress(placed);
  const nextText = progress.next ? `${progress.remaining} to ${progress.next.name}` : "Every corner is home";
  return (
    <section className="flat-progress" aria-label="Room progression">
      <div className="flat-stages" aria-hidden="true">
        {FLAT_STAGES.map((stage, index) => (
          <div
            key={stage.name}
            className={`flat-stage${index <= progress.index ? " is-reached" : ""}${index === progress.index ? " is-current" : ""}`}
          >
            <StageRoom stage={index} />
            <span>{stage.name}</span>
          </div>
        ))}
      </div>
      <div
        className="flat-progress-track"
        role="progressbar"
        aria-label="Room progress"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.count}
        aria-valuetext={`${progress.stage.name}. ${progress.count} things placed. ${nextText}.`}
      >
        <span className="flat-progress-fill" style={{ width: `${progress.fraction * 100}%` }} />
        {FLAT_STAGES.map((stage, index) => (
          <i
            key={stage.name}
            className={index <= progress.index ? "is-reached" : ""}
            style={{ left: `${(index / (FLAT_STAGES.length - 1)) * 100}%` }}
          />
        ))}
      </div>
      <div className="flat-progress-caption">
        <span>
          {progress.count} {progress.count === 1 ? "thing" : "things"} placed
        </span>
        <span>{nextText}</span>
      </div>
    </section>
  );
}
