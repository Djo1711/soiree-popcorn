import { SESSION_COOKIE, readSession, type SessionPayload } from '@/lib/session'
import { erreur } from '@/lib/api/respond'

function cookie(request: Request, nom: string): string | undefined {
  const brut = request.headers.get('cookie')
  if (!brut) return undefined
  for (const morceau of brut.split(';')) {
    const [cle, ...reste] = morceau.trim().split('=')
    if (cle === nom) return reste.join('=')
  }
  return undefined
}

export function lireMembre(request: Request): SessionPayload | null {
  return readSession(cookie(request, SESSION_COOKIE))
}

export function exigerMembre(request: Request): SessionPayload | Response {
  return lireMembre(request) ?? erreur(401, 'Rejoignez un salon avant de continuer.')
}
