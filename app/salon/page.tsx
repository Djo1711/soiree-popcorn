'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { annulerDernierBalayage, balayer, paquet } from '@/lib/api-client'
import { appliquerTeinte } from '@/lib/color-extract'
import { useRoomEvents } from '@/lib/use-room-events'
import { CardStack } from '@/components/swipe/CardStack'
import { SwipeControls } from '@/components/swipe/SwipeControls'
import { MovieSheet } from '@/components/swipe/MovieSheet'
import { MatchOverlay } from '@/components/swipe/MatchOverlay'
import { FilterSheet } from '@/components/filters/FilterSheet'
import { SettingsSheet } from '@/components/settings/SettingsSheet'
import type { DeckCard } from '@/lib/db/queries/deck'
import type { MatchRow } from '@/lib/db/queries/matches'

export default function EcranBalayage() {
  const router = useRouter()
  const evenementsSalon = useRoomEvents()
  const [cartes, setCartes] = useState<DeckCard[]>([])
  const [messageVide, setMessageVide] = useState<string | null>(null)
  const [dernierBalaye, setDernierBalaye] = useState<number | null>(null)
  const [filmDetail, setFilmDetail] = useState<DeckCard | null>(null)
  const [filtresOuverts, setFiltresOuverts] = useState(false)
  const [reglagesOuverts, setReglagesOuverts] = useState(false)
  const [matchAffiche, setMatchAffiche] = useState<MatchRow | null>(null)
  const [dernierMatchVu, setDernierMatchVu] = useState<number | null>(null)

  const rechargerPaquet = useCallback(() => {
    paquet(20)
      .then(({ cards, message }) => {
        setCartes(cards)
        setMessageVide(message ?? null)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    rechargerPaquet()
  }, [rechargerPaquet])

  useEffect(() => {
    if (evenementsSalon.sansSession) router.replace('/')
  }, [evenementsSalon.sansSession, router])

  useEffect(() => {
    if (dernierMatchVu === null) {
      if (!evenementsSalon.pretAffiche) return
      // Premier cycle : n'afficher aucun match déjà existant, seulement les nouveaux à venir.
      const maxConnu = evenementsSalon.matches.reduce((max, m) => Math.max(max, m.matchId), 0)
      setDernierMatchVu(maxConnu)
      return
    }
    const nouveau = evenementsSalon.matches.find((m) => m.matchId > dernierMatchVu)
    if (nouveau) {
      setMatchAffiche(nouveau)
      setDernierMatchVu(nouveau.matchId)
    }
  }, [evenementsSalon.matches, evenementsSalon.pretAffiche, dernierMatchVu])

  async function traiterBalayage(id: number, sens: 'aime' | 'rejette') {
    const carte = cartes.find((c) => c.id === id)
    setCartes((precedent) => precedent.filter((c) => c.id !== id))
    setDernierBalaye(id)
    try {
      const { match } = await balayer(id, sens === 'aime')
      if (match && carte) {
        setDernierBalaye(null) // un balayage ayant créé un match n'est plus annulable (§6)
        setDernierMatchVu((precedent) => (precedent === null || match.matchId > precedent ? match.matchId : precedent))
        setMatchAffiche(
          (precedent) =>
            precedent ?? {
              matchId: match.matchId,
              status: 'a_voir',
              createdAt: new Date().toISOString(),
              movie: carte,
            },
        )
      }
      if (cartes.length <= 3) rechargerPaquet()
    } catch {
      // Le balayage n'a pas été enregistré côté serveur : recharger le paquet
      // depuis la vraie base plutôt que de laisser « rembobiner » viser un
      // balayage fantôme.
      setDernierBalaye(null)
      rechargerPaquet()
    }
  }

  async function rembobiner() {
    if (dernierBalaye === null) return
    try {
      const { movieId } = await annulerDernierBalayage()
      setDernierBalaye(null)
      rechargerPaquet()
      void movieId
    } catch {
      setDernierBalaye(null)
    }
  }

  const carteHaut = cartes[0]

  useEffect(() => {
    if (document.documentElement.dataset.bg !== '4' || !carteHaut?.posterPath) return
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.src = `https://image.tmdb.org/t/p/w92${carteHaut.posterPath}`
    img.onload = () => appliquerTeinte(document.body, carteHaut.posterPath!, img)
  }, [carteHaut])

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between p-4">
        <span className="sp-meta" style={{ color: 'var(--sp-ink-page-soft)' }}>
          {evenementsSalon.room?.code ?? '……'}
        </span>
        <button
          type="button"
          aria-label="Filtres"
          onClick={() => setFiltresOuverts(true)}
          className="min-h-11 px-3"
        >
          ⚙ Filtres
        </button>
        <button
          type="button"
          aria-label="Réglages"
          onClick={() => setReglagesOuverts(true)}
          className="min-h-11 px-3"
        >
          ⚙︎
        </button>
        <Link href="/salon/matchs" className="sp-meta min-h-11 flex items-center">
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
            onDetail={(id) => setFilmDetail(cartes.find((c) => c.id === id) ?? null)}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p>{messageVide ?? 'Plus aucun film pour l’instant.'}</p>
            <button
              type="button"
              className="underline"
              style={{ color: 'var(--sp-accent)' }}
              onClick={() => setFiltresOuverts(true)}
            >
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
          onDetail={() => setFilmDetail(carteHaut ?? null)}
        />
      )}

      <FilterSheet
        ouverte={filtresOuverts}
        onFermer={() => setFiltresOuverts(false)}
        onAppliquer={rechargerPaquet}
      />

      <SettingsSheet
        ouverte={reglagesOuverts}
        onFermer={() => setReglagesOuverts(false)}
        code={evenementsSalon.room?.code ?? ''}
        prenom={evenementsSalon.moi?.displayName ?? ''}
        lien={
          typeof window !== 'undefined' && evenementsSalon.room
            ? `${window.location.origin}/j/${evenementsSalon.room.code}`
            : ''
        }
      />

      <MovieSheet film={filmDetail} onFermer={() => setFilmDetail(null)} />

      <MatchOverlay
        match={matchAffiche}
        prenoms={evenementsSalon.members.map((m) => m.displayName)}
        onFermer={() => setMatchAffiche(null)}
        onVoirMatchs={() => router.push('/salon/matchs')}
      />
    </main>
  )
}
