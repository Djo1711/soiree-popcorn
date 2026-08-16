import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, signSession, type SessionPayload } from '@/lib/session'

export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data as unknown as Record<string, unknown>, { status: 200, ...init })
}

/** Toutes les erreurs partagent la même forme et sont rédigées en français. */
export function erreur(status: number, message: string): Response {
  return Response.json({ erreur: message }, { status })
}

export function poserSession(response: Response, payload: SessionPayload): Response {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  response.headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE}=${signSession(payload)}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  )
  return response
}

/**
 * Filet posé autour de chaque route : toute exception non prévue (secret
 * d'environnement absent, collision de code de salon épuisée, panne de
 * connexion à la base, paramètre non numérique provoquant une erreur SQL...)
 * remonterait sinon comme un 500 par défaut de Next.js, sans le corps JSON
 * `{ erreur }` en français attendu par le reste de l'application. L'erreur
 * réelle est journalisée côté serveur ; l'utilisateur ne voit qu'un message
 * générique.
 */
export async function avecErreurs(gestionnaire: () => Promise<Response>): Promise<Response> {
  try {
    return await gestionnaire()
  } catch (e) {
    console.error(e)
    return erreur(500, 'Une erreur est survenue de notre côté. Réessayez dans un instant.')
  }
}
