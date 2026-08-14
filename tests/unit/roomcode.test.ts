import { describe, expect, it } from 'vitest'
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
} from '@/lib/roomcode'

describe('generateRoomCode', () => {
  it('produit un code de la bonne longueur', () => {
    expect(generateRoomCode()).toHaveLength(ROOM_CODE_LENGTH)
  })

  it("n'utilise jamais de caractère ambigu sur mille tirages", () => {
    for (let i = 0; i < 1000; i++) {
      const code = generateRoomCode()
      expect(code).not.toMatch(/[IO01]/)
      for (const c of code) expect(ROOM_CODE_ALPHABET).toContain(c)
    }
  })

  it('produit des codes différents', () => {
    const codes = new Set(Array.from({ length: 200 }, generateRoomCode))
    expect(codes.size).toBeGreaterThan(190)
  })
})

describe('normalizeRoomCode', () => {
  it('met en majuscules et retire espaces et tirets', () => {
    expect(normalizeRoomCode('  k4p-2m9 ')).toBe('K4P2M9')
  })
})

describe('isValidRoomCode', () => {
  it('accepte un code généré', () => {
    expect(isValidRoomCode(generateRoomCode())).toBe(true)
  })

  it('accepte une saisie en minuscules avec des espaces', () => {
    expect(isValidRoomCode(' k4p 2m9 ')).toBe(true)
  })

  it('refuse une mauvaise longueur', () => {
    expect(isValidRoomCode('K4P2M')).toBe(false)
    expect(isValidRoomCode('K4P2M99')).toBe(false)
  })

  it('refuse une saisie vide', () => {
    expect(isValidRoomCode('')).toBe(false)
    expect(isValidRoomCode('   ')).toBe(false)
  })

  it('refuse les caractères ambigus et hors alphabet', () => {
    expect(isValidRoomCode('K4P2MO')).toBe(false)
    expect(isValidRoomCode('K4P2M1')).toBe(false)
    expect(isValidRoomCode('K4P2M!')).toBe(false)
  })

  it("refuse un code de la bonne longueur entièrement fait de caractères exclus", () => {
    expect(isValidRoomCode('IIOO01')).toBe(false)
  })
})
