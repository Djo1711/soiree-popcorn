import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THEME,
  ecrireFond,
  ecrireTheme,
  lireFond,
  lireTheme,
} from '@/lib/theme'

/** Fausse implémentation de `Storage`, suffisante pour ces fonctions pures. */
class StockageFictif {
  private valeurs = new Map<string, string>()
  getItem(cle: string): string | null {
    return this.valeurs.get(cle) ?? null
  }
  setItem(cle: string, valeur: string): void {
    this.valeurs.set(cle, valeur)
  }
}

describe('lireTheme', () => {
  it("rend le thème par défaut quand rien n'est stocké", () => {
    expect(lireTheme(new StockageFictif())).toBe(DEFAULT_THEME)
  })

  it("relit ce qu'on a écrit", () => {
    const stockage = new StockageFictif()
    ecrireTheme(stockage, 'salle-obscure')
    expect(lireTheme(stockage)).toBe('salle-obscure')
  })

  it('ignore une valeur stockée invalide et rend le défaut', () => {
    const stockage = new StockageFictif()
    stockage.setItem('sp-theme', 'n-importe-quoi')
    expect(lireTheme(stockage)).toBe(DEFAULT_THEME)
  })
})

describe('lireFond', () => {
  it('rend « 1 » par défaut pour chaque thème', () => {
    const stockage = new StockageFictif()
    expect(lireFond(stockage, 'videoclub')).toBe('1')
    expect(lireFond(stockage, 'salle-obscure')).toBe('1')
  })

  it('le fond est mémorisé séparément par thème', () => {
    const stockage = new StockageFictif()
    ecrireFond(stockage, 'videoclub', '3')
    ecrireFond(stockage, 'salle-obscure', '4')
    expect(lireFond(stockage, 'videoclub')).toBe('3')
    expect(lireFond(stockage, 'salle-obscure')).toBe('4')
  })

  it('ignore une valeur stockée invalide et rend « 1 »', () => {
    const stockage = new StockageFictif()
    stockage.setItem('sp-bg-videoclub', '9')
    expect(lireFond(stockage, 'videoclub')).toBe('1')
  })
})
