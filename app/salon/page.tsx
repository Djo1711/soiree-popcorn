'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { annulerDernierBalayage, balayer, paquet } from '@/lib/api-client'
import { useRoomEvents } from '@/lib/use-room-events'
import { CardStack } from '@/components/swipe/CardStack'
import { SwipeControls } from '@/components/swipe/SwipeControls'
import type { DeckCard } from '@/lib/db/queries/deck'

export default function EcranBalayage() {
  const router = useRouter()
  const evenementsSalon = useRoomEvents()
  const [cartes, setCartes] = useState<DeckCard[]>([])
  const [messageVide, setMessageVide] = useState<string | null>(null)
  const [dernierBalaye, setDernierBalaye] = useState<number | null>(null)

  const rechargerPaquet = useCallback(() => {
    paquet(20).then(({ cards, message }) => {
      setCartes(cards)
      setMessageVide(message ?? null)
    })
  }, [])

  useEffect(() => {
    rechargerPaquet()
  }, [rechargerPaquet])

  useEffect(() => {
    if (evenementsSalon.sansSession) router.replace('/')
  }, [evenementsSalon.sansSession, router])

  async function traiterBalayage(id: number, sens: 'aime' | 'rejette') {
    setCartes((precedent) => precedent.filter((c) => c.id !== id))
    setDernierBalaye(id)
    await balayer(id, sens === 'aime')
    if (cartes.length <= 3) rechargerPaquet()
  }

  async function rembobiner() {
    if (dernierBalaye === null) return
    const { movieId } = await annulerDernierBalayage()
    setDernierBalaye(null)
    rechargerPaquet()
    void movieId
  }

  const carteHaut = cartes[0]

  return (
    <main className="sp-page flex min-h-dvh flex-col">
      <header className="flex items-center justify-between p-4">
        <span className="sp-meta" style={{ color: 'var(--sp-ink-soft)' }}>
          {evenementsSalon.room?.code ?? '……'}
        </span>
        <Link href="/salon/matchs" className="sp-meta">
          {evenementsSalon.matches.length} match{evenementsSalon.matches.length > 1 ? 's' : ''}
        </Link>
      </header>

      {evenementsSalon.room && !evenementsSalon.room.complete && (
        <p
          className="mx-4 mb-2 rounded-[var(--sp-radius-pill)] px-4 py-2 text-center text-sm"
          style={{ background: 'var(--sp-bg-2)', color: 'var(--sp-ink)' }}
        >
          {evenementsSalon.room.memberCount} sur {evenementsSalon.room.expectedMembers} arrivés —
          aucun match ne se déclenche tant que tout le monde n'est pas là.
        </p>
      )}

      <div className="flex-1">
        {carteHaut ? (
          <CardStack
            cartes={cartes}
            onBalayage={traiterBalayage}
            onDetail={() => {
              /* branché à la feuille détail en tâche 9 */
            }}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p>{messageVide ?? 'Plus aucun film pour l’instant.'}</p>
            <button type="button" className="underline" style={{ color: 'var(--sp-accent)' }}>
              Modifier les filtres
            </button>
          </div>
        )}
      </div>

      {carteHaut && (
        <SwipeControls
          rembobinageDisponible={dernierBalaye !== null}
          onRembobiner={rembobiner}
          onRejeter={() => traiterBalayage(carteHaut.id, 'rejette')}
          onAimer={() => traiterBalayage(carteHaut.id, 'aime')}
          onDetail={() => {
            /* branché en tâche 9 */
          }}
        />
      )}
    </main>
  )
}
