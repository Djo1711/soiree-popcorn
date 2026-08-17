import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const VARIABLES = [
  '--sp-bg',
  '--sp-bg-2',
  '--sp-surface',
  '--sp-ink',
  '--sp-ink-soft',
  '--sp-accent',
  '--sp-accent-ink',
  '--sp-danger',
  '--sp-radius-card',
  '--sp-radius-pill',
  '--sp-font-display',
  '--sp-font-meta',
  '--sp-grain-opacity',
  '--sp-shadow-card',
]

describe('thèmes', () => {
  it('tokens.css déclare les 14 variables avec une valeur de secours', () => {
    const source = readFileSync('themes/tokens.css', 'utf8')
    for (const variable of VARIABLES) {
      expect(source, `${variable} absent de tokens.css`).toMatch(
        new RegExp(`${variable}\\s*:\\s*[^;]+;`),
      )
    }
  })

  it('videoclub.css redéfinit les 14 variables', () => {
    const source = readFileSync('themes/videoclub.css', 'utf8')
    expect(source).toMatch(/\[data-theme=['"]videoclub['"]\]/)
    for (const variable of VARIABLES) {
      expect(source, `${variable} absent de videoclub.css`).toMatch(
        new RegExp(`${variable}\\s*:\\s*[^;]+;`),
      )
    }
  })

  it('salle-obscure.css redéfinit les 14 variables', () => {
    const source = readFileSync('themes/salle-obscure.css', 'utf8')
    expect(source).toMatch(/\[data-theme=['"]salle-obscure['"]\]/)
    for (const variable of VARIABLES) {
      expect(source, `${variable} absent de salle-obscure.css`).toMatch(
        new RegExp(`${variable}\\s*:\\s*[^;]+;`),
      )
    }
  })

  it('les deux thèmes déclarent leurs quatre fonds', () => {
    for (const [fichier, theme] of [
      ['themes/videoclub.css', 'videoclub'],
      ['themes/salle-obscure.css', 'salle-obscure'],
    ] as const) {
      const source = readFileSync(fichier, 'utf8')
      for (let fond = 1; fond <= 4; fond++) {
        expect(
          source,
          `fond ${fond} absent de ${fichier}`,
        ).toMatch(new RegExp(`\\[data-theme=['"]${theme}['"]\\]\\[data-bg=['"]${fond}['"]\\]`))
      }
    }
  })
})
