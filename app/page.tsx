'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApiClientError, creerSalon, evenements, rejoindreSalon } from '@/lib/api-client'
import { enterDelay } from '@/lib/entrance'
import { MAX_MEMBERS, MIN_MEMBERS } from '@/lib/match'

type Mode = 'verification' | 'accueil' | 'creer' | 'rejoindre' | 'partage'

export default function Home() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('verification')
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  const [prenom, setPrenom] = useState('')
  const [effectif, setEffectif] = useState(2)
  const [seuil, setSeuil] = useState(2)
  const [code, setCode] = useState('')
  const [copie, setCopie] = useState(false)

  useEffect(() => {
    evenements(0)
      .then(() => router.replace('/salon'))
      .catch(() => setMode('accueil'))
  }, [router])

  async function soumettreCreation(e: React.FormEvent) {
    e.preventDefault()
    setEnCours(true)
    setErreur(null)
    try {
      const { room } = await creerSalon({
        displayName: prenom,
        expectedMembers: effectif,
        matchThreshold: seuil,
      })
      // §7.1 : le lien à partager s'affiche avec un bouton de copie avant de
      // continuer — la création seule ne suffit pas à commencer, il faut
      // encore inviter les autres.
      setCode(room.code)
      setMode('partage')
    } catch (e) {
      setErreur(e instanceof ApiClientError ? e.message : 'Une erreur est survenue.')
    } finally {
      setEnCours(false)
    }
  }

  async function soumettreAdhesion(e: React.FormEvent) {
    e.preventDefault()
    setEnCours(true)
    setErreur(null)
    try {
      await rejoindreSalon(code, prenom)
      router.push('/salon')
    } catch (e) {
      setErreur(e instanceof ApiClientError ? e.message : 'Une erreur est survenue.')
    } finally {
      setEnCours(false)
    }
  }

  if (mode === 'verification') return null

  if (mode === 'accueil') {
    return (
      <main className="relative mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 overflow-hidden p-6">
        <span
          className="sp-floaty pointer-events-none absolute text-2xl"
          style={{ top: '16%', left: '10%', ...enterDelay('0s') }}
          aria-hidden="true"
        >
          🍿
        </span>
        <span
          className="sp-floaty pointer-events-none absolute text-2xl"
          style={{ top: '20%', right: '10%', ...enterDelay('1.3s') }}
          aria-hidden="true"
        >
          🎬
        </span>
        <span
          className="sp-meta sp-enter-pop mb-3"
          style={{
            ...enterDelay('250ms'),
            background: 'var(--sp-surface)',
            color: 'var(--sp-ink)',
            padding: '4px 12px',
            borderRadius: 'var(--sp-radius-pill)',
            transform: 'rotate(-3deg)',
            fontSize: '11px',
            boxShadow: '0 4px 10px -4px rgba(0, 0, 0, 0.3)',
          }}
        >
          2 à 8 personnes
        </span>
        <h1
          style={{ fontFamily: 'var(--sp-font-display)', ...enterDelay('0ms') }}
          className="sp-enter text-3xl"
        >
          Soirée Popcorn
        </h1>
        <p className="sp-meta sp-enter mb-3" style={{ ...enterDelay('120ms'), color: 'var(--sp-ink-page-soft)' }}>
          on choisit, ensemble
        </p>
        <button
          className="sp-tactile sp-enter min-h-11 w-full rounded-[var(--sp-radius-pill)] bg-[var(--sp-accent)] px-6 py-3 text-[var(--sp-accent-ink)]"
          style={{
            ...enterDelay('260ms'),
            boxShadow: '0 5px 0 color-mix(in srgb, var(--sp-accent) 65%, black)',
          }}
          onClick={() => setMode('creer')}
        >
          Créer un salon
        </button>
        <button
          className="sp-tactile sp-enter min-h-11 w-full rounded-[var(--sp-radius-pill)] border border-[var(--sp-ink-page-soft)] px-6 py-3"
          style={{
            ...enterDelay('360ms'),
            boxShadow: '0 4px 0 color-mix(in srgb, var(--sp-ink-page-soft) 65%, black)',
          }}
          onClick={() => setMode('rejoindre')}
        >
          Rejoindre
        </button>
      </main>
    )
  }

  if (mode === 'creer') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
        <h1 className="text-xl">Créer un salon</h1>
        <form onSubmit={soumettreCreation} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            Ton prénom
            <input
              className="min-h-11 rounded-[var(--sp-radius-pill)] border border-[var(--sp-ink-page-soft)] px-4"
              value={prenom}
              onChange={(e) => setPrenom(e.target.value)}
              maxLength={30}
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            Nombre de participants : {effectif}
            <input
              type="range"
              className="min-h-11"
              min={MIN_MEMBERS}
              max={MAX_MEMBERS}
              value={effectif}
              onChange={(e) => {
                const valeur = Number(e.target.value)
                setEffectif(valeur)
                setSeuil((s) => Math.min(s, valeur))
              }}
            />
          </label>
          {effectif > 2 && (
            <label className="flex flex-col gap-1">
              Seuil de match : il faut que {seuil} personne{seuil > 1 ? 's' : ''} sur {effectif}{' '}
              aiment le film
              <input
                type="range"
                className="min-h-11"
                min={MIN_MEMBERS}
                max={effectif}
                value={seuil}
                onChange={(e) => setSeuil(Number(e.target.value))}
              />
            </label>
          )}
          {erreur && <p className="text-[var(--sp-danger)]">{erreur}</p>}
          <button
            type="submit"
            disabled={enCours}
            className="min-h-11 rounded-[var(--sp-radius-pill)] bg-[var(--sp-accent)] px-6 py-3 text-[var(--sp-accent-ink)] disabled:opacity-60"
          >
            {enCours ? 'Création…' : 'Créer'}
          </button>
        </form>
      </main>
    )
  }

  if (mode === 'partage') {
    const lien = typeof window !== 'undefined' ? `${window.location.origin}/j/${code}` : ''
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl">Salon créé !</h1>
        <p>
          Code : <span className="sp-meta text-lg">{code}</span>
        </p>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(lien)
            setCopie(true)
            setTimeout(() => setCopie(false), 1500)
          }}
          className="min-h-11 w-full rounded-[var(--sp-radius-pill)] border px-6 py-3"
          style={{ borderColor: 'var(--sp-ink-page-soft)' }}
        >
          {copie ? 'Lien copié !' : 'Copier le lien à partager'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/salon')}
          className="min-h-11 w-full rounded-[var(--sp-radius-pill)] bg-[var(--sp-accent)] px-6 py-3 text-[var(--sp-accent-ink)]"
        >
          Continuer
        </button>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl">Rejoindre un salon</h1>
      <form onSubmit={soumettreAdhesion} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          Code du salon
          <input
            className="min-h-11 rounded-[var(--sp-radius-pill)] border border-[var(--sp-ink-page-soft)] px-4 uppercase"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1">
          Ton prénom
          <input
            className="min-h-11 rounded-[var(--sp-radius-pill)] border border-[var(--sp-ink-page-soft)] px-4"
            value={prenom}
            onChange={(e) => setPrenom(e.target.value)}
            required
          />
        </label>
        {erreur && <p className="text-[var(--sp-danger)]">{erreur}</p>}
        <button
          type="submit"
          disabled={enCours}
          className="min-h-11 rounded-[var(--sp-radius-pill)] bg-[var(--sp-accent)] px-6 py-3 text-[var(--sp-accent-ink)] disabled:opacity-60"
        >
          {enCours ? 'Adhésion…' : 'Rejoindre'}
        </button>
      </form>
    </main>
  )
}
