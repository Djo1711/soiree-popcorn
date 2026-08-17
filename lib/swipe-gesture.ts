/** §7.2 : la carte suit le doigt, l'inclinaison vaut deltaX / 18°, plafonnée à 15°. */
export const ROTATION_MAX_DEG = 15
const DIVISEUR_ROTATION = 18

/** §7.2 : validé au-delà de 33 % de la largeur de l'écran ou 500 px/s. */
export const SEUIL_DISTANCE_RATIO = 0.33
export const SEUIL_VITESSE_PX_S = 500

export const POSITIONS_PILE = [
  { echelle: 1, decalageY: 0 },
  { echelle: 0.95, decalageY: 10 },
  { echelle: 0.9, decalageY: 20 },
] as const

export function rotationPourDelta(deltaX: number): number {
  const rotation = deltaX / DIVISEUR_ROTATION
  return Math.max(-ROTATION_MAX_DEG, Math.min(ROTATION_MAX_DEG, rotation))
}

export function balayageValide(
  deltaX: number,
  vitesseX: number,
  largeur: number,
): 'aime' | 'rejette' | null {
  const distanceSuffisante = Math.abs(deltaX) > SEUIL_DISTANCE_RATIO * largeur
  const vitesseSuffisante = Math.abs(vitesseX) > SEUIL_VITESSE_PX_S
  if (!distanceSuffisante && !vitesseSuffisante) return null
  // Sur une validation par vitesse à distance quasi nulle, c'est le sens du
  // geste (vitesse) qui décide ; sinon c'est le sens du déplacement.
  const sens = Math.abs(deltaX) > 1 ? deltaX : vitesseX
  return sens > 0 ? 'aime' : 'rejette'
}

export function opaciteVoile(deltaX: number, largeur: number): number {
  const ratio = Math.abs(deltaX) / (SEUIL_DISTANCE_RATIO * largeur)
  return Math.max(0, Math.min(1, ratio))
}
