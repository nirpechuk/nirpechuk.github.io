/** Decorative city weather. It is shared for a calendar day, not a local weather forecast. */
export function streetAtmosphere(day: string, hour: number) {
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  const winter = month === 12 || month <= 2;
  const autumn = month >= 9 && month <= 11;
  return { weather: date % 4 === 1 ? (winter ? "snow" : "rain") : autumn ? "leaves" : "clear", dusk: hour >= 17 && hour < 20 };
}
