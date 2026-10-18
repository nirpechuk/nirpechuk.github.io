/** Small React hooks shared across screens. */

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Brownstone is a night-time world; the hour override is only for art previews. */
export function useHour(): number {
  const pinned = new URLSearchParams(window.location.search).get("hour");
  return pinned !== null && Number.isFinite(Number(pinned)) ? Math.max(0, Math.min(23, Number(pinned))) : 21;
}

export function useReducedMotion(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setReduced(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export function readNumber(key: string, fallback: number): number {
  const raw = localStorage.getItem(`flats:${key}`);
  return raw === null ? fallback : Number(raw);
}

export function writeValue(key: string, value: string | number): void {
  localStorage.setItem(`flats:${key}`, String(value));
}

export function readString(key: string): string | null {
  return localStorage.getItem(`flats:${key}`);
}

/** Native modal isolation traps focus and makes the street/room behind it inert. */
export function useModalDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return ref;
}
