export const DUREE_ROULETTE_MS = 2200

export function easeRoulette(t: number): number {
  const clamped = Math.max(0, Math.min(1, t))
  return 1 - (1 - clamped) ** 3
}
