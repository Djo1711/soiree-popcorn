'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { changerStatutMatch, listerMatchs } from '@/lib/api-client'
import { MatchGrid } from '@/components/matches/MatchGrid'
import type { MatchRow } from '@/lib/db/queries/matches'
import type { MatchStatus } from '@/lib/db/schema'

const ONGLETS: { statut: MatchStatus; libelle: string }[] = [
  { statut: 'a_voir', libelle: 'À voir' },
  { statut: 'vu', libelle: 'Vu' },
  { statut: 'abandonne', libelle: 'Abandonné' },
]

export default function PageMatchs() {
  const [statut, setStatut] = useState<MatchStatus>('a_voir')
  const [matchs, setMatchs] = useState<MatchRow[]>([])

  useEffect(() => {
    listerMatchs(statut).then(({ matches }) => setMatchs(matches))
  }, [statut])

  async function changerStatut(movieId: number, nouveauStatut: MatchStatus) {
    await changerStatutMatch(movieId, nouveauStatut)
    setMatchs((precedent) => precedent.filter((m) => m.movie.id !== movieId))
  }

  return (
    <main className="sp-page min-h-dvh">
      <header className="flex items-center justify-between p-4">
        <Link href="/salon" className="min-h-11">
          ← Retour
        </Link>
        <h1 style={{ fontFamily: 'var(--sp-font-display)' }} className="text-xl">
          Nos matchs
        </h1>
        <span />
      </header>

      <nav className="flex justify-center gap-2 px-4">
        {ONGLETS.map(({ statut: s, libelle }) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatut(s)}
            className="min-h-11 px-4"
            style={{
              borderRadius: 'var(--sp-radius-pill)',
              background: statut === s ? 'var(--sp-accent)' : 'transparent',
              color: statut === s ? 'var(--sp-accent-ink)' : 'var(--sp-ink)',
            }}
          >
            {libelle}
          </button>
        ))}
      </nav>

      <MatchGrid matchs={matchs} onChangerStatut={changerStatut} />

      {statut === 'a_voir' && matchs.length > 0 && (
        <div className="p-4">
          <button
            type="button"
            className="min-h-11 w-full rounded-[var(--sp-radius-pill)]"
            style={{ background: 'var(--sp-accent)', color: 'var(--sp-accent-ink)' }}
          >
            Décide pour nous
          </button>
        </div>
      )}
    </main>
  )
}
