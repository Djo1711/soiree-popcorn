import { describe, expect, it } from 'vitest'
import {
  POSITIONS_PILE,
  balayageValide,
  opaciteVoile,
  rotationPourDelta,
} from '@/lib/swipe-gesture'

describe('rotationPourDelta', () => {
  it('vaut deltaX / 18 dans la zone non plafonnée', () => {
    expect(rotationPourDelta(90)).toBeCloseTo(5)
    expect(rotationPourDelta(-90)).toBeCloseTo(-5)
  })

  it('est plafonnée à 15°', () => {
    expect(rotationPourDelta(1000)).toBe(15)
    expect(rotationPourDelta(-1000)).toBe(-15)
  })

  it('vaut 0 sans déplacement', () => {
    expect(rotationPourDelta(0)).toBe(0)
  })
})

describe('balayageValide', () => {
  const LARGEUR = 360

  it('valide au-delà de 33 % de la largeur, à vitesse nulle', () => {
    expect(balayageValide(0.34 * LARGEUR, 0, LARGEUR)) .toBe('aime')
    expect(balayageValide(-0.34 * LARGEUR, 0, LARGEUR)).toBe('rejette')
  })

  it('ne valide pas en deçà de 33 % à vitesse nulle', () => {
    expect(balayageValide(0.2 * LARGEUR, 0, LARGEUR)).toBeNull()
  })

  it('valide au-delà de 500 px/s même sur une courte distance', () => {
    expect(balayageValide(10, 600, LARGEUR)).toBe('aime')
    expect(balayageValide(-10, -600, LARGEUR)).toBe('rejette')
  })

  it('rejette (au sens : renvoie « rejette ») quand deltaX est négatif', () => {
    expect(balayageValide(-0.5 * LARGEUR, 0, LARGEUR)).toBe('rejette')
  })
})

describe('opaciteVoile', () => {
  const LARGEUR = 360

  it('vaut 0 sans déplacement', () => {
    expect(opaciteVoile(0, LARGEUR)).toBe(0)
  })

  it('atteint 1 pile au seuil de validation', () => {
    expect(opaciteVoile(0.33 * LARGEUR, LARGEUR)).toBeCloseTo(1)
  })

  it('reste plafonnée à 1 au-delà du seuil', () => {
    expect(opaciteVoile(LARGEUR, LARGEUR)).toBe(1)
  })

  it('est symétrique en valeur absolue', () => {
    expect(opaciteVoile(-0.2 * LARGEUR, LARGEUR)).toBeCloseTo(opaciteVoile(0.2 * LARGEUR, LARGEUR))
  })
})

describe('POSITIONS_PILE', () => {
  it('a exactement trois positions, échelles décroissantes', () => {
    expect(POSITIONS_PILE).toHaveLength(3)
    expect(POSITIONS_PILE.map((p) => p.echelle)).toEqual([1, 0.95, 0.9])
    expect(POSITIONS_PILE.map((p) => p.decalageY)).toEqual([0, 10, 20])
  })
})
