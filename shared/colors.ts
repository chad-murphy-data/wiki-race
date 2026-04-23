export const PLAYER_COLORS = [
  "#ff8906",
  "#f25f4c",
  "#e53170",
  "#3da9fc",
  "#2cb67d",
  "#a786df",
  "#f9bc60",
  "#00b4d8",
  "#e63946",
  "#06d6a0",
  "#ffd166",
  "#8338ec",
];

export function pickColor(usedColors: Set<string>): string {
  for (const c of PLAYER_COLORS) {
    if (!usedColors.has(c)) return c;
  }
  return PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
}
