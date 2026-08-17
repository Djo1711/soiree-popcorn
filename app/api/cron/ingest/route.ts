import { timingSafeEqual } from 'node:crypto'
import { avecErreurs, erreur, ok } from '@/lib/api/respond'
import { getDb } from '@/lib/db/client'
import { fetchDetails } from '@/scripts/ingest'
import { TmdbClient } from '@/lib/tmdb'

export const maxDuration = 60

/** Comparaison à temps constant, pour ne pas exposer CRON_SECRET à une attaque temporelle. */
function authorise(recu: string | null, attendu: string): boolean {
  if (recu === null) return false
  const a = Buffer.from(recu)
  const b = Buffer.from(attendu)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Rafraîchissement partiel. Le script complet dure une vingtaine de minutes,
 * bien au-delà de la durée maximale d'une fonction Vercel : cette route ne
 * relance donc que la phase 2, sur les films dont le détail manque, et
 * s'interrompt d'elle-même. Une exécution hebdomadaire rattrape le catalogue
 * par petits morceaux ; le rafraîchissement complet reste `pnpm ingest`.
 */
export async function GET(request: Request): Promise<Response> {
  return avecErreurs(async () => {
    const attendu = process.env.CRON_SECRET
    const recu = request.headers.get('authorization')
    if (!attendu || !authorise(recu, `Bearer ${attendu}`)) {
      return erreur(401, 'Accès refusé.')
    }

    const messages: string[] = []
    const traites = await fetchDetails(new TmdbClient(), getDb(), (m) => messages.push(m))
    return ok({ traites, journal: messages.slice(-5) })
  })
}
