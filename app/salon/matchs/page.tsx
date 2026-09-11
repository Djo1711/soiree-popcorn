'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { changerStatutMatch, listerMatchs } from '@/lib/api-client'
import { enterDelay } from '@/lib/entrance'
import { useRoomEvents } from '@/lib/use-room-events'
import { MatchGrid } from '@/components/matches/MatchGrid'
import { RouletteDialog } from '@/components/matches/RouletteDialog'
import type { MatchRow } from '@/lib/db/queries/matches'
import type { MatchStatus } from '@/lib/db/schema'

const ONGLETS: { statut: MatchStatus; libelle: string }[] = [
  { statut: 'a_voir', libelle: 'À voir' },
  { statut: 'vu', libelle: 'Vu' },
  { statut: 'abandonne', libelle: 'Abandonné' },
]

export default function PageMatchs() {
  const router = useRouter()
  const evenementsSalon = useRoomEvents()
  const [statut, setStatut] = useState<MatchStatus>('a_voir')
  const [matchs, setMatchs] = useState<MatchRow[]>([])
  const [rouletteOuverte, setRouletteOuverte] = useState(false)

  useEffect(() => {
    if (evenementsSalon.sansSession) router.replace('/')
  }, [evenementsSalon.sansSession, router])

  useEffect(() => {
    listerMatchs(statut)
      .then(({ matches }) => setMatchs(matches))
      .catch(() => {})
  }, [statut])

  async function changerStatut(movieId: number, nouveauStatut: MatchStatus) {
    try {
      await changerStatutMatch(movieId, nouveauStatut)
      setMatchs((precedent) => precedent.filter((m) => m.movie.id !== movieId))
    } catch {
      // Rien à faire : la vignette reste affichée avec son statut réel côté serveur.
    }
  }

  return (
    <main className="min-h-dvh">
      <header className="flex items-center justify-between p-4">
        <Link href="/salon" className="sp-tactile min-h-11">
          ← Retour
        </Link>
        <h1
          style={{ fontFamily: 'var(--sp-font-display)', ...enterDelay('0ms') }}
          className="sp-enter text-xl"
        >
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
            className="sp-tactile min-h-11 px-4"
            style={{
              borderRadius: 'var(--sp-radius-pill)',
              background: statut === s ? 'var(--sp-accent)' : 'transparent',
              color: statut === s ? 'var(--sp-accent-ink)' : 'var(--sp-ink-page)',
              boxShadow: statut === s ? '0 3px 0 color-mix(in srgb, var(--sp-accent) 65%, black)' : undefined,
            }}
          >
            {libelle}
          </button>
        ))}
      </nav>

      <MatchGrid matchs={matchs} onChangerStatut={changerStatut} />

      {statut === 'a_voir' && matchs.length > 0 && (
        <div className="sp-enter p-4" style={enterDelay('80ms')}>
          <button
            type="button"
            onClick={() => setRouletteOuverte(true)}
            className="sp-tactile sp-pulse min-h-11 w-full rounded-[var(--sp-radius-pill)]"
            style={
              {
                background: 'var(--sp-accent)',
                color: 'var(--sp-accent-ink)',
                boxShadow: '0 4px 0 color-mix(in srgb, var(--sp-accent) 65%, black)',
                '--sp-pulse-shadow-a':
                  '0 4px 0 color-mix(in srgb, var(--sp-accent) 65%, black), 0 10px 18px -8px color-mix(in srgb, var(--sp-accent) 45%, transparent)',
                '--sp-pulse-shadow-b':
                  '0 4px 0 color-mix(in srgb, var(--sp-accent) 65%, black), 0 12px 26px -6px color-mix(in srgb, var(--sp-accent) 70%, transparent)',
              } as React.CSSProperties
            }
          >
            Décide pour nous
          </button>
        </div>
      )}

      <RouletteDialog ouverte={rouletteOuverte} onFermer={() => setRouletteOuverte(false)} />
    </main>
  )
}
