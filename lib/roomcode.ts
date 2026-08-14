/** 32 caractères, sans I, O, 0 ni 1 — impossible de se tromper en dictant un code. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 6

export function normalizeRoomCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase()
}

export function isValidRoomCode(input: string): boolean {
  const code = normalizeRoomCode(input)
  if (code.length !== ROOM_CODE_LENGTH) return false
  return [...code].every((c) => ROOM_CODE_ALPHABET.includes(c))
}
