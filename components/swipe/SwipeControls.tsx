export function SwipeControls({
  onRembobiner,
  onRejeter,
  onAimer,
  onDetail,
  rembobinageDisponible,
}: {
  onRembobiner: () => void
  onRejeter: () => void
  onAimer: () => void
  onDetail: () => void
  rembobinageDisponible: boolean
}) {
  const bouton = 'sp-tactile flex h-14 w-14 items-center justify-center rounded-full text-2xl'
  // Relief « touche » : chaque bouton porte une ombre basse dérivée de son
  // propre fond, plutôt qu'une couleur en dur — cohérent sur les deux thèmes.
  const ombre = (couleur: string) => `0 4px 0 color-mix(in srgb, ${couleur} 65%, black)`

  return (
    <div className="flex items-center justify-center gap-4 p-4">
      <button
        type="button"
        aria-label="Rembobiner le dernier balayage"
        onClick={onRembobiner}
        disabled={!rembobinageDisponible}
        className={bouton}
        style={{
          background: 'var(--sp-bg-2)',
          color: 'var(--sp-ink)',
          opacity: rembobinageDisponible ? 1 : 0.4,
          boxShadow: ombre('var(--sp-bg-2)'),
        }}
      >
        ↺
      </button>
      <button
        type="button"
        aria-label="Rejeter"
        onClick={onRejeter}
        className={bouton}
        style={{
          background: 'var(--sp-surface)',
          color: 'var(--sp-danger)',
          border: '2px solid var(--sp-danger)',
          boxShadow: ombre('var(--sp-surface)'),
        }}
      >
        ✕
      </button>
      <button
        type="button"
        aria-label="Voir les détails"
        onClick={onDetail}
        className={bouton}
        style={{ background: 'var(--sp-bg-2)', color: 'var(--sp-ink)', boxShadow: ombre('var(--sp-bg-2)') }}
      >
        ⓘ
      </button>
      <button
        type="button"
        aria-label="J'aime"
        onClick={onAimer}
        className={`${bouton} sp-pulse`}
        style={
          {
            background: 'var(--sp-accent)',
            color: 'var(--sp-accent-ink)',
            boxShadow: ombre('var(--sp-accent)'),
            '--sp-pulse-shadow-a': `${ombre('var(--sp-accent)')}, 0 12px 20px -8px color-mix(in srgb, var(--sp-accent) 50%, transparent)`,
            '--sp-pulse-shadow-b': `${ombre('var(--sp-accent)')}, 0 14px 30px -6px color-mix(in srgb, var(--sp-accent) 75%, transparent)`,
          } as React.CSSProperties
        }
      >
        ♥
      </button>
    </div>
  )
}
