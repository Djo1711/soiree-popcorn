import { createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'sp_session'
export const SESSION_MAX_AGE_SECONDS = 31_536_000

export interface SessionPayload {
  memberId: string
  roomCode: string
}

function secret(): string {
  const valeur = process.env.SESSION_SECRET
  if (!valeur) throw new Error("SESSION_SECRET est absent de l'environnement.")
  return valeur
}

function signature(donnees: string): string {
  return createHmac('sha256', secret()).update(donnees).digest('base64url')
}

export function signSession(payload: SessionPayload): string {
  const donnees = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `${donnees}.${signature(donnees)}`
}

/**
 * Relit un jeton. Renvoie `null` sur toute anomalie plutôt que de lever :
 * un cookie invalide est un cas courant — effacé, expiré, recopié à la main —
 * et non une erreur du serveur.
 */
export function readSession(token: string | undefined): SessionPayload | null {
  if (!token) return null
  const morceaux = token.split('.')
  if (morceaux.length !== 2) return null
  const [donnees, recue] = morceaux

  const attendue = signature(donnees)
  const a = Buffer.from(recue)
  const b = Buffer.from(attendue)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const charge: unknown = JSON.parse(Buffer.from(donnees, 'base64url').toString('utf8'))
    if (
      typeof charge !== 'object' ||
      charge === null ||
      typeof (charge as SessionPayload).memberId !== 'string' ||
      typeof (charge as SessionPayload).roomCode !== 'string'
    ) {
      return null
    }
    const { memberId, roomCode } = charge as SessionPayload
    return { memberId, roomCode }
  } catch {
    return null
  }
}
