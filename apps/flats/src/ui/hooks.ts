/** Small React hooks shared across screens. */

import { useEffect, useState } from "react";

/** Current hour (0-23), refreshed every minute. `?hour=21` in the URL pins it, for previews. */
export function useHour(): number {
  const pinned = new URLSearchParams(window.location.search).get("hour");
  const [hour, setHour] = useState(() => (pinned !== null ? Number(pinned) : new Date().getHours()));
  useEffect(() => {
    if (pinned !== null) return;
    const interval = setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => clearInterval(interval);
  }, [pinned]);
  return hour;
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

/** A boolean flag persisted in localStorage (first-time hints, recap seen, and so on). */
export function usePersistentFlag(key: string): [boolean, () => void] {
  const storageKey = `flats:flag:${key}`;
  const [value, setValue] = useState(() => localStorage.getItem(storageKey) === "1");
  useEffect(() => setValue(localStorage.getItem(storageKey) === "1"), [storageKey]);
  const set = () => {
    localStorage.setItem(storageKey, "1");
    setValue(true);
  };
  return [value, set];
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
