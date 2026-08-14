import { writeFile } from 'node:fs/promises'
import { sql } from 'drizzle-orm'
import dictionary from '@/data/keywords-fr.json'
import { db, pool } from '@/lib/db/client'
import { TmdbClient } from '@/lib/tmdb'

const TAILLE_ECHANTILLON = 1500
const SORTIE = 'data/keywords-a-traduire.json'

/**
 * Recense les mots-clés bruts les plus fréquents encore absents du dictionnaire,
 * sur un échantillon des films les plus populaires — ce sont ceux que l'on verra
 * le plus souvent passer dans le paquet.
 */
async function main() {
  const client = new TmdbClient()
  const connus = new Set(Object.keys(dictionary as Record<string, string>))

  const result = (await db.execute(sql`
    SELECT id FROM movies ORDER BY popularity DESC NULLS LAST LIMIT ${TAILLE_ECHANTILLON}
  `)) as { rows: { id: number }[] }

  const frequences = new Map<string, number>()
  const ids = result.rows.map((r) => Number(r.id))

  for (let i = 0; i < ids.length; i += 8) {
    await Promise.all(
      ids.slice(i, i + 8).map(async (id) => {
        try {
          const detail = await client.movieDetail(id)
          for (const k of detail.keywords?.keywords ?? []) {
            const nom = k.name.trim().toLowerCase()
            if (connus.has(nom)) continue
            frequences.set(nom, (frequences.get(nom) ?? 0) + 1)
          }
        } catch {
          // un film manquant ne doit pas interrompre le recensement
        }
      }),
    )
    if (i % 200 === 0) console.log(`${Math.min(i + 8, ids.length)}/${ids.length} films analysés…`)
  }

  const classement = [...frequences.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 300)
    .map(([nom, n]) => ({ nom, occurrences: n }))

  await writeFile(SORTIE, JSON.stringify(classement, null, 2), 'utf8')
  console.log(`${classement.length} mots-clés à trier écrits dans ${SORTIE}`)
  await pool.end()
}

// `await` et non `void` : une promesse rejetée doit faire échouer le script avec
// son code d'erreur, pas se perdre en avertissement de rejet non géré.
await main()
