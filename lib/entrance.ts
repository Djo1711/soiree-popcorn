import type { CSSProperties } from 'react'

/**
 * Décalage d'entrée pour les classes .sp-enter / .sp-enter-pop / .sp-floaty
 * (themes/tokens.css) — un petit utilitaire pour éviter de retaper le même
 * contournement de typage (React n'inclut pas les propriétés CSS
 * personnalisées dans CSSProperties) à chaque composant qui échelonne ses
 * animations d'entrée.
 */
export function enterDelay(delai: string): CSSProperties {
  return { '--sp-enter-delay': delai } as CSSProperties
}
