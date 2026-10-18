/** Two flats per storey, with the original three-storey facade as the starting size. */
export const FLOOR_HEIGHT = 145;
export function buildingLayout(residents: number) {
  const floors = Math.max(3, Math.ceil(residents / 2));
  const extraHeight = (floors - 3) * FLOOR_HEIGHT;
  return { floors, extraHeight, height: 800 + extraHeight, capacity: floors * 2 };
}
export function windowPosition(index: number, floors: number) {
  return { x: 560 + (index % 2) * 210, y: 205 + (floors - 1 - Math.floor(index / 2)) * FLOOR_HEIGHT };
}
export function streetViewport(width: number, height: number, floors: number) {
  const worldHeight = 800 + (floors - 3) * FLOOR_HEIGHT;
  const mobile = width < 768;
  const headroom = mobile ? 72 : 0;
  const footroom = mobile ? 96 : 0;
  // Fit smaller buildings; stop zooming out before the windows become tiny.
  const scale = mobile ? Math.min((width - 24) / 460, 1) : Math.max(0.76, Math.min(height / worldHeight, width / 1000));
  const contentHeight = Math.max(height, worldHeight * scale + headroom + footroom);
  const top = headroom + Math.max(0, (height - headroom - footroom - worldHeight * scale) / 2);
  return { scale, contentHeight, top, overflow: Math.max(0, (width / scale - 1440) / 2) + 2 };
}
