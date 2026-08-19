import { describe, expect, it } from 'vitest'
import { couleursDominantes } from '@/lib/color-extract'

describe('couleursDominantes', () => {
  it('rend le nombre de couleurs demandé', () => {
    const pixels = Array.from({ length: 100 }, (_, i) => ({ r: i, g: 0, b: 0 }))
    expect(couleursDominantes(pixels, 2)).toHaveLength(2)
  })

  it('rend des couleurs hexadécimales valides', () => {
    const pixels = [
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 255, b: 0 },
      { r: 0, g: 0, b: 255 },
    ]
    for (const couleur of couleursDominantes(pixels, 2)) {
      expect(couleur).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('distingue deux groupes de couleurs nettement différents', () => {
    const rouges = Array.from({ length: 50 }, () => ({ r: 220, g: 20, b: 20 }))
    const bleus = Array.from({ length: 50 }, () => ({ r: 20, g: 20, b: 220 }))
    const [a, b] = couleursDominantes([...rouges, ...bleus], 2)
    expect(a.toLowerCase()).not.toBe(b.toLowerCase())
  })

  it('ne casse pas sur un tableau vide', () => {
    expect(couleursDominantes([], 2)).toEqual(['#000000', '#000000'])
  })

  it('est déterministe sur la même entrée', () => {
    const pixels = [{ r: 10, g: 20, b: 30 }, { r: 200, g: 100, b: 50 }]
    expect(couleursDominantes(pixels, 2)).toEqual(couleursDominantes(pixels, 2))
  })
})
