/** Time-of-day lighting: sky colours outside the window, room dimming and lamp glow. */

export type DayPhase = "dawn" | "day" | "dusk" | "night";

export interface Lighting {
  phase: DayPhase;
  skyTop: string;
  skyBottom: string;
  /** Opacity of the dusky overlay over the whole room. */
  dim: number;
  /** 0..1 strength of lamp glows; warmer in the evening. */
  glow: number;
}

/** Keep the evening warm while leaving furniture and pets readable across the room. */
export function lightingForHour(hour: number): Lighting {
  if (hour >= 5 && hour < 8) return { phase: "dawn", skyTop: "#b98f98", skyBottom: "#f0c9a4", dim: 0.12, glow: 0.7 };
  if (hour >= 8 && hour < 17) return { phase: "day", skyTop: "#8fa6b8", skyBottom: "#e6cfae", dim: 0.08, glow: 0.55 };
  if (hour >= 17 && hour < 20) return { phase: "dusk", skyTop: "#4a3a63", skyBottom: "#e08a64", dim: 0.18, glow: 0.9 };
  return { phase: "night", skyTop: "#0f1430", skyBottom: "#27305a", dim: 0.2, glow: 1 };
}
