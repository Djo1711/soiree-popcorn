import { eq } from 'drizzle-orm'
import type { DeckFilters } from '@/lib/db/queries/deck'
import { memberFilters } from '@/lib/db/schema'

export const FILTRES_PAR_DEFAUT: DeckFilters = {
  genres: [],
  yearFrom: null,
  yearTo: null,
  minRating: 0,
  maxRuntime: null,
  providers: [],
  includeTop200: true,
}

export async function getFilters(db: any, memberId: string): Promise<DeckFilters> {
  const lignes = await db.select().from(memberFilters).where(eq(memberFilters.memberId, memberId))
  const f = lignes[0]
  if (!f) return { ...FILTRES_PAR_DEFAUT }
  return {
    genres: f.genres ?? [],
    yearFrom: f.yearFrom ?? null,
    yearTo: f.yearTo ?? null,
    minRating: Number(f.minRating ?? 0),
    maxRuntime: f.maxRuntime ?? null,
    providers: f.providers ?? [],
    includeTop200: f.includeTop200 ?? true,
  }
}

export async function setFilters(db: any, memberId: string, f: DeckFilters): Promise<void> {
  await db
    .insert(memberFilters)
    .values({ memberId, ...f, updatedAt: new Date() })
    .onConflictDoUpdate({ target: memberFilters.memberId, set: { ...f, updatedAt: new Date() } })
}
