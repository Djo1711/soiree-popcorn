'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { quitterSalon } from '@/lib/api-client'
import { useTheme, type Fond, type Theme } from '@/lib/theme'

const LIBELLES_THEME: Record<Theme, string> = {
  videoclub: 'Vidéo-club',
  'salle-obscure': 'Salle obscure',
}

const FONDS: Fond[] = ['1', '2', '3', '4']

export function SettingsSheet({
  ouverte,
  onFermer,
  code,
  prenom,
  lien,
}: {
  ouverte: boolean
  onFermer: () => void
  code: string
  prenom: string
  lien: string
}) {
  const router = useRouter()
  const { theme, fond, definirTheme, definirFond } = useTheme()
  const [copie, setCopie] = useState(false)
  const [enCours, setEnCours] = useState(false)

  if (!ouverte) return null

  async function quitter() {
    setEnCours(true)
    await quitterSalon()
    router.push('/')
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end" onClick={onFermer}>
      <div className="absolute inset-0" style={{ background: 'rgba(0, 0, 0, 0.5)' }} />
      <div
        className="relative z-10 max-h-[85dvh] w-full overflow-y-auto p-6"
        style={{
          background: 'var(--sp-bg-2)',
          color: 'var(--sp-ink)',
          borderTopLeftRadius: 'var(--sp-radius-card)',
          borderTopRightRadius: 'var(--sp-radius-card)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl">Réglages</h2>
          <button
            type="button"
            onClick={onFermer}
            aria-label="Fermer"
            className="h-11 w-11 rounded-full"
            style={{ background: 'var(--sp-surface)' }}
          >
            ↓
          </button>
        </div>

        <fieldset className="mb-4">
          <legend className="sp-meta mb-2 text-sm">Thème</legend>
          <div className="flex gap-2">
            {(['videoclub', 'salle-obscure'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => definirTheme(t)}
                className="min-h-11 flex-1 rounded-[var(--sp-radius-pill)] border px-3"
                style={{
                  borderColor: theme === t ? 'var(--sp-accent)' : 'var(--sp-ink-soft)',
                  background: theme === t ? 'var(--sp-accent)' : 'transparent',
                  color: theme === t ? 'var(--sp-accent-ink)' : 'var(--sp-ink)',
                }}
              >
                {LIBELLES_THEME[t]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mb-4">
          <legend className="sp-meta mb-2 text-sm">Fond</legend>
          <div className="grid grid-cols-4 gap-2">
            {FONDS.map((f) => (
              <button
                key={f}
                type="button"
                aria-label={`Fond ${f}`}
                onClick={() => definirFond(f)}
                data-theme={theme}
                data-bg={f}
                className="aspect-square min-h-11"
                style={{
                  borderRadius: 'var(--sp-radius-card)',
                  border: fond === f ? '3px solid var(--sp-accent)' : '1px solid var(--sp-ink-soft)',
                  background: 'var(--sp-bg)',
                }}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="mb-4">
          <legend className="sp-meta mb-2 text-sm">Salon</legend>
          {prenom && <p className="sp-meta mb-2">Prénom : {prenom}</p>}
          <p className="sp-meta mb-2">Code : {code}</p>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(lien)
              setCopie(true)
              setTimeout(() => setCopie(false), 1500)
            }}
            className="min-h-11 w-full rounded-[var(--sp-radius-pill)] border px-3"
            style={{ borderColor: 'var(--sp-ink-soft)' }}
          >
            {copie ? 'Lien copié !' : 'Copier le lien du salon'}
          </button>
        </fieldset>

        <button
          type="button"
          onClick={quitter}
          disabled={enCours}
          className="block min-h-11 w-full rounded-[var(--sp-radius-pill)] border px-3 py-2 text-center disabled:opacity-60"
          style={{ borderColor: 'var(--sp-danger)', color: 'var(--sp-danger)' }}
        >
          {enCours ? 'Sortie…' : 'Quitter le salon'}
        </button>
      </div>
    </div>
  )
}
