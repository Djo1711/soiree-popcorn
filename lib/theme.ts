'use client'

import { useCallback, useEffect, useState } from 'react'

export const THEMES = ['videoclub', 'salle-obscure'] as const
export type Theme = (typeof THEMES)[number]
export type Fond = '1' | '2' | '3' | '4'

export const DEFAULT_THEME: Theme = 'videoclub'
const FONDS: readonly Fond[] = ['1', '2', '3', '4']

export const BACKGROUNDS_PAR_THEME: Record<Theme, readonly Fond[]> = {
  videoclub: FONDS,
  'salle-obscure': FONDS,
}

const CLE_THEME = 'sp-theme'
const cleFond = (theme: Theme) => `sp-bg-${theme}`

type StockageLecture = Pick<Storage, 'getItem'>
type StockageEcriture = Pick<Storage, 'setItem'>

export function lireTheme(storage: StockageLecture): Theme {
  const valeur = storage.getItem(CLE_THEME)
  return (THEMES as readonly string[]).includes(valeur ?? '') ? (valeur as Theme) : DEFAULT_THEME
}

export function ecrireTheme(storage: StockageEcriture, theme: Theme): void {
  storage.setItem(CLE_THEME, theme)
}

export function lireFond(storage: StockageLecture, theme: Theme): Fond {
  const valeur = storage.getItem(cleFond(theme))
  return (FONDS as readonly string[]).includes(valeur ?? '') ? (valeur as Fond) : '1'
}

export function ecrireFond(storage: StockageEcriture, theme: Theme, fond: Fond): void {
  storage.setItem(cleFond(theme), fond)
}

/**
 * Applique le thème et le fond courants sur `<html>` via des attributs de
 * données, seul point de contact entre React et les sélecteurs CSS de
 * `themes/*.css`. Lu et écrit uniquement côté client — le rendu serveur
 * utilise `DEFAULT_THEME`/`'1'`, corrigés au premier effet avant peinture
 * visible grâce au script bloquant posé dans le layout.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME)
  const [fond, setFond] = useState<Fond>('1')

  useEffect(() => {
    const themeStocke = lireTheme(window.localStorage)
    setTheme(themeStocke)
    setFond(lireFond(window.localStorage, themeStocke))
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.bg = fond
  }, [theme, fond])

  const definirTheme = useCallback((t: Theme) => {
    setTheme(t)
    ecrireTheme(window.localStorage, t)
    const fondMemorise = lireFond(window.localStorage, t)
    setFond(fondMemorise)
  }, [])

  const definirFond = useCallback(
    (f: Fond) => {
      setFond(f)
      ecrireFond(window.localStorage, theme, f)
    },
    [theme],
  )

  return { theme, fond, definirTheme, definirFond }
}
