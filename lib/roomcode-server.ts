import { randomInt } from 'node:crypto'
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@/lib/roomcode'

/**
 * Génération d'un code de salon. Isolée de la validation parce qu'elle dépend
 * de `node:crypto` : un composant client doit pouvoir valider une saisie sans
 * embarquer de module Node.
 */
export function generateRoomCode(): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]
  }
  return code
}
