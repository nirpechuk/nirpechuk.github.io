export function legacyRoomKey(event: Pick<MessageEvent, "origin" | "source" | "data">, popup: Window): string | null {
  if (event.origin !== "https://nirpechuk.github.io" || event.source !== popup) return null;
  const value = event.data;
  return value?.type === "flats-room-migration" && typeof value.key === "string" && /^[a-f0-9-]{36}\.[a-f0-9]{64}$/i.test(value.key)
    ? value.key
    : null;
}
