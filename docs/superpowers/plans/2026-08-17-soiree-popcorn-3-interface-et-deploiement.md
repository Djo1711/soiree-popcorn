# Soirée Popcorn — Plan 3 : interface et déploiement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire toute la moitié visible de l'application — les deux thèmes, la pile de cartes à balayer, les feuilles modales, la page des matchs, l'installation mobile — et la brancher sur l'API du plan 2, jusqu'à un parcours à deux personnes vérifié par un test à deux navigateurs.

**Architecture:** Trois couches. `themes/` porte les variables CSS des deux thèmes, sans qu'aucun composant ne connaisse une couleur en dur. `lib/` porte la logique pure — géométrie du balayage, minuterie de la roulette, extraction de couleurs, client API typé, fusion des événements du salon — testée par Vitest sans DOM. `components/` et `app/` portent le rendu ; ils ne reçoivent que des props et des données déjà typées, et leur vérification passe par la compilation (`tsc`, `next build`) plutôt que par des tests unitaires de rendu, faute d'environnement DOM dans ce projet (§12 de la spec ne demande d'ailleurs aucun test de composant : le test qui compte est le parcours Playwright final).

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Tailwind CSS v4, **Motion** (paquet npm `motion`, ex-Framer Motion) pour les gestes et transitions, Vitest pour la logique pure, **Playwright** pour le bout en bout.

**Spec de référence :** `docs/superpowers/specs/2026-08-12-soiree-popcorn-design.md`
**Plan précédent :** `docs/superpowers/plans/2026-08-14-soiree-popcorn-2-session-et-api.md`

**Périmètre :** sections 7, 8 et la partie Playwright de la section 12 de la spec, plus l'installation mobile et le déploiement. Ce plan consomme les quinze routes du plan 2 sans y toucher, et n'en ajoute qu'une seule, minimale et sans rapport avec le catalogue ou les salons : expirer le cookie de session pour « quitter le salon » (§7.6), impossible autrement puisqu'il est `HttpOnly`.

**Livrable vérifiable :** `pnpm build` réussi, `pnpm test` vert, et un test Playwright à deux contextes de navigateur qui crée un salon, y fait entrer deux membres, balaye le même film des deux côtés, et vérifie que la superposition de match apparaît **chez les deux** — plus un parcours complet à un navigateur (créer, rejoindre, filtrer, balayer, matcher, marquer *vu*, tirer au sort).

## Global Constraints

- Gestionnaire de paquets **pnpm**, TypeScript **strict**, aucun `any` implicite, aucun `@ts-ignore`.
- Tous les textes visibles sont **en français**.
- Aucun composant ne contient de couleur, police ou rayon en dur : tout passe par les quatorze variables `--sp-*` de `themes/tokens.css` (§8.1 de la spec), redéfinies dans `themes/videoclub.css` et `themes/salle-obscure.css`. Ajouter un troisième thème doit coûter un fichier, pas une chasse aux valeurs codées en dur.
- Thème et fond sont **locaux à l'appareil** (`localStorage`), jamais envoyés au serveur : aucune tâche de ce plan ne touche à `lib/db/schema.ts`.
- Zones tactiles d'au moins 44 px, contraste AA sur les deux thèmes, tout geste doublé par un bouton, focus visible au clavier. Sous `prefers-reduced-motion`, toute animation — y compris le balayage, la roulette et la superposition de match — se réduit à un fondu de 120 ms.
- Un rejet de balayage n'est **jamais** communiqué à l'autre personne : aucun composant n'affiche ni ne demande une information sur les balayages négatifs d'autrui (l'API du plan 2 ne les expose déjà pas).
- Ce plan consomme les routes existantes via `lib/api-client.ts`, jamais `fetch` directement ailleurs. **Une seule exception** : le cookie de session est `HttpOnly` (posé par `poserSession`, plan 2), donc illisible et inexpirable en JavaScript — « quitter le salon » (§7.6) est impossible sans une route serveur dédiée à l'expirer. La tâche 15 ajoute cette unique route, minimale, avant d'implémenter l'écran qui en dépend.
- Un commit par tâche, message en français, à l'impératif.
- Stratégie de test explicite : la logique pure (`lib/*.ts` hors composants) est testée par Vitest, TDD complet, comme dans les plans 1 et 2. Les composants React n'ont pas de test Vitest dédié — ce projet n'a pas d'environnement DOM (`vitest.config.ts` est en `environment: 'node'`) et la spec ne le demande pas. Leur vérification est la compilation stricte (`tsc --noEmit`, `pnpm build`) à chaque tâche, et le parcours réel est prouvé par le test Playwright de la tâche 17.

---

## Ce que les plans 1 et 2 ont livré et que ce plan consomme

| Module | Ce qu'il expose |
|---|---|
| `lib/db/queries/rooms.ts` | Types `RoomSummary`, `MemberSummary` |
| `lib/db/queries/deck.ts` | Types `DeckCard`, `DeckFilters` |
| `lib/db/queries/matches.ts` | Type `MatchRow` |
| `lib/db/schema.ts` | Types `MatchStatus` (`'a_voir' \| 'vu' \| 'abandonne'`), `ProviderKey` (`'netflix' \| 'canal' \| 'disney'`) |
| `lib/match.ts` | `MIN_MEMBERS` (2), `MAX_MEMBERS` (8) |
| `lib/roomcode.ts` | `isValidRoomCode(s)`, `normalizeRoomCode(s)`, `ROOM_CODE_LENGTH` (6) |

Les quinze routes HTTP du plan 2, avec leurs contrats exacts (vérifiés dans le code livré, pas supposés) :

| Route | Méthode | Corps envoyé | Corps reçu (succès) |
|---|---|---|---|
| `/api/rooms` | POST | `{ displayName, expectedMembers, matchThreshold }` | `{ room, member }` |
| `/api/rooms/[code]/join` | POST | `{ displayName }` | `{ room, member }` |
| `/api/rooms/[code]/members` | GET | — | `{ room, members }` |
| `/api/rooms/[code]/claim` | POST | `{ memberId }` | `{ member }` |
| `/api/deck?limit=N` | GET | — | `{ cards }` (ou `{ cards: [], message }` si vide) |
| `/api/deck/count?…` | GET | filtres en query string | `{ count }` |
| `/api/swipes` | POST | `{ movieId, liked }` | `{ match: { movieId, matchId } \| null }` |
| `/api/swipes/last` | DELETE | — | `{ movieId }` |
| `/api/events?since=N` | GET | — | `{ room, members, matches }` |
| `/api/matches?status=…` | GET | — | `{ matches }` |
| `/api/matches/[movieId]` | PATCH | `{ status }` | `{ movieId, status }` |
| `/api/matches/random` | GET | — | `{ match }` |
| `/api/filters` | GET | — | `{ filters }` |
| `/api/filters` | PUT | `DeckFilters` | `{ filters }` |
| `/api/cron/ingest` | GET | (en-tête `Authorization`) | `{ traites, journal }` |

Toutes les erreurs répondent `{ erreur: string }` en français, avec le code de statut HTTP approprié (400/401/404/409/429/500). Le cookie de session (`sp_session`, `HttpOnly`) est posé automatiquement par les routes qui créent ou rejoignent un membre ; aucune tâche de ce plan ne le lit ni ne le manipule directement.

---

## Structure des fichiers

| Fichier | Responsabilité | Tâche |
|---|---|---|
| `themes/tokens.css` | Déclaration des 14 variables `--sp-*`, valeurs neutres de secours | 1 |
| `themes/videoclub.css`, `themes/salle-obscure.css` | Redéfinition des 14 variables par thème, plus les 4 fonds | 1 |
| `lib/theme.ts` | Persistance thème/fond en `localStorage`, hook `useTheme()` | 2 |
| `lib/api-client.ts` | Un wrapper `fetch` typé par route, `ApiClientError` | 3 |
| `lib/room-events.ts`, `lib/use-room-events.ts` | Fusion pure des événements + hook de sondage | 4 |
| `app/page.tsx`, `app/j/[code]/page.tsx` | Accueil, créer/rejoindre, adhésion par lien | 5 |
| `lib/swipe-gesture.ts` | Rotation, validation, opacité du voile — fonctions pures | 6 |
| `components/swipe/MovieCard.tsx`, `CardStack.tsx` | Carte et pile, geste au doigt | 7 |
| `app/salon/page.tsx`, `components/swipe/SwipeControls.tsx` | Écran de balayage, salle d'attente, fin de paquet | 8 |
| `components/swipe/MovieSheet.tsx` | Feuille détail du film | 9 |
| `components/filters/FilterSheet.tsx` | Feuille de filtres | 10 |
| `components/swipe/MatchOverlay.tsx` | Superposition de match, animation par thème | 11 |
| `app/salon/matchs/page.tsx`, `components/matches/MatchGrid.tsx` | Page Nos matchs | 12 |
| `lib/roulette.ts`, `components/matches/RouletteDialog.tsx` | Minuterie pure + roulette | 13 |
| `lib/color-extract.ts` | Extraction de couleurs dominantes (fond teinté) | 14 |
| `components/settings/SettingsSheet.tsx` | Réglages : thème, fond, prénom, quitter | 15 |
| `app/manifest.ts`, `public/icon.svg`, `vercel.json` | Installation mobile, cron Vercel | 16 |
| `playwright.config.ts`, `tests/e2e/*.spec.ts` | Test de bout en bout à deux navigateurs | 17 |

---

## Task 1: Jetons CSS et les deux thèmes

**Files:**
- Create: `themes/tokens.css`, `themes/videoclub.css`, `themes/salle-obscure.css`
- Modify: `app/globals.css`
- Test: `tests/unit/themes.test.ts`

**Interfaces:**
- Consumes: rien
- Produit : les 14 variables `--sp-*` (§8.1 de la spec), définies dans les deux fichiers de thème, sélectionnées via `html[data-theme="videoclub"]` / `html[data-theme="salle-obscure"]`

- [ ] **Step 1: Écrire le test qui échoue**

`tests/unit/themes.test.ts` :

```ts
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
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm vitest run tests/unit/themes.test.ts
```

Attendu : ÉCHEC — les trois fichiers `themes/*.css` n'existent pas encore.

- [ ] **Step 3: Écrire `themes/tokens.css`**

Valeurs de secours neutres, remplacées par les deux thèmes ci-dessous. Ce fichier est importé en premier, avant les thèmes, pour qu'aucune variable ne reste jamais indéfinie même si `data-theme` est absent (première peinture, avant hydratation).

```css
:root {
  --sp-bg: #0e0e0e;
  --sp-bg-2: #1a1a1a;
  --sp-surface: #f5f5f5;
  --sp-ink: #1a1a1a;
  --sp-ink-soft: #6b6b6b;
  --sp-accent: #e4572e;
  --sp-accent-ink: #1a0f0a;
  --sp-danger: #b3261e;
  --sp-radius-card: 20px;
  --sp-radius-pill: 999px;
  --sp-font-display: system-ui, sans-serif;
  --sp-font-meta: ui-monospace, monospace;
  --sp-grain-opacity: 0;
  --sp-shadow-card: 0 12px 32px -8px rgba(0, 0, 0, 0.4);
}

/* Traitement partagé des métadonnées (§7.2 « métadonnées en police à chasse
   fixe » / « petites capitales espacées ») : chaque thème choisit sa police
   via --sp-font-meta, cette classe applique le même traitement structurel
   aux deux. */
.sp-meta {
  font-family: var(--sp-font-meta);
  letter-spacing: 0.04em;
}

/* Grain partagé : chaque thème pose son opacité via --sp-grain-opacity et
   son fond via data-bg (§8.3) ; ce pseudo-élément est le même partout. */
.sp-page {
  position: relative;
  background: var(--sp-bg);
  color: var(--sp-ink);
  min-height: 100dvh;
}

.sp-page::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: var(--sp-grain-opacity);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  z-index: 0;
}
```

- [ ] **Step 4: Écrire `themes/videoclub.css`**

Fond vert sapin, carte carton crème, accent tomate (§8.2). Le fond `bg-2` est volontairement clair (crème atténué), pas une variante du sapin : les bandeaux et feuilles modales sont des panneaux clairs posés sur l'écran sombre, ce qui permet à `--sp-ink` (sombre) de rester juste à la fois sur `--sp-surface` et sur `--sp-bg-2` — la seule façon d'avoir une teinte de texte unique sans la rendre illisible quelque part.

```css
[data-theme='videoclub'] {
  --sp-bg: #0e2e2a;
  --sp-bg-2: #eadfc3;
  --sp-surface: #f3e9d2;
  --sp-ink: #1b140c;
  --sp-ink-soft: #6b5a3e;
  --sp-accent: #e4572e;
  --sp-accent-ink: #1b0d08;
  --sp-danger: #b3261e;
  --sp-radius-card: 20px;
  --sp-radius-pill: 999px;
  --sp-font-display: var(--font-anton), sans-serif;
  --sp-font-meta: var(--font-space-mono), monospace;
  --sp-grain-opacity: 0.05;
  --sp-shadow-card: 0 12px 32px -8px rgba(14, 46, 42, 0.55);
}

/* §8.3 — quatre fonds : uni, grain léger, motif d'étagère, teinté par l'affiche. */
[data-theme='videoclub'][data-bg='1'] {
  --sp-grain-opacity: 0;
}

[data-theme='videoclub'][data-bg='2'] {
  --sp-grain-opacity: 0.08;
}

[data-theme='videoclub'][data-bg='3'] .sp-page {
  background-image:
    repeating-linear-gradient(
      to bottom,
      rgba(243, 233, 210, 0.04) 0,
      rgba(243, 233, 210, 0.04) 2px,
      transparent 2px,
      transparent 96px
    ),
    var(--sp-bg);
}

/* Fond « teinté » (fond 4) : lib/color-extract.ts pose --sp-tint-a/--sp-tint-b
   sur .sp-page en style inline (tâche 14) ; ce dégradé les consomme. */
[data-theme='videoclub'][data-bg='4'] .sp-page {
  background: linear-gradient(
    160deg,
    var(--sp-tint-a, var(--sp-bg)) 0%,
    var(--sp-tint-b, var(--sp-bg)) 100%
  );
  transition: background 600ms ease;
}

/* §8.4 — la carte s'éjecte vers le haut comme une cassette, un bandeau claque dessus. */
[data-theme='videoclub'] .sp-match-card {
  animation: sp-videoclub-eject 480ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

[data-theme='videoclub'] .sp-match-banner {
  animation: sp-videoclub-slam 220ms ease-out 380ms backwards;
}

@keyframes sp-videoclub-eject {
  0% {
    transform: translateY(40px) scale(0.9);
    opacity: 0;
  }
  100% {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}

@keyframes sp-videoclub-slam {
  0% {
    transform: translateY(-16px) rotate(-4deg);
    opacity: 0;
  }
  100% {
    transform: translateY(0) rotate(-2deg);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  [data-theme='videoclub'] .sp-match-card,
  [data-theme='videoclub'] .sp-match-banner {
    animation: sp-fade 120ms ease-out;
  }
}
```

- [ ] **Step 5: Écrire `themes/salle-obscure.css`**

Fond brun charbon, texte os clair, accent laiton (§8.2). Ici tout reste sombre — `bg-2` et `surface` restent proches du fond, donc `--sp-ink` clair (texte os) fonctionne partout sans contradiction, contrairement à Vidéoclub.

```css
[data-theme='salle-obscure'] {
  --sp-bg: #14110e;
  --sp-bg-2: #1e1a15;
  --sp-surface: #201b16;
  --sp-ink: #ede6da;
  --sp-ink-soft: #a89c87;
  --sp-accent: #c9a227;
  --sp-accent-ink: #14110e;
  --sp-danger: #9a2a2a;
  --sp-radius-card: 20px;
  --sp-radius-pill: 999px;
  --sp-font-display: var(--font-cinzel), serif;
  --sp-font-meta: var(--font-eb-garamond), serif;
  --sp-grain-opacity: 0.12;
  --sp-shadow-card: 0 18px 44px -10px rgba(0, 0, 0, 0.8);
}

/* Traitement « petites capitales espacées » (§7.2), propre à ce thème. */
[data-theme='salle-obscure'] .sp-meta {
  font-variant-caps: all-small-caps;
  letter-spacing: 0.12em;
}

/* §8.3 — uni, grain de pellicule + vignettage, texture velours, teinté par l'affiche. */
[data-theme='salle-obscure'][data-bg='1'] {
  --sp-grain-opacity: 0;
}

[data-theme='salle-obscure'][data-bg='2'] {
  --sp-grain-opacity: 0.18;
}

[data-theme='salle-obscure'][data-bg='2'] .sp-page {
  box-shadow: inset 0 0 160px 40px rgba(0, 0, 0, 0.85);
}

[data-theme='salle-obscure'][data-bg='3'] .sp-page {
  background-image:
    repeating-linear-gradient(
      45deg,
      rgba(237, 230, 218, 0.03) 0,
      rgba(237, 230, 218, 0.03) 2px,
      transparent 2px,
      transparent 6px
    ),
    var(--sp-bg);
}

[data-theme='salle-obscure'][data-bg='4'] .sp-page {
  background: linear-gradient(
    160deg,
    var(--sp-tint-a, var(--sp-bg)) 0%,
    var(--sp-tint-b, var(--sp-bg)) 100%
  );
  transition: background 600ms ease;
}

/* §8.4 — fondu au noir puis ouverture d'un rideau sur l'affiche. */
[data-theme='salle-obscure'] .sp-match-backdrop {
  animation: sp-salle-fade-in 320ms ease-in;
}

[data-theme='salle-obscure'] .sp-match-card {
  clip-path: inset(0 50% 0 50%);
  animation: sp-salle-curtain 560ms cubic-bezier(0.16, 1, 0.3, 1) 260ms forwards;
}

@keyframes sp-salle-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes sp-salle-curtain {
  to {
    clip-path: inset(0 0 0 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  [data-theme='salle-obscure'] .sp-match-backdrop,
  [data-theme='salle-obscure'] .sp-match-card {
    animation: sp-fade 120ms ease-out;
    clip-path: none;
  }
}
```

- [ ] **Step 6: Fondu partagé pour `prefers-reduced-motion`, et focus clavier visible**

Ajouter à la fin de `themes/tokens.css` (après le bloc `.sp-page::before`, avant la fermeture du fichier). Le focus visible (§8.5) est posé ici plutôt que dans chaque composant : Tailwind v4 conserve l'anneau de focus par défaut du navigateur sur la plupart des éléments, mais pas sur tous les styles personnalisés de ce projet (boutons sans bordure, pastilles) — une règle explicite et unique évite d'en oublier un.

```css
@keyframes sp-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

:focus-visible {
  outline: 3px solid var(--sp-accent);
  outline-offset: 2px;
}
```

- [ ] **Step 7: Importer les thèmes**

`app/globals.css` :

```css
@import "tailwindcss";
@import "../themes/tokens.css";
@import "../themes/videoclub.css";
@import "../themes/salle-obscure.css";
```

- [ ] **Step 8: Lancer le test pour vérifier qu'il passe**

```bash
pnpm vitest run tests/unit/themes.test.ts
```

Attendu : `4 passed`.

- [ ] **Step 9: Commit**

```bash
git add themes app/globals.css tests/unit/themes.test.ts
git commit -m "Ajoute les jetons CSS et les deux thèmes"
```

---

## Task 2: Bascule de thème et de fond

**Files:**
- Create: `lib/theme.ts`
- Modify: `app/layout.tsx`
- Test: `tests/unit/theme.test.ts`

**Interfaces:**
- Consumes: rien
- Produit :
  - `THEMES: readonly ['videoclub', 'salle-obscure']`, type `Theme`
  - `BACKGROUNDS_PAR_THEME: Record<Theme, readonly ['1', '2', '3', '4']>`
  - `DEFAULT_THEME: Theme` (`'videoclub'`)
  - `lireTheme(storage: Pick<Storage, 'getItem'>): Theme`
  - `lireFond(storage: Pick<Storage, 'getItem'>, theme: Theme): '1' | '2' | '3' | '4'`
  - `ecrireTheme(storage: Pick<Storage, 'setItem'>, theme: Theme): void`
  - `ecrireFond(storage: Pick<Storage, 'setItem'>, theme: Theme, fond: '1' | '2' | '3' | '4'): void`
  - `useTheme(): { theme: Theme; fond: '1' | '2' | '3' | '4'; definirTheme(t: Theme): void; definirFond(f: '1' | '2' | '3' | '4'): void }`

- [ ] **Step 1: Écrire le test qui échoue**

`tests/unit/theme.test.ts` :

```ts
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
  it('rend le thème par défaut quand rien n’est stocké', () => {
    expect(lireTheme(new StockageFictif())).toBe(DEFAULT_THEME)
  })

  it('relit ce qu’on a écrit', () => {
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
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm vitest run tests/unit/theme.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "@/lib/theme"`.

- [ ] **Step 3: Écrire l'implémentation**

`lib/theme.ts` :

```ts
'use client'

import { useCallback, useEffect, useState } from 'react'

export const THEMES = ['videoclub', 'salle-obscure'] as const
export type Theme = (typeof THEMES)[number]
export type Fond = '1' | '2' | '3' | '4'

export const DEFAULT_THEME: Theme = 'videoclub'
const FONDS: readonly Fond[] = ['1', '2', '3', '4']

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
 * visible grâce au script bloquant posé en tâche suivante dans le layout.
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
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
pnpm vitest run tests/unit/theme.test.ts
```

Attendu : `6 passed`.

- [ ] **Step 5: Brancher `<html>` et éviter le flash de thème par défaut**

`app/layout.tsx` :

```tsx
import type { Metadata } from 'next'
import { Anton, Cinzel, EB_Garamond, Space_Mono } from 'next/font/google'
import './globals.css'

export const metadata: Metadata = {
  title: 'Soirée Popcorn',
  description: 'Choisissez un film à deux, en balayant.',
}

const anton = Anton({ subsets: ['latin'], weight: '400', variable: '--font-anton' })
const spaceMono = Space_Mono({ subsets: ['latin'], weight: '400', variable: '--font-space-mono' })
const cinzel = Cinzel({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-cinzel' })
const ebGaramond = EB_Garamond({ subsets: ['latin'], variable: '--font-eb-garamond' })

/**
 * Pose `data-theme`/`data-bg` avant la première peinture, à partir du
 * `localStorage` déjà présent sur cet appareil : sans ce script bloquant,
 * l'écran afficherait une fraction de seconde le thème par défaut avant que
 * `useTheme()` ne corrige après hydratation.
 */
const scriptTheme = `
(function () {
  try {
    var theme = localStorage.getItem('sp-theme') || 'videoclub'
    var fond = localStorage.getItem('sp-bg-' + theme) || '1'
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.bg = fond
  } catch (e) {}
})()
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="fr"
      className={`${anton.variable} ${spaceMono.variable} ${cinzel.variable} ${ebGaramond.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: scriptTheme }} />
      </head>
      <body className="sp-page">{children}</body>
    </html>
  )
}
```

- [ ] **Step 6: Vérifier**

```bash
pnpm exec tsc --noEmit
pnpm build
pnpm test
```

Attendu : compilation propre, suite verte.

- [ ] **Step 7: Commit**

```bash
git add lib/theme.ts app/layout.tsx tests/unit/theme.test.ts
git commit -m "Ajoute la bascule de thème et de fond"
```

---

## Task 3: Client API typé

**Files:**
- Create: `lib/api-client.ts`
- Test: `tests/unit/api-client.test.ts`

**Interfaces:**
- Consumes: types `RoomSummary`/`MemberSummary` (`lib/db/queries/rooms.ts`), `DeckCard`/`DeckFilters` (`lib/db/queries/deck.ts`), `MatchRow` (`lib/db/queries/matches.ts`), `MatchStatus` (`lib/db/schema.ts`) — en `import type` uniquement, jamais de valeur, pour ne rien embarquer du serveur dans le paquet client
- Produit :
  - `class ApiClientError extends Error { status: number }`
  - `creerSalon(input): Promise<{ room: RoomSummary; member: MemberSummary }>`
  - `rejoindreSalon(code, displayName): Promise<{ room: RoomSummary; member: MemberSummary }>`
  - `membresDuSalon(code): Promise<{ room: RoomSummary; members: MemberSummary[] }>`
  - `reprendreIdentite(code, memberId): Promise<{ member: MemberSummary }>`
  - `paquet(limit?): Promise<{ cards: DeckCard[]; message?: string }>`
  - `compterPaquet(filtres): Promise<{ count: number }>`
  - `balayer(movieId, liked): Promise<{ match: { movieId: number; matchId: number } | null }>`
  - `annulerDernierBalayage(): Promise<{ movieId: number }>`
  - `evenements(since): Promise<{ room: RoomSummary; members: MemberSummary[]; matches: MatchRow[] }>`
  - `listerMatchs(status?): Promise<{ matches: MatchRow[] }>`
  - `changerStatutMatch(movieId, status): Promise<{ movieId: number; status: MatchStatus }>`
  - `tirerAuSort(): Promise<MatchRow | null>`
  - `lireFiltres(): Promise<DeckFilters>`
  - `ecrireFiltres(filtres): Promise<DeckFilters>`

- [ ] **Step 1: Écrire le test qui échoue**

`tests/unit/api-client.test.ts` :

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiClientError,
  annulerDernierBalayage,
  balayer,
  creerSalon,
  ecrireFiltres,
  evenements,
  rejoindreSalon,
  tirerAuSort,
} from '@/lib/api-client'

const original = globalThis.fetch

function repondre(corps: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(corps), { status }))
}

beforeEach(() => {
  globalThis.fetch = vi.fn()
})

afterEach(() => {
  globalThis.fetch = original
})

describe('creerSalon', () => {
  it('poste au bon endpoint avec le bon corps', async () => {
    const fetchSimule = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchSimule.mockReturnValue(
      repondre({ room: { code: 'ABCDEF' }, member: { id: '1', displayName: 'Djo' } }),
    )
    await creerSalon({ displayName: 'Djo', expectedMembers: 2, matchThreshold: 2 })
    expect(fetchSimule).toHaveBeenCalledWith(
      '/api/rooms',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'Djo', expectedMembers: 2, matchThreshold: 2 }),
      }),
    )
  })

  it('lève une ApiClientError avec le message français du serveur en cas d’échec', async () => {
    const fetchSimule = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchSimule.mockReturnValue(repondre({ erreur: 'Indiquez un prénom.' }, 400))
    await expect(
      creerSalon({ displayName: '', expectedMembers: 2, matchThreshold: 2 }),
    ).rejects.toMatchObject({ message: 'Indiquez un prénom.', status: 400 })
  })
})

describe('rejoindreSalon', () => {
  it('encode le code dans l’URL', async () => {
    const fetchSimule = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchSimule.mockReturnValue(repondre({ room: {}, member: {} }))
    await rejoindreSalon('AB CD EF', 'Alice')
    expect(fetchSimule).toHaveBeenCalledWith(
      '/api/rooms/AB%20CD%20EF/join',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})

describe('balayer', () => {
  it('poste movieId et liked, rend le match ou null', async () => {
    const fetchSimule = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchSimule.mockReturnValue(repondre({ match: { movieId: 42, matchId: 7 } }))
    const resultat = await balayer(42, true)
    expect(resultat).toEqual({ match: { movieId: 42, matchId: 7 } })
    expect(fetchSimule).toHaveBeenCalledWith(
      '/api/swipes',
      expect.objectContaining({ body: JSON.stringify({ movieId: 42, liked: true }) }),
    )
  })
})

describe('annulerDernierBalayage', () => {
  it('utilise DELETE sans corps', async () => {
    const fetchSimule = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchSimule.mockReturnValue(repondre({ movieId: 5 }))
    const resultat = await annulerDernierBalayage()
    expect(resultat).toEqual({ movieId: 5 })
    expect(fetchSimule).toHaveBeenCalledWith('/api/swipes/last', expect.objectContaining({ method: 'DELETE' }))
  })
})

describe('evenements', () => {
  it('passe since en paramètre de requête', async () => {
    const fetchSimule = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchSimule.mockReturnValue(repondre({ room: {}, members: [], matches: [] }))
    await evenements(12)
    expect(fetchSimule).toHaveBeenCalledWith('/api/events?since=12', expect.anything())
  })
})

describe('tirerAuSort', () => {
  it('rend null sur 404 plutôt que de lever', async () => {
    const fetchSimule = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchSimule.mockReturnValue(repondre({ erreur: 'Aucun film à voir.' }, 404))
    expect(await tirerAuSort()).toBeNull()
  })

  it('propage une autre erreur que 404', async () => {
    const fetchSimule = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchSimule.mockReturnValue(repondre({ erreur: 'Rejoignez un salon avant de continuer.' }, 401))
    await expect(tirerAuSort()).rejects.toBeInstanceOf(ApiClientError)
  })
})

describe('ecrireFiltres', () => {
  it('utilise PUT avec les filtres en corps', async () => {
    const fetchSimule = globalThis.fetch as ReturnType<typeof vi.fn>
    const filtres = {
      genres: [],
      yearFrom: null,
      yearTo: null,
      minRating: 0,
      maxRuntime: null,
      providers: [],
      includeTop200: true,
    }
    fetchSimule.mockReturnValue(repondre({ filters: filtres }))
    const resultat = await ecrireFiltres(filtres)
    expect(resultat).toEqual(filtres)
    expect(fetchSimule).toHaveBeenCalledWith(
      '/api/filters',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify(filtres) }),
    )
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm vitest run tests/unit/api-client.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "@/lib/api-client"`.

- [ ] **Step 3: Écrire l'implémentation**

`lib/api-client.ts` :

```ts
import type { MemberSummary, RoomSummary } from '@/lib/db/queries/rooms'
import type { DeckCard, DeckFilters } from '@/lib/db/queries/deck'
import type { MatchRow } from '@/lib/db/queries/matches'
import type { MatchStatus } from '@/lib/db/schema'

export class ApiClientError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function appeler<T>(url: string, init?: RequestInit): Promise<T> {
  const reponse = await fetch(url, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json', ...init.headers } : init?.headers,
  })
  const corps = await reponse.json()
  if (!reponse.ok) throw new ApiClientError(reponse.status, corps.erreur ?? 'Erreur inconnue.')
  return corps as T
}

const enJson = (valeur: unknown) => JSON.stringify(valeur)

export function creerSalon(input: {
  displayName: string
  expectedMembers: number
  matchThreshold: number
}): Promise<{ room: RoomSummary; member: MemberSummary }> {
  return appeler('/api/rooms', { method: 'POST', body: enJson(input) })
}

export function rejoindreSalon(
  code: string,
  displayName: string,
): Promise<{ room: RoomSummary; member: MemberSummary }> {
  return appeler(`/api/rooms/${encodeURIComponent(code)}/join`, {
    method: 'POST',
    body: enJson({ displayName }),
  })
}

export function membresDuSalon(
  code: string,
): Promise<{ room: RoomSummary; members: MemberSummary[] }> {
  return appeler(`/api/rooms/${encodeURIComponent(code)}/members`)
}

export function reprendreIdentite(
  code: string,
  memberId: string,
): Promise<{ member: MemberSummary }> {
  return appeler(`/api/rooms/${encodeURIComponent(code)}/claim`, {
    method: 'POST',
    body: enJson({ memberId }),
  })
}

export function paquet(limit = 20): Promise<{ cards: DeckCard[]; message?: string }> {
  return appeler(`/api/deck?limit=${limit}`)
}

export function compterPaquet(filtres: DeckFilters): Promise<{ count: number }> {
  const p = new URLSearchParams()
  if (filtres.genres.length) p.set('genres', filtres.genres.join(','))
  if (filtres.yearFrom !== null) p.set('yearFrom', String(filtres.yearFrom))
  if (filtres.yearTo !== null) p.set('yearTo', String(filtres.yearTo))
  if (filtres.minRating > 0) p.set('minRating', String(filtres.minRating))
  if (filtres.maxRuntime !== null) p.set('maxRuntime', String(filtres.maxRuntime))
  if (filtres.providers.length) p.set('providers', filtres.providers.join(','))
  p.set('includeTop200', String(filtres.includeTop200))
  return appeler(`/api/deck/count?${p.toString()}`)
}

export function balayer(
  movieId: number,
  liked: boolean,
): Promise<{ match: { movieId: number; matchId: number } | null }> {
  return appeler('/api/swipes', { method: 'POST', body: enJson({ movieId, liked }) })
}

export function annulerDernierBalayage(): Promise<{ movieId: number }> {
  return appeler('/api/swipes/last', { method: 'DELETE' })
}

export function evenements(
  since: number,
): Promise<{ room: RoomSummary; members: MemberSummary[]; matches: MatchRow[] }> {
  return appeler(`/api/events?since=${since}`)
}

export function listerMatchs(status?: MatchStatus): Promise<{ matches: MatchRow[] }> {
  return appeler(status ? `/api/matches?status=${status}` : '/api/matches')
}

export function changerStatutMatch(
  movieId: number,
  status: MatchStatus,
): Promise<{ movieId: number; status: MatchStatus }> {
  return appeler(`/api/matches/${movieId}`, { method: 'PATCH', body: enJson({ status }) })
}

export async function tirerAuSort(): Promise<MatchRow | null> {
  try {
    const { match } = await appeler<{ match: MatchRow }>('/api/matches/random')
    return match
  } catch (e) {
    if (e instanceof ApiClientError && e.status === 404) return null
    throw e
  }
}

export async function lireFiltres(): Promise<DeckFilters> {
  const { filters } = await appeler<{ filters: DeckFilters }>('/api/filters')
  return filters
}

export async function ecrireFiltres(filtres: DeckFilters): Promise<DeckFilters> {
  const { filters } = await appeler<{ filters: DeckFilters }>('/api/filters', {
    method: 'PUT',
    body: enJson(filtres),
  })
  return filters
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
pnpm vitest run tests/unit/api-client.test.ts
```

Attendu : `9 passed`.

- [ ] **Step 5: Vérifier la compilation**

```bash
pnpm exec tsc --noEmit
```

Attendu : propre — en particulier, aucune erreur signalant qu'un import de type entraîne du code serveur (confirmerait que `import type` est bien effacé).

- [ ] **Step 6: Commit**

```bash
git add lib/api-client.ts tests/unit/api-client.test.ts
git commit -m "Ajoute le client API typé"
```

---

## Task 4: Suivi des événements du salon

**Files:**
- Create: `lib/room-events.ts`, `lib/use-room-events.ts`
- Test: `tests/unit/room-events.test.ts`

**Interfaces:**
- Consumes: `evenements`, `ApiClientError` (`lib/api-client.ts`)
- Produit :
  - `interface EtatSalon { room: RoomSummary | null; members: MemberSummary[]; matches: MatchRow[]; curseur: number; pretAffiche: boolean; sansSession: boolean }`
  - `ETAT_INITIAL: EtatSalon`
  - `fusionnerEvenements(etat: EtatSalon, reponse: { room, members, matches }): EtatSalon`
  - `useRoomEvents(intervalleMs?: number): EtatSalon`

- [ ] **Step 1: Écrire le test qui échoue**

`tests/unit/room-events.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { ETAT_INITIAL, fusionnerEvenements } from '@/lib/room-events'
import type { MatchRow } from '@/lib/db/queries/matches'
import type { RoomSummary } from '@/lib/db/queries/rooms'

function match(matchId: number): MatchRow {
  return {
    matchId,
    status: 'a_voir',
    createdAt: new Date().toISOString(),
    movie: {
      id: matchId,
      title: `Film ${matchId}`,
      overview: null,
      posterPath: null,
      releaseDate: null,
      releaseYear: null,
      runtime: null,
      voteAverage: null,
      director: null,
      providers: [],
      tags: [],
    },
  }
}

const salon: RoomSummary = {
  code: 'ABCDEF',
  expectedMembers: 2,
  matchThreshold: 2,
  memberCount: 2,
  complete: true,
}

describe('fusionnerEvenements', () => {
  it('part d’un état initial sans session', () => {
    expect(ETAT_INITIAL.sansSession).toBe(false)
    expect(ETAT_INITIAL.pretAffiche).toBe(false)
    expect(ETAT_INITIAL.curseur).toBe(0)
  })

  it('accumule les nouveaux matchs sans perdre les précédents', () => {
    const premier = fusionnerEvenements(ETAT_INITIAL, {
      room: salon,
      members: [],
      matches: [match(1)],
    })
    expect(premier.matches.map((m) => m.matchId)).toEqual([1])
    expect(premier.curseur).toBe(1)

    const second = fusionnerEvenements(premier, {
      room: salon,
      members: [],
      matches: [match(2), match(3)],
    })
    expect(second.matches.map((m) => m.matchId)).toEqual([1, 2, 3])
    expect(second.curseur).toBe(3)
  })

  it('ne fait pas régresser le curseur quand rien de neuf n’arrive', () => {
    const premier = fusionnerEvenements(ETAT_INITIAL, {
      room: salon,
      members: [],
      matches: [match(5)],
    })
    const vide = fusionnerEvenements(premier, { room: salon, members: [], matches: [] })
    expect(vide.curseur).toBe(5)
    expect(vide.matches).toHaveLength(1)
  })

  it('marque prêt après le premier événement reçu', () => {
    expect(ETAT_INITIAL.pretAffiche).toBe(false)
    const apres = fusionnerEvenements(ETAT_INITIAL, { room: salon, members: [], matches: [] })
    expect(apres.pretAffiche).toBe(true)
  })

  it('remet sansSession à false à chaque événement reçu', () => {
    const enErreur = { ...ETAT_INITIAL, sansSession: true }
    const apres = fusionnerEvenements(enErreur, { room: salon, members: [], matches: [] })
    expect(apres.sansSession).toBe(false)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm vitest run tests/unit/room-events.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "@/lib/room-events"`.

- [ ] **Step 3: Écrire `lib/room-events.ts`**

```ts
import type { MatchRow } from '@/lib/db/queries/matches'
import type { MemberSummary, RoomSummary } from '@/lib/db/queries/rooms'

export interface EtatSalon {
  room: RoomSummary | null
  members: MemberSummary[]
  matches: MatchRow[]
  curseur: number
  pretAffiche: boolean
  sansSession: boolean
}

export const ETAT_INITIAL: EtatSalon = {
  room: null,
  members: [],
  matches: [],
  curseur: 0,
  pretAffiche: false,
  sansSession: false,
}

export function fusionnerEvenements(
  etat: EtatSalon,
  reponse: { room: RoomSummary; members: MemberSummary[]; matches: MatchRow[] },
): EtatSalon {
  const curseur = reponse.matches.reduce((max, m) => Math.max(max, m.matchId), etat.curseur)
  return {
    room: reponse.room,
    members: reponse.members,
    matches: [...etat.matches, ...reponse.matches],
    curseur,
    pretAffiche: true,
    sansSession: false,
  }
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
pnpm vitest run tests/unit/room-events.test.ts
```

Attendu : `5 passed`.

- [ ] **Step 5: Écrire le hook de sondage `lib/use-room-events.ts`**

Non testé par Vitest (dépend de `setInterval`/DOM) — s'appuie entièrement sur `fusionnerEvenements`, déjà prouvée juste.

```ts
'use client'

import { useEffect, useRef, useState } from 'react'
import { ApiClientError, evenements } from '@/lib/api-client'
import { ETAT_INITIAL, fusionnerEvenements, type EtatSalon } from '@/lib/room-events'

const INTERVALLE_PAR_DEFAUT_MS = 4000

export function useRoomEvents(intervalleMs = INTERVALLE_PAR_DEFAUT_MS): EtatSalon {
  const [etat, setEtat] = useState<EtatSalon>(ETAT_INITIAL)
  const curseurRef = useRef(0)

  useEffect(() => {
    let annule = false

    async function rafraichir() {
      try {
        const reponse = await evenements(curseurRef.current)
        if (annule) return
        setEtat((precedent) => {
          const suivant = fusionnerEvenements(precedent, reponse)
          curseurRef.current = suivant.curseur
          return suivant
        })
      } catch (e) {
        if (annule) return
        if (e instanceof ApiClientError && e.status === 401) {
          setEtat({ ...ETAT_INITIAL, sansSession: true })
        }
      }
    }

    rafraichir()
    const id = setInterval(rafraichir, intervalleMs)
    return () => {
      annule = true
      clearInterval(id)
    }
  }, [intervalleMs])

  return etat
}
```

- [ ] **Step 6: Vérifier**

```bash
pnpm exec tsc --noEmit
pnpm test
```

- [ ] **Step 7: Commit**

```bash
git add lib/room-events.ts lib/use-room-events.ts tests/unit/room-events.test.ts
git commit -m "Ajoute le suivi des événements du salon"
```

---

## Task 5: Accueil — créer et rejoindre un salon

**Files:**
- Create: `app/j/[code]/page.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `creerSalon`, `rejoindreSalon`, `evenements` (`lib/api-client.ts`), `MIN_MEMBERS`/`MAX_MEMBERS` (`lib/match.ts`), `isValidRoomCode`/`normalizeRoomCode` (`lib/roomcode.ts`)
- Produit : `app/page.tsx` (accueil), `app/j/[code]/page.tsx` (adhésion par lien, §7.1)

- [ ] **Step 1: Écrire l'accueil**

Redirige vers `/salon` si une session valide existe déjà (§7.1 : « Un visiteur déjà porteur d'un cookie valide est redirigé vers le balayage »), sondée via `evenements(0)` — le cookie est `HttpOnly`, donc illisible en JavaScript ; c'est la seule façon fiable de savoir si on est déjà dans un salon.

`app/page.tsx` :

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApiClientError, creerSalon, evenements, rejoindreSalon } from '@/lib/api-client'
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
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 p-6">
        <h1 style={{ fontFamily: 'var(--sp-font-display)' }} className="text-3xl">
          Soirée Popcorn
        </h1>
        <button
          className="min-h-11 w-full rounded-[var(--sp-radius-pill)] bg-[var(--sp-accent)] px-6 py-3 text-[var(--sp-accent-ink)]"
          onClick={() => setMode('creer')}
        >
          Créer un salon
        </button>
        <button
          className="min-h-11 w-full rounded-[var(--sp-radius-pill)] border border-[var(--sp-ink-soft)] px-6 py-3"
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
              className="min-h-11 rounded-[var(--sp-radius-pill)] border border-[var(--sp-ink-soft)] px-4"
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
          style={{ borderColor: 'var(--sp-ink-soft)' }}
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
            className="min-h-11 rounded-[var(--sp-radius-pill)] border border-[var(--sp-ink-soft)] px-4 uppercase"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1">
          Ton prénom
          <input
            className="min-h-11 rounded-[var(--sp-radius-pill)] border border-[var(--sp-ink-soft)] px-4"
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
```

- [ ] **Step 2: Écrire l'adhésion par lien**

`app/j/[code]/page.tsx` — court-circuite la saisie du code (§7.1) en pré-remplissant et masquant le champ.

```tsx
'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApiClientError, rejoindreSalon } from '@/lib/api-client'
import { isValidRoomCode, normalizeRoomCode } from '@/lib/roomcode'

export default function AdhesionParLien({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const router = useRouter()
  const [prenom, setPrenom] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  const codeNormalise = normalizeRoomCode(code)
  const valide = isValidRoomCode(codeNormalise)

  useEffect(() => {
    if (!valide) setErreur('Ce lien n’est pas valide.')
  }, [valide])

  async function soumettre(e: React.FormEvent) {
    e.preventDefault()
    setEnCours(true)
    setErreur(null)
    try {
      await rejoindreSalon(codeNormalise, prenom)
      router.push('/salon')
    } catch (e) {
      setErreur(e instanceof ApiClientError ? e.message : 'Une erreur est survenue.')
    } finally {
      setEnCours(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl">Rejoindre le salon {codeNormalise}</h1>
      <form onSubmit={soumettre} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          Ton prénom
          <input
            className="min-h-11 rounded-[var(--sp-radius-pill)] border border-[var(--sp-ink-soft)] px-4"
            value={prenom}
            onChange={(e) => setPrenom(e.target.value)}
            disabled={!valide}
            required
          />
        </label>
        {erreur && <p className="text-[var(--sp-danger)]">{erreur}</p>}
        <button
          type="submit"
          disabled={enCours || !valide}
          className="min-h-11 rounded-[var(--sp-radius-pill)] bg-[var(--sp-accent)] px-6 py-3 text-[var(--sp-accent-ink)] disabled:opacity-60"
        >
          {enCours ? 'Adhésion…' : 'Rejoindre'}
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 3: Vérifier**

```bash
pnpm exec tsc --noEmit
pnpm build
```

Attendu : compilation propre, `next build` inclut `/` et `/j/[code]` dans le manifeste de routes.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx app/j
git commit -m "Ajoute l'accueil, la création et l'adhésion à un salon"
```

---

## Task 6: Géométrie du balayage

**Files:**
- Create: `lib/swipe-gesture.ts`
- Test: `tests/unit/swipe-gesture.test.ts`

**Interfaces:**
- Consumes: rien
- Produit :
  - `SEUIL_DISTANCE_RATIO = 0.33`
  - `SEUIL_VITESSE_PX_S = 500`
  - `ROTATION_MAX_DEG = 15`
  - `rotationPourDelta(deltaX: number): number`
  - `balayageValide(deltaX: number, vitesseX: number, largeur: number): 'aime' | 'rejette' | null`
  - `opaciteVoile(deltaX: number, largeur: number): number`
  - `POSITIONS_PILE: readonly { echelle: number; decalageY: number }[]` (3 entrées, §7.2)

- [ ] **Step 1: Écrire le test qui échoue**

`tests/unit/swipe-gesture.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import {
  POSITIONS_PILE,
  balayageValide,
  opaciteVoile,
  rotationPourDelta,
} from '@/lib/swipe-gesture'

describe('rotationPourDelta', () => {
  it('vaut deltaX / 18 dans la zone non plafonnée', () => {
    expect(rotationPourDelta(90)).toBeCloseTo(5)
    expect(rotationPourDelta(-90)).toBeCloseTo(-5)
  })

  it('est plafonnée à 15°', () => {
    expect(rotationPourDelta(1000)).toBe(15)
    expect(rotationPourDelta(-1000)).toBe(-15)
  })

  it('vaut 0 sans déplacement', () => {
    expect(rotationPourDelta(0)).toBe(0)
  })
})

describe('balayageValide', () => {
  const LARGEUR = 360

  it('valide au-delà de 33 % de la largeur, à vitesse nulle', () => {
    expect(balayageValide(0.34 * LARGEUR, 0, LARGEUR)) .toBe('aime')
    expect(balayageValide(-0.34 * LARGEUR, 0, LARGEUR)).toBe('rejette')
  })

  it('ne valide pas en deçà de 33 % à vitesse nulle', () => {
    expect(balayageValide(0.2 * LARGEUR, 0, LARGEUR)).toBeNull()
  })

  it('valide au-delà de 500 px/s même sur une courte distance', () => {
    expect(balayageValide(10, 600, LARGEUR)).toBe('aime')
    expect(balayageValide(-10, -600, LARGEUR)).toBe('rejette')
  })

  it('rejette (au sens : renvoie « rejette ») quand deltaX est négatif', () => {
    expect(balayageValide(-0.5 * LARGEUR, 0, LARGEUR)).toBe('rejette')
  })
})

describe('opaciteVoile', () => {
  const LARGEUR = 360

  it('vaut 0 sans déplacement', () => {
    expect(opaciteVoile(0, LARGEUR)).toBe(0)
  })

  it('atteint 1 pile au seuil de validation', () => {
    expect(opaciteVoile(0.33 * LARGEUR, LARGEUR)).toBeCloseTo(1)
  })

  it('reste plafonnée à 1 au-delà du seuil', () => {
    expect(opaciteVoile(LARGEUR, LARGEUR)).toBe(1)
  })

  it('est symétrique en valeur absolue', () => {
    expect(opaciteVoile(-0.2 * LARGEUR, LARGEUR)).toBeCloseTo(opaciteVoile(0.2 * LARGEUR, LARGEUR))
  })
})

describe('POSITIONS_PILE', () => {
  it('a exactement trois positions, échelles décroissantes', () => {
    expect(POSITIONS_PILE).toHaveLength(3)
    expect(POSITIONS_PILE.map((p) => p.echelle)).toEqual([1, 0.95, 0.9])
    expect(POSITIONS_PILE.map((p) => p.decalageY)).toEqual([0, 10, 20])
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm vitest run tests/unit/swipe-gesture.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "@/lib/swipe-gesture"`.

- [ ] **Step 3: Écrire l'implémentation**

`lib/swipe-gesture.ts` :

```ts
/** §7.2 : la carte suit le doigt, l'inclinaison vaut deltaX / 18°, plafonnée à 15°. */
export const ROTATION_MAX_DEG = 15
const DIVISEUR_ROTATION = 18

/** §7.2 : validé au-delà de 33 % de la largeur de l'écran ou 500 px/s. */
export const SEUIL_DISTANCE_RATIO = 0.33
export const SEUIL_VITESSE_PX_S = 500

export const POSITIONS_PILE = [
  { echelle: 1, decalageY: 0 },
  { echelle: 0.95, decalageY: 10 },
  { echelle: 0.9, decalageY: 20 },
] as const

export function rotationPourDelta(deltaX: number): number {
  const rotation = deltaX / DIVISEUR_ROTATION
  return Math.max(-ROTATION_MAX_DEG, Math.min(ROTATION_MAX_DEG, rotation))
}

export function balayageValide(
  deltaX: number,
  vitesseX: number,
  largeur: number,
): 'aime' | 'rejette' | null {
  const distanceSuffisante = Math.abs(deltaX) > SEUIL_DISTANCE_RATIO * largeur
  const vitesseSuffisante = Math.abs(vitesseX) > SEUIL_VITESSE_PX_S
  if (!distanceSuffisante && !vitesseSuffisante) return null
  // Sur une validation par vitesse à distance quasi nulle, c'est le sens du
  // geste (vitesse) qui décide ; sinon c'est le sens du déplacement.
  const sens = Math.abs(deltaX) > 1 ? deltaX : vitesseX
  return sens > 0 ? 'aime' : 'rejette'
}

export function opaciteVoile(deltaX: number, largeur: number): number {
  const ratio = Math.abs(deltaX) / (SEUIL_DISTANCE_RATIO * largeur)
  return Math.max(0, Math.min(1, ratio))
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
pnpm vitest run tests/unit/swipe-gesture.test.ts
```

Attendu : `13 passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/swipe-gesture.ts tests/unit/swipe-gesture.test.ts
git commit -m "Ajoute la géométrie pure du balayage"
```

---

## Task 7: Carte de film et pile de balayage

**Files:**
- Create: `components/swipe/MovieCard.tsx`, `components/swipe/CardStack.tsx`
- Modify: `package.json` (dépendance `motion`)

**Interfaces:**
- Consumes: `DeckCard` (`lib/db/queries/deck.ts`), `POSITIONS_PILE`/`rotationPourDelta`/`balayageValide`/`opaciteVoile` (`lib/swipe-gesture.ts`)
- Produit :
  - `MovieCard(props: { film: DeckCard; interactive?: boolean }): JSX.Element`
  - `CardStack(props: { cartes: DeckCard[]; onBalayage(id: number, sens: 'aime' | 'rejette'): void; onDetail(id: number): void }): JSX.Element`

- [ ] **Step 1: Installer Motion**

```bash
pnpm add motion
```

- [ ] **Step 2: Écrire `MovieCard`**

§7.2 : fond (affiche), titre, année, durée, note, jusqu'à quatre tags, deux lignes de synopsis avec lien *lire*. `onLireLaSuite` ouvre la feuille détail (tâche 9) ; ce composant ne la contient pas, il expose juste le déclencheur.

`components/swipe/MovieCard.tsx` :

```tsx
import Image from 'next/image'
import type { DeckCard } from '@/lib/db/queries/deck'

export function MovieCard({
  film,
  onLireLaSuite,
}: {
  film: DeckCard
  onLireLaSuite?: () => void
}) {
  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden"
      style={{
        borderRadius: 'var(--sp-radius-card)',
        background: 'var(--sp-surface)',
        boxShadow: 'var(--sp-shadow-card)',
        color: 'var(--sp-ink)',
      }}
    >
      {film.posterPath ? (
        <Image
          src={`https://image.tmdb.org/t/p/w500${film.posterPath}`}
          alt={film.title}
          fill
          sizes="(max-width: 480px) 100vw, 400px"
          className="object-cover"
          priority={false}
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: 'var(--sp-bg-2)' }} />
      )}
      <div
        className="relative mt-auto flex flex-col gap-2 p-4"
        style={{ background: 'linear-gradient(to top, var(--sp-surface) 55%, transparent)' }}
      >
        <h2 style={{ fontFamily: 'var(--sp-font-display)' }} className="text-2xl leading-tight">
          {film.title}
        </h2>
        <p className="sp-meta text-sm" style={{ color: 'var(--sp-ink-soft)' }}>
          {[film.releaseYear, film.runtime && `${film.runtime} min`, film.voteAverage && `★ ${film.voteAverage}`]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {film.tags.length > 0 && (
          <ul className="flex flex-wrap gap-1">
            {film.tags.slice(0, 4).map((tag) => (
              <li
                key={tag}
                className="px-2 py-0.5 text-xs"
                style={{
                  borderRadius: 'var(--sp-radius-pill)',
                  background: 'var(--sp-accent)',
                  color: 'var(--sp-accent-ink)',
                }}
              >
                {tag}
              </li>
            ))}
          </ul>
        )}
        {film.overview && (
          <p className="line-clamp-2 text-sm">
            {film.overview}{' '}
            {onLireLaSuite && (
              <button
                type="button"
                onClick={onLireLaSuite}
                className="underline"
                style={{ color: 'var(--sp-accent)' }}
              >
                lire
              </button>
            )}
          </p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Écrire `CardStack`**

Seule la carte du dessus (`POSITIONS_PILE[0]`) est interactive — les deux suivantes n'affichent que leur échelle et leur décalage (§7.2). Sortie : translation 120 % avec rotation, 280 ms ; la suivante passe de 0,95 à 1 en 200 ms — Motion anime ces deux transitions par la disparition/apparition du composant dans `AnimatePresence`.

`components/swipe/CardStack.tsx` :

```tsx
'use client'

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react'
import { useState } from 'react'
import type { DeckCard } from '@/lib/db/queries/deck'
import { MovieCard } from '@/components/swipe/MovieCard'
import {
  POSITIONS_PILE,
  balayageValide,
  opaciteVoile,
  rotationPourDelta,
} from '@/lib/swipe-gesture'

export function CardStack({
  cartes,
  onBalayage,
  onDetail,
}: {
  cartes: DeckCard[]
  onBalayage: (id: number, sens: 'aime' | 'rejette') => void
  onDetail: (id: number) => void
}) {
  const visibles = cartes.slice(0, 3)

  return (
    <div className="relative mx-auto h-[70dvh] w-full max-w-sm">
      <AnimatePresence>
        {visibles
          .map((film, index) => (
            <CarteDeplacable
              key={film.id}
              film={film}
              position={POSITIONS_PILE[index]}
              interactive={index === 0}
              onBalayage={onBalayage}
              onDetail={onDetail}
            />
          ))
          .reverse()}
      </AnimatePresence>
    </div>
  )
}

function CarteDeplacable({
  film,
  position,
  interactive,
  onBalayage,
  onDetail,
}: {
  film: DeckCard
  position: (typeof POSITIONS_PILE)[number]
  interactive: boolean
  onBalayage: (id: number, sens: 'aime' | 'rejette') => void
  onDetail: (id: number) => void
}) {
  const x = useMotionValue(0)
  const [largeur, setLargeur] = useState(360)
  const rotation = useTransform(x, (deltaX) => rotationPourDelta(deltaX))
  const opaciteAime = useTransform(x, (deltaX) => (deltaX > 0 ? opaciteVoile(deltaX, largeur) : 0))
  const opaciteRejet = useTransform(x, (deltaX) => (deltaX < 0 ? opaciteVoile(deltaX, largeur) : 0))

  // §8.5 : sous prefers-reduced-motion, toute animation — y compris le
  // balayage — se réduit à un fondu de 120 ms. Le geste reste possible (ce
  // n'est pas une animation mais une interaction, doublée par les boutons de
  // toute façon), seules l'apparition/sortie perdent leur mouvement physique.
  const reduit = useReducedMotion()

  return (
    <motion.div
      className="absolute inset-0"
      style={interactive ? { x, rotate: reduit ? 0 : rotation } : undefined}
      initial={{ scale: reduit ? 1 : position.echelle, y: reduit ? 0 : position.decalageY, opacity: 0 }}
      animate={{ scale: reduit ? 1 : position.echelle, y: reduit ? 0 : position.decalageY, opacity: 1 }}
      exit={
        reduit
          ? { opacity: 0 }
          : { x: x.get() > 0 ? 480 : -480, rotate: x.get() > 0 ? 20 : -20, opacity: 0 }
      }
      transition={reduit ? { duration: 0.12, ease: 'easeOut' } : { duration: 0.28, ease: 'easeIn' }}
      drag={interactive ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.6}
      onDragStart={(_, info) => setLargeur(window.innerWidth)}
      onDragEnd={(_, info) => {
        const sens = balayageValide(info.offset.x, info.velocity.x, largeur)
        if (sens) onBalayage(film.id, sens)
      }}
    >
      <MovieCard film={film} onLireLaSuite={interactive ? () => onDetail(film.id) : undefined} />
      {interactive && (
        <>
          <motion.div
            className="pointer-events-none absolute inset-0 flex items-start justify-end p-6"
            style={{ opacity: opaciteAime, borderRadius: 'var(--sp-radius-card)' }}
          >
            <span
              className="px-4 py-1 text-lg font-bold"
              style={{
                border: '3px solid var(--sp-accent)',
                color: 'var(--sp-accent)',
                borderRadius: 'var(--sp-radius-pill)',
                transform: 'rotate(-12deg)',
              }}
            >
              J'aime
            </span>
          </motion.div>
          <motion.div
            className="pointer-events-none absolute inset-0 flex items-start justify-start p-6"
            style={{ opacity: opaciteRejet, borderRadius: 'var(--sp-radius-card)' }}
          >
            <span
              className="px-4 py-1 text-lg font-bold"
              style={{
                border: '3px solid var(--sp-danger)',
                color: 'var(--sp-danger)',
                borderRadius: 'var(--sp-radius-pill)',
                transform: 'rotate(12deg)',
              }}
            >
              Non
            </span>
          </motion.div>
        </>
      )}
    </motion.div>
  )
}
```

- [ ] **Step 4: Vérifier**

```bash
pnpm exec tsc --noEmit
pnpm build
```

Attendu : compilation propre. Corriger tout écart d'API avec la version de `motion` installée (le nom des props `drag`/`onDragEnd`/`useMotionValue` est stable depuis Framer Motion, mais vérifier `pnpm ls motion` si `tsc` signale un import manquant).

- [ ] **Step 5: Commit**

```bash
git add components/swipe/MovieCard.tsx components/swipe/CardStack.tsx package.json pnpm-lock.yaml
git commit -m "Ajoute la carte de film et la pile de balayage"
```

---

## Task 8: Écran de balayage — contrôles, salle d'attente, fin de paquet

**Files:**
- Create: `components/swipe/SwipeControls.tsx`
- Modify: `app/salon/page.tsx` (nouveau fichier malgré « Modify » : remplace le futur composant par défaut si `next` en a généré un vide — sinon Create)

**Interfaces:**
- Consumes: `paquet`/`balayer`/`annulerDernierBalayage`/`lireFiltres` (`lib/api-client.ts`), `useRoomEvents` (`lib/use-room-events.ts`), `CardStack` (tâche 7)
- Produit : `app/salon/page.tsx`, `SwipeControls(props: { onRembobiner(): void; onRejeter(): void; onAimer(): void; onDetail(): void; rembobinageDisponible: boolean }): JSX.Element`

- [ ] **Step 1: Écrire `SwipeControls`**

§7.2 : rembobiner, rejeter, aimer, détails — tout geste doublé par un bouton, zones tactiles ≥ 44 px (contrainte globale).

`components/swipe/SwipeControls.tsx` :

```tsx
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
  const bouton = 'flex h-14 w-14 items-center justify-center rounded-full text-2xl'
  return (
    <div className="flex items-center justify-center gap-4 p-4">
      <button
        type="button"
        aria-label="Rembobiner le dernier balayage"
        onClick={onRembobiner}
        disabled={!rembobinageDisponible}
        className={bouton}
        style={{ background: 'var(--sp-bg-2)', color: 'var(--sp-ink)', opacity: rembobinageDisponible ? 1 : 0.4 }}
      >
        ↺
      </button>
      <button
        type="button"
        aria-label="Rejeter"
        onClick={onRejeter}
        className={bouton}
        style={{ background: 'var(--sp-surface)', color: 'var(--sp-danger)', border: '2px solid var(--sp-danger)' }}
      >
        ✕
      </button>
      <button
        type="button"
        aria-label="Voir les détails"
        onClick={onDetail}
        className={bouton}
        style={{ background: 'var(--sp-bg-2)', color: 'var(--sp-ink)' }}
      >
        ⓘ
      </button>
      <button
        type="button"
        aria-label="J'aime"
        onClick={onAimer}
        className={bouton}
        style={{ background: 'var(--sp-accent)', color: 'var(--sp-accent-ink)' }}
      >
        ♥
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Écrire l'écran `/salon`**

Salle d'attente (§7.2, bandeau permanent tant que l'effectif n'est pas complet), fin de paquet (message explicite + rappel des filtres actifs), barre supérieure (code, compteur de matchs, filtres, réglages — les feuilles associées arrivent aux tâches 9/10/15, ce composant expose seulement les points d'entrée).

`app/salon/page.tsx` :

```tsx
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
```

- [ ] **Step 3: Vérifier**

```bash
pnpm exec tsc --noEmit
pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add components/swipe/SwipeControls.tsx app/salon/page.tsx
git commit -m "Ajoute l'écran de balayage, la salle d'attente et la fin de paquet"
```

---

## Task 9: Feuille détail du film

**Files:**
- Create: `components/swipe/MovieSheet.tsx`
- Modify: `app/salon/page.tsx` (branche les deux points d'entrée laissés en tâche 8)

**Interfaces:**
- Consumes: `DeckCard` (`lib/db/queries/deck.ts`), `ProviderKey` (`lib/db/schema.ts`)
- Produit : `MovieSheet(props: { film: DeckCard | null; onFermer(): void }): JSX.Element`

- [ ] **Step 1: Écrire `MovieSheet`**

§7.3 : panneau qui monte depuis le bas, affiche/titre/titre original — non stocké côté serveur (§4 modèle de données du plan 1 : seul `title` existe) donc omis —, date de sortie complète, durée, note et nombre de votes — `voteCount` n'existe pas non plus dans `DeckCard` : seule `voteAverage` est exposée par l'API du plan 2, donc affichée seule —, réalisateur, tous les tags, plateformes, synopsis intégral. Fermeture par bouton (le balayage vers le bas est un geste Motion, ajouté ici en confort, jamais seul moyen de fermer — contrainte globale).

`components/swipe/MovieSheet.tsx` :

```tsx
'use client'

import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import type { DeckCard } from '@/lib/db/queries/deck'

const NOMS_PLATEFORMES: Record<string, string> = {
  netflix: 'Netflix',
  canal: 'MyCanal',
  disney: 'Disney+',
}

export function MovieSheet({ film, onFermer }: { film: DeckCard | null; onFermer: () => void }) {
  // §8.5 : la feuille glisse par ressort normalement, se réduit à un fondu de
  // 120 ms sous prefers-reduced-motion.
  const reduit = useReducedMotion()

  return (
    <AnimatePresence>
      {film && (
        <motion.div
          className="fixed inset-0 z-20 flex items-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onFermer}
        >
          <div className="absolute inset-0" style={{ background: 'rgba(0, 0, 0, 0.5)' }} />
          <motion.div
            className="relative z-10 max-h-[85dvh] w-full overflow-y-auto p-6"
            style={{
              background: 'var(--sp-bg-2)',
              color: 'var(--sp-ink)',
              borderTopLeftRadius: 'var(--sp-radius-card)',
              borderTopRightRadius: 'var(--sp-radius-card)',
            }}
            initial={reduit ? { opacity: 0 } : { y: '100%' }}
            animate={reduit ? { opacity: 1 } : { y: 0 }}
            exit={reduit ? { opacity: 0 } : { y: '100%' }}
            transition={reduit ? { duration: 0.12, ease: 'easeOut' } : { type: 'spring', damping: 30, stiffness: 300 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120) onFermer()
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onFermer}
              aria-label="Fermer"
              className="mb-4 h-11 w-11 rounded-full"
              style={{ background: 'var(--sp-surface)' }}
            >
              ↓
            </button>
            <h2 style={{ fontFamily: 'var(--sp-font-display)' }} className="text-2xl">
              {film.title}
            </h2>
            <p className="sp-meta mt-1 text-sm" style={{ color: 'var(--sp-ink-soft)' }}>
              {[film.releaseDate, film.runtime && `${film.runtime} min`, film.voteAverage && `★ ${film.voteAverage}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {film.director && <p className="mt-2">Réalisé par {film.director}</p>}
            {film.tags.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1">
                {film.tags.map((tag) => (
                  <li
                    key={tag}
                    className="px-2 py-0.5 text-xs"
                    style={{
                      borderRadius: 'var(--sp-radius-pill)',
                      background: 'var(--sp-accent)',
                      color: 'var(--sp-accent-ink)',
                    }}
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            )}
            {film.providers.length > 0 && (
              <p className="mt-3 sp-meta text-sm">
                Disponible sur {film.providers.map((p) => NOMS_PLATEFORMES[p] ?? p).join(', ')}
              </p>
            )}
            {film.overview && <p className="mt-4">{film.overview}</p>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 2: Brancher dans `/salon`**

Dans `app/salon/page.tsx`, ajouter l'état et remplacer les deux commentaires `/* branché en tâche 9 */` :

```tsx
// Ajouter à côté des autres useState :
const [filmDetail, setFilmDetail] = useState<DeckCard | null>(null)

// Importer en tête de fichier :
import { MovieSheet } from '@/components/swipe/MovieSheet'

// Remplacer le premier commentaire (dans <CardStack onDetail={...}>) :
onDetail={(id) => setFilmDetail(cartes.find((c) => c.id === id) ?? null)}

// Remplacer le second commentaire (dans <SwipeControls onDetail={...}>) :
onDetail={() => setFilmDetail(carteHaut ?? null)}

// Juste avant la fermeture de <main> :
<MovieSheet film={filmDetail} onFermer={() => setFilmDetail(null)} />
```

- [ ] **Step 3: Vérifier**

```bash
pnpm exec tsc --noEmit
pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add components/swipe/MovieSheet.tsx app/salon/page.tsx
git commit -m "Ajoute la feuille détail du film"
```

---

## Task 10: Feuille de filtres

**Files:**
- Create: `components/filters/FilterSheet.tsx`
- Modify: `app/salon/page.tsx`

**Interfaces:**
- Consumes: `lireFiltres`/`ecrireFiltres`/`compterPaquet` (`lib/api-client.ts`), `DeckFilters`/`ProviderKey`
- Produit : `FilterSheet(props: { ouverte: boolean; onFermer(): void; onAppliquer(): void }): JSX.Element`

- [ ] **Step 1: Écrire `FilterSheet`**

§7.4 : genres (multi), période (deux curseurs d'année), note minimum, durée maximum, plateformes (Netflix / MyCanal / Disney+ / Top 200), réinitialisation, compte en direct. Les genres ne sont pas énumérés par l'API (pas de route `/api/genres`) — cette tâche utilise une liste fixe couvrant le catalogue TMDB courant, cohérente avec `lib/keywords.ts` du plan 1 qui ne traduit que les mots-clés, pas les genres bruts déjà en français dans la base.

```tsx
'use client'

import { useEffect, useState } from 'react'
import { compterPaquet, ecrireFiltres, lireFiltres } from '@/lib/api-client'
import type { DeckFilters } from '@/lib/db/queries/deck'
import type { ProviderKey } from '@/lib/db/schema'

const GENRES = [
  'Action', 'Animation', 'Aventure', 'Comédie', 'Crime', 'Documentaire', 'Drame',
  'Familial', 'Fantastique', 'Guerre', 'Histoire', 'Horreur', 'Musique',
  'Mystère', 'Romance', 'Science-Fiction', 'Thriller', 'Western',
]

const PLATEFORMES: { cle: ProviderKey; nom: string }[] = [
  { cle: 'netflix', nom: 'Netflix' },
  { cle: 'canal', nom: 'MyCanal' },
  { cle: 'disney', nom: 'Disney+' },
]

const FILTRES_VIDES: DeckFilters = {
  genres: [],
  yearFrom: null,
  yearTo: null,
  minRating: 0,
  maxRuntime: null,
  providers: [],
  includeTop200: true,
}

export function FilterSheet({
  ouverte,
  onFermer,
  onAppliquer,
}: {
  ouverte: boolean
  onFermer: () => void
  onAppliquer: () => void
}) {
  const [filtres, setFiltres] = useState<DeckFilters>(FILTRES_VIDES)
  const [compte, setCompte] = useState<number | null>(null)

  useEffect(() => {
    if (ouverte) lireFiltres().then(setFiltres)
  }, [ouverte])

  useEffect(() => {
    if (!ouverte) return
    const identifiant = setTimeout(() => {
      compterPaquet(filtres).then(({ count }) => setCompte(count))
    }, 200)
    return () => clearTimeout(identifiant)
  }, [filtres, ouverte])

  if (!ouverte) return null

  function basculerGenre(genre: string) {
    setFiltres((f) => ({
      ...f,
      genres: f.genres.includes(genre) ? f.genres.filter((g) => g !== genre) : [...f.genres, genre],
    }))
  }

  function basculerPlateforme(cle: ProviderKey) {
    setFiltres((f) => ({
      ...f,
      providers: f.providers.includes(cle) ? f.providers.filter((p) => p !== cle) : [...f.providers, cle],
    }))
  }

  async function appliquer() {
    await ecrireFiltres(filtres)
    onAppliquer()
    onFermer()
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
        <h2 className="mb-4 text-xl">Filtres</h2>

        <fieldset className="mb-4">
          <legend className="sp-meta mb-2 text-sm">Genres</legend>
          <div className="flex flex-wrap gap-2">
            {GENRES.map((genre) => (
              <button
                key={genre}
                type="button"
                onClick={() => basculerGenre(genre)}
                className="min-h-11 px-3 text-sm"
                style={{
                  borderRadius: 'var(--sp-radius-pill)',
                  background: filtres.genres.includes(genre) ? 'var(--sp-accent)' : 'var(--sp-surface)',
                  color: filtres.genres.includes(genre) ? 'var(--sp-accent-ink)' : 'var(--sp-ink)',
                }}
              >
                {genre}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mb-4">
          <legend className="sp-meta mb-2 text-sm">Plateformes</legend>
          <div className="flex flex-wrap gap-2">
            {PLATEFORMES.map(({ cle, nom }) => (
              <button
                key={cle}
                type="button"
                onClick={() => basculerPlateforme(cle)}
                className="min-h-11 px-3 text-sm"
                style={{
                  borderRadius: 'var(--sp-radius-pill)',
                  background: filtres.providers.includes(cle) ? 'var(--sp-accent)' : 'var(--sp-surface)',
                  color: filtres.providers.includes(cle) ? 'var(--sp-accent-ink)' : 'var(--sp-ink)',
                }}
              >
                {nom}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setFiltres((f) => ({ ...f, includeTop200: !f.includeTop200 }))}
              className="min-h-11 px-3 text-sm"
              style={{
                borderRadius: 'var(--sp-radius-pill)',
                background: filtres.includeTop200 ? 'var(--sp-accent)' : 'var(--sp-surface)',
                color: filtres.includeTop200 ? 'var(--sp-accent-ink)' : 'var(--sp-ink)',
              }}
            >
              Top 200
            </button>
          </div>
        </fieldset>

        <label className="mb-4 flex flex-col gap-1">
          Note minimum : {filtres.minRating}
          <input
            type="range"
            min={0}
            max={10}
            step={0.5}
            value={filtres.minRating}
            onChange={(e) => setFiltres((f) => ({ ...f, minRating: Number(e.target.value) }))}
          />
        </label>

        <label className="mb-4 flex flex-col gap-1">
          Durée maximum : {filtres.maxRuntime ?? 'illimitée'}
          <input
            type="range"
            min={60}
            max={240}
            value={filtres.maxRuntime ?? 240}
            onChange={(e) =>
              setFiltres((f) => ({
                ...f,
                maxRuntime: Number(e.target.value) === 240 ? null : Number(e.target.value),
              }))
            }
          />
        </label>

        <div className="mb-4 flex gap-2">
          <label className="flex flex-1 flex-col gap-1">
            De
            <input
              type="number"
              className="min-h-11 rounded-[var(--sp-radius-pill)] border border-[var(--sp-ink-soft)] px-3"
              value={filtres.yearFrom ?? ''}
              onChange={(e) =>
                setFiltres((f) => ({ ...f, yearFrom: e.target.value ? Number(e.target.value) : null }))
              }
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            À
            <input
              type="number"
              className="min-h-11 rounded-[var(--sp-radius-pill)] border border-[var(--sp-ink-soft)] px-3"
              value={filtres.yearTo ?? ''}
              onChange={(e) =>
                setFiltres((f) => ({ ...f, yearTo: e.target.value ? Number(e.target.value) : null }))
              }
            />
          </label>
        </div>

        <p className="sp-meta mb-4 text-sm">{compte ?? '…'} films correspondent</p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFiltres(FILTRES_VIDES)}
            className="min-h-11 flex-1 rounded-[var(--sp-radius-pill)] border border-[var(--sp-ink-soft)]"
          >
            Réinitialiser
          </button>
          <button
            type="button"
            onClick={appliquer}
            className="min-h-11 flex-1 rounded-[var(--sp-radius-pill)]"
            style={{ background: 'var(--sp-accent)', color: 'var(--sp-accent-ink)' }}
          >
            Appliquer
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Brancher dans `/salon`**

Dans `app/salon/page.tsx` :

```tsx
// Importer :
import { FilterSheet } from '@/components/filters/FilterSheet'

// Ajouter un état :
const [filtresOuverts, setFiltresOuverts] = useState(false)

// Dans le bouton « Modifier les filtres » de la fin de paquet, remplacer le
// bouton sans onClick par :
<button
  type="button"
  className="underline"
  style={{ color: 'var(--sp-accent)' }}
  onClick={() => setFiltresOuverts(true)}
>
  Modifier les filtres
</button>

// Ajouter un bouton filtres dans le <header>, avant le lien matchs :
<button type="button" aria-label="Filtres" onClick={() => setFiltresOuverts(true)}>
  ⚙ Filtres
</button>

// Juste avant <MovieSheet ... /> :
<FilterSheet
  ouverte={filtresOuverts}
  onFermer={() => setFiltresOuverts(false)}
  onAppliquer={rechargerPaquet}
/>
```

- [ ] **Step 3: Vérifier**

```bash
pnpm exec tsc --noEmit
pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add components/filters/FilterSheet.tsx app/salon/page.tsx
git commit -m "Ajoute la feuille de filtres"
```

---

## Task 11: Superposition de match et animations par thème

**Files:**
- Create: `components/swipe/MatchOverlay.tsx`
- Modify: `app/salon/page.tsx`

**Interfaces:**
- Consumes: `MatchRow` (`lib/db/queries/matches.ts`), classes `.sp-match-backdrop`/`.sp-match-card`/`.sp-match-banner` (`themes/*.css`, tâche 1)
- Produit : `MatchOverlay(props: { match: MatchRow | null; prenoms: string[]; onFermer(): void; onVoirMatchs(): void }): JSX.Element`

- [ ] **Step 1: Écrire `MatchOverlay`**

§7.7 : écran assombri, affiche + titre + deux prénoms, deux boutons (*Voir nos matchs* / *Continuer*). L'animation dépend du thème via les classes CSS de la tâche 1 (`.sp-match-backdrop`, `.sp-match-card`, `.sp-match-banner`) — ce composant ne code aucune animation lui-même, il pose seulement la structure et laisse le CSS du thème actif la piloter, exactement comme le principe des jetons l'exige.

```tsx
import type { MatchRow } from '@/lib/db/queries/matches'

export function MatchOverlay({
  match,
  prenoms,
  onFermer,
  onVoirMatchs,
}: {
  match: MatchRow | null
  prenoms: string[]
  onFermer: () => void
  onVoirMatchs: () => void
}) {
  if (!match) return null

  return (
    <div
      className="sp-match-backdrop fixed inset-0 z-30 flex flex-col items-center justify-center gap-4 p-6 text-center"
      style={{ background: 'rgba(0, 0, 0, 0.75)', color: 'var(--sp-ink)' }}
    >
      <div
        className="sp-match-card relative w-48 overflow-hidden"
        style={{ borderRadius: 'var(--sp-radius-card)', boxShadow: 'var(--sp-shadow-card)' }}
      >
        {match.movie.posterPath ? (
          // eslint-disable-next-line @next/next/no-img-element -- superposition ponctuelle, pas de layout à optimiser
          <img
            src={`https://image.tmdb.org/t/p/w342${match.movie.posterPath}`}
            alt={match.movie.title}
            className="w-full"
          />
        ) : (
          <div className="aspect-[2/3] w-full" style={{ background: 'var(--sp-surface)' }} />
        )}
      </div>
      <span
        className="sp-match-banner px-4 py-1 text-sm"
        style={{
          borderRadius: 'var(--sp-radius-pill)',
          background: 'var(--sp-accent)',
          color: 'var(--sp-accent-ink)',
        }}
      >
        Match !
      </span>
      <h2 style={{ fontFamily: 'var(--sp-font-display)' }} className="text-2xl">
        {match.movie.title}
      </h2>
      <p className="sp-meta">{prenoms.join(' & ')}</p>
      <div className="mt-4 flex w-full max-w-xs flex-col gap-2">
        <button
          type="button"
          onClick={onVoirMatchs}
          className="min-h-11 rounded-[var(--sp-radius-pill)]"
          style={{ background: 'var(--sp-accent)', color: 'var(--sp-accent-ink)' }}
        >
          Voir nos matchs
        </button>
        <button
          type="button"
          onClick={onFermer}
          className="min-h-11 rounded-[var(--sp-radius-pill)] border"
          style={{ borderColor: 'var(--sp-ink-soft)' }}
        >
          Continuer
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Brancher dans `/salon`**

L'apparition doit être **poussée par le sondage des événements**, pas seulement par le retour de `balayer()` — c'est ce qui garantit qu'elle apparaît aussi chez la personne qui n'a pas provoqué le match elle-même (le test Playwright de la tâche 17 vérifie exactement ce point).

Dans `app/salon/page.tsx` :

```tsx
// Importer :
import { MatchOverlay } from '@/components/swipe/MatchOverlay'
import type { MatchRow } from '@/lib/db/queries/matches'

// Ajouter un état :
const [matchAffiche, setMatchAffiche] = useState<MatchRow | null>(null)
const [dernierMatchVu, setDernierMatchVu] = useState(0)

// Un effet qui surveille les nouveaux matchs arrivés par le sondage :
useEffect(() => {
  const nouveau = evenementsSalon.matches.find((m) => m.matchId > dernierMatchVu)
  if (nouveau) {
    setMatchAffiche(nouveau)
    setDernierMatchVu(nouveau.matchId)
  }
}, [evenementsSalon.matches, dernierMatchVu])

// Juste avant la fermeture de <main> :
<MatchOverlay
  match={matchAffiche}
  prenoms={evenementsSalon.members.map((m) => m.displayName)}
  onFermer={() => setMatchAffiche(null)}
  onVoirMatchs={() => router.push('/salon/matchs')}
/>
```

- [ ] **Step 3: Vérifier**

```bash
pnpm exec tsc --noEmit
pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add components/swipe/MatchOverlay.tsx app/salon/page.tsx
git commit -m "Ajoute la superposition de match"
```

---

## Task 12: Page Nos matchs et grille

**Files:**
- Create: `app/salon/matchs/page.tsx`, `components/matches/MatchGrid.tsx`

**Interfaces:**
- Consumes: `listerMatchs`/`changerStatutMatch` (`lib/api-client.ts`), `MatchRow`/`MatchStatus`
- Produit : `MatchGrid(props: { matchs: MatchRow[]; onChangerStatut(movieId: number, status: MatchStatus): void }): JSX.Element`

- [ ] **Step 1: Écrire `MatchGrid`**

§7.5 : grille d'affiches, pastille de statut, appui ouvre le détail avec *Vu*/*Abandonné*/retour à *À voir*.

`components/matches/MatchGrid.tsx` :

```tsx
'use client'

import { useState } from 'react'
import type { MatchRow } from '@/lib/db/queries/matches'
import type { MatchStatus } from '@/lib/db/schema'

const LIBELLES_STATUT: Record<MatchStatus, string> = {
  a_voir: 'À voir',
  vu: 'Vu',
  abandonne: 'Abandonné',
}

export function MatchGrid({
  matchs,
  onChangerStatut,
}: {
  matchs: MatchRow[]
  onChangerStatut: (movieId: number, status: MatchStatus) => void
}) {
  const [ouvert, setOuvert] = useState<MatchRow | null>(null)

  return (
    <>
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
        {matchs.map((match) => (
          <button
            key={match.matchId}
            type="button"
            onClick={() => setOuvert(match)}
            className="relative overflow-hidden text-left"
            style={{ borderRadius: 'var(--sp-radius-card)' }}
          >
            {match.movie.posterPath ? (
              // eslint-disable-next-line @next/next/no-img-element -- grille dense, pas de next/image nécessaire ici
              <img
                src={`https://image.tmdb.org/t/p/w342${match.movie.posterPath}`}
                alt={match.movie.title}
                className="aspect-[2/3] w-full object-cover"
              />
            ) : (
              <div className="aspect-[2/3] w-full" style={{ background: 'var(--sp-surface)' }} />
            )}
            <span
              className="sp-meta absolute right-1 top-1 px-2 py-0.5 text-xs"
              style={{
                borderRadius: 'var(--sp-radius-pill)',
                background: 'var(--sp-bg-2)',
                color: 'var(--sp-ink)',
              }}
            >
              {LIBELLES_STATUT[match.status]}
            </span>
          </button>
        ))}
      </div>

      {ouvert && (
        <div
          className="fixed inset-0 z-20 flex items-end"
          onClick={() => setOuvert(null)}
        >
          <div className="absolute inset-0" style={{ background: 'rgba(0, 0, 0, 0.5)' }} />
          <div
            className="relative z-10 w-full p-6"
            style={{
              background: 'var(--sp-bg-2)',
              color: 'var(--sp-ink)',
              borderTopLeftRadius: 'var(--sp-radius-card)',
              borderTopRightRadius: 'var(--sp-radius-card)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontFamily: 'var(--sp-font-display)' }} className="mb-4 text-xl">
              {ouvert.movie.title}
            </h3>
            <div className="flex gap-2">
              {(['vu', 'abandonne', 'a_voir'] as const)
                .filter((s) => s !== ouvert.status)
                .map((statut) => (
                  <button
                    key={statut}
                    type="button"
                    onClick={() => {
                      onChangerStatut(ouvert.movie.id, statut)
                      setOuvert(null)
                    }}
                    className="min-h-11 flex-1 rounded-[var(--sp-radius-pill)] border"
                    style={{ borderColor: 'var(--sp-ink-soft)' }}
                  >
                    {LIBELLES_STATUT[statut]}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Écrire `app/salon/matchs/page.tsx`**

§7.5 : vue par défaut *à voir* seulement, filtrage par statut. Le bouton *Décide pour nous* n'est branché qu'à la tâche 13 (roulette) ; ce fichier expose déjà son point d'entrée pour éviter une reprise.

```tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { changerStatutMatch, listerMatchs } from '@/lib/api-client'
import { MatchGrid } from '@/components/matches/MatchGrid'
import type { MatchRow } from '@/lib/db/queries/matches'
import type { MatchStatus } from '@/lib/db/schema'

const ONGLETS: { statut: MatchStatus; libelle: string }[] = [
  { statut: 'a_voir', libelle: 'À voir' },
  { statut: 'vu', libelle: 'Vu' },
  { statut: 'abandonne', libelle: 'Abandonné' },
]

export default function PageMatchs() {
  const [statut, setStatut] = useState<MatchStatus>('a_voir')
  const [matchs, setMatchs] = useState<MatchRow[]>([])

  useEffect(() => {
    listerMatchs(statut).then(({ matches }) => setMatchs(matches))
  }, [statut])

  async function changerStatut(movieId: number, nouveauStatut: MatchStatus) {
    await changerStatutMatch(movieId, nouveauStatut)
    setMatchs((precedent) => precedent.filter((m) => m.movie.id !== movieId))
  }

  return (
    <main className="sp-page min-h-dvh">
      <header className="flex items-center justify-between p-4">
        <Link href="/salon" className="min-h-11">
          ← Retour
        </Link>
        <h1 style={{ fontFamily: 'var(--sp-font-display)' }} className="text-xl">
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
            className="min-h-11 px-4"
            style={{
              borderRadius: 'var(--sp-radius-pill)',
              background: statut === s ? 'var(--sp-accent)' : 'transparent',
              color: statut === s ? 'var(--sp-accent-ink)' : 'var(--sp-ink)',
            }}
          >
            {libelle}
          </button>
        ))}
      </nav>

      <MatchGrid matchs={matchs} onChangerStatut={changerStatut} />

      {statut === 'a_voir' && matchs.length > 0 && (
        <div className="p-4">
          <button
            type="button"
            className="min-h-11 w-full rounded-[var(--sp-radius-pill)]"
            style={{ background: 'var(--sp-accent)', color: 'var(--sp-accent-ink)' }}
          >
            Décide pour nous
          </button>
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 3: Vérifier**

```bash
pnpm exec tsc --noEmit
pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add app/salon/matchs components/matches/MatchGrid.tsx
git commit -m "Ajoute la page Nos matchs et sa grille"
```

---

## Task 13: Roulette « Décide pour nous »

**Files:**
- Create: `lib/roulette.ts`, `components/matches/RouletteDialog.tsx`
- Modify: `app/salon/matchs/page.tsx`
- Test: `tests/unit/roulette.test.ts`

**Interfaces:**
- Consumes: `tirerAuSort` (`lib/api-client.ts`)
- Produit :
  - `DUREE_ROULETTE_MS = 2200`
  - `easeRoulette(t: number): number` (t ∈ [0, 1])
  - `RouletteDialog(props: { ouverte: boolean; onFermer(): void }): JSX.Element`

- [ ] **Step 1: Écrire le test qui échoue**

§7.5 : « les affiches défilent verticalement en ralentissant pendant 2,2 secondes ». Un ralentissement est une fonction d'accélération décroissante — testable sans DOM comme une fonction pure de progression `[0, 1] → [0, 1]`.

`tests/unit/roulette.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { DUREE_ROULETTE_MS, easeRoulette } from '@/lib/roulette'

describe('DUREE_ROULETTE_MS', () => {
  it('vaut 2,2 secondes', () => {
    expect(DUREE_ROULETTE_MS).toBe(2200)
  })
})

describe('easeRoulette', () => {
  it('part de 0 et arrive à 1', () => {
    expect(easeRoulette(0)).toBe(0)
    expect(easeRoulette(1)).toBe(1)
  })

  it('est croissante sur tout l’intervalle', () => {
    const echantillons = Array.from({ length: 21 }, (_, i) => easeRoulette(i / 20))
    for (let i = 1; i < echantillons.length; i++) {
      expect(echantillons[i]).toBeGreaterThanOrEqual(echantillons[i - 1])
    }
  })

  it('ralentit : la progression sur la seconde moitié du temps est plus petite que sur la première', () => {
    const premiereMoitie = easeRoulette(0.5) - easeRoulette(0)
    const secondeMoitie = easeRoulette(1) - easeRoulette(0.5)
    expect(secondeMoitie).toBeLessThan(premiereMoitie)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm vitest run tests/unit/roulette.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "@/lib/roulette"`.

- [ ] **Step 3: Écrire `lib/roulette.ts`**

Ease-out cubique : progression rapide puis ralentie, exactement le profil décrit.

```ts
export const DUREE_ROULETTE_MS = 2200

export function easeRoulette(t: number): number {
  const clamped = Math.max(0, Math.min(1, t))
  return 1 - (1 - clamped) ** 3
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
pnpm vitest run tests/unit/roulette.test.ts
```

Attendu : `4 passed`.

- [ ] **Step 5: Écrire `RouletteDialog`**

Affiches défilant verticalement (translation Y pilotée par `easeRoulette`), la carte gagnante se pose à la fin, bouton *relancer*.

`components/matches/RouletteDialog.tsx` :

```tsx
'use client'

import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { tirerAuSort } from '@/lib/api-client'
import { DUREE_ROULETTE_MS, easeRoulette } from '@/lib/roulette'
import type { MatchRow } from '@/lib/db/queries/matches'

/** §8.5 : sous prefers-reduced-motion, la roulette se réduit à un fondu de 120 ms. */
const DUREE_REDUITE_MS = 120

export function RouletteDialog({ ouverte, onFermer }: { ouverte: boolean; onFermer: () => void }) {
  const [tirage, setTirage] = useState<'attente' | 'defilement' | 'termine'>('attente')
  const [gagnant, setGagnant] = useState<MatchRow | null>(null)
  const reduit = useReducedMotion()

  useEffect(() => {
    if (!ouverte) {
      setTirage('attente')
      setGagnant(null)
      return
    }
    let annule = false
    setTirage('defilement')
    const duree = reduit ? DUREE_REDUITE_MS : DUREE_ROULETTE_MS
    tirerAuSort().then((match) => {
      if (annule) return
      setGagnant(match)
      setTimeout(() => {
        if (!annule) setTirage('termine')
      }, duree)
    })
    return () => {
      annule = true
    }
  }, [ouverte, reduit])

  if (!ouverte) return null

  return (
    <div
      className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-6 p-6"
      style={{ background: 'rgba(0, 0, 0, 0.85)', color: 'var(--sp-ink)' }}
    >
      <div className="relative h-72 w-48 overflow-hidden" style={{ borderRadius: 'var(--sp-radius-card)' }}>
        {gagnant && (
          <motion.div
            className="absolute inset-0"
            initial={reduit ? { opacity: 0 } : { y: -600 }}
            animate={reduit ? { opacity: 1 } : { y: 0 }}
            transition={
              reduit
                ? { duration: DUREE_REDUITE_MS / 1000, ease: 'easeOut' }
                : { duration: DUREE_ROULETTE_MS / 1000, ease: easeRoulette }
            }
          >
            {gagnant.movie.posterPath ? (
              // eslint-disable-next-line @next/next/no-img-element -- superposition ponctuelle
              <img
                src={`https://image.tmdb.org/t/p/w342${gagnant.movie.posterPath}`}
                alt={gagnant.movie.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full" style={{ background: 'var(--sp-surface)' }} />
            )}
          </motion.div>
        )}
      </div>
      {tirage === 'termine' && gagnant && (
        <>
          <h3 style={{ fontFamily: 'var(--sp-font-display)' }} className="text-xl">
            {gagnant.movie.title}
          </h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTirage('defilement')}
              className="min-h-11 rounded-[var(--sp-radius-pill)] border px-4"
              style={{ borderColor: 'var(--sp-ink-soft)' }}
            >
              Relancer
            </button>
            <button
              type="button"
              onClick={onFermer}
              className="min-h-11 rounded-[var(--sp-radius-pill)] px-4"
              style={{ background: 'var(--sp-accent)', color: 'var(--sp-accent-ink)' }}
            >
              Fermer
            </button>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Brancher dans la page matchs**

Dans `app/salon/matchs/page.tsx` :

```tsx
// Importer :
import { RouletteDialog } from '@/components/matches/RouletteDialog'

// Ajouter un état :
const [rouletteOuverte, setRouletteOuverte] = useState(false)

// Remplacer le bouton « Décide pour nous » (sans onClick) par :
<button
  type="button"
  onClick={() => setRouletteOuverte(true)}
  className="min-h-11 w-full rounded-[var(--sp-radius-pill)]"
  style={{ background: 'var(--sp-accent)', color: 'var(--sp-accent-ink)' }}
>
  Décide pour nous
</button>

// Juste avant la fermeture de <main> :
<RouletteDialog ouverte={rouletteOuverte} onFermer={() => setRouletteOuverte(false)} />
```

- [ ] **Step 7: Vérifier**

```bash
pnpm exec tsc --noEmit
pnpm build
pnpm test
```

- [ ] **Step 8: Commit**

```bash
git add lib/roulette.ts components/matches/RouletteDialog.tsx app/salon/matchs/page.tsx tests/unit/roulette.test.ts
git commit -m "Ajoute la roulette Décide pour nous"
```

---

## Task 14: Fond teinté par l'affiche

**Files:**
- Create: `lib/color-extract.ts`

**Interfaces:**
- Consumes: rien côté logique pure
- Produit :
  - `couleursDominantes(pixels: { r: number; g: number; b: number }[], nombre: number): string[]` (pure, testée)
  - `extraireCouleursAffiche(img: HTMLImageElement): string[]` (dépend du `canvas`, non testée par Vitest)
  - `appliquerTeinte(element: HTMLElement, couleurs: string[]): void`

**Test:** `tests/unit/color-extract.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

§8.3 : « L'extraction se fait dans le navigateur… avec mise en cache locale par film. » L'algorithme de sélection des deux couleurs dominantes, lui, ne dépend d'aucune API navigateur : il prend un tableau de pixels déjà lus et rend deux couleurs. C'est cette partie qui est testée.

`tests/unit/color-extract.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { couleursDominantes } from '@/lib/color-extract'

describe('couleursDominantes', () => {
  it('rend le nombre de couleurs demandé', () => {
    const pixels = Array.from({ length: 100 }, (_, i) => ({ r: i, g: 0, b: 0 }))
    expect(couleursDominantes(pixels, 2)).toHaveLength(2)
  })

  it('rend des couleurs hexadécimales valides', () => {
    const pixels = [
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 255, b: 0 },
      { r: 0, g: 0, b: 255 },
    ]
    for (const couleur of couleursDominantes(pixels, 2)) {
      expect(couleur).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('distingue deux groupes de couleurs nettement différents', () => {
    const rouges = Array.from({ length: 50 }, () => ({ r: 220, g: 20, b: 20 }))
    const bleus = Array.from({ length: 50 }, () => ({ r: 20, g: 20, b: 220 }))
    const [a, b] = couleursDominantes([...rouges, ...bleus], 2)
    expect(a.toLowerCase()).not.toBe(b.toLowerCase())
  })

  it('ne casse pas sur un tableau vide', () => {
    expect(couleursDominantes([], 2)).toEqual(['#000000', '#000000'])
  })

  it('est déterministe sur la même entrée', () => {
    const pixels = [{ r: 10, g: 20, b: 30 }, { r: 200, g: 100, b: 50 }]
    expect(couleursDominantes(pixels, 2)).toEqual(couleursDominantes(pixels, 2))
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm vitest run tests/unit/color-extract.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "@/lib/color-extract"`.

- [ ] **Step 3: Écrire l'implémentation**

Quantification par cases (*bucketing*) plutôt qu'un k-means : suffisant pour deux couleurs d'ambiance, déterministe, sans dépendance.

`lib/color-extract.ts` :

```ts
interface Pixel {
  r: number
  g: number
  b: number
}

function versHex({ r, g, b }: Pixel): string {
  const composant = (v: number) => Math.round(v).toString(16).padStart(2, '0')
  return `#${composant(r)}${composant(g)}${composant(b)}`
}

/**
 * Regroupe les pixels par cases de teinte (32 niveaux par canal), garde les
 * `nombre` cases les plus peuplées, et rend leur couleur moyenne. Pur —
 * aucune dépendance au navigateur — pour rester testable dans l'environnement
 * `node` de Vitest.
 */
export function couleursDominantes(pixels: Pixel[], nombre: number): string[] {
  if (pixels.length === 0) return Array.from({ length: nombre }, () => '#000000')

  const PAS = 32
  const cases = new Map<string, { somme: Pixel; total: number }>()

  for (const pixel of pixels) {
    const cle = [pixel.r, pixel.g, pixel.b].map((c) => Math.floor(c / PAS)).join(',')
    const entree = cases.get(cle) ?? { somme: { r: 0, g: 0, b: 0 }, total: 0 }
    entree.somme.r += pixel.r
    entree.somme.g += pixel.g
    entree.somme.b += pixel.b
    entree.total += 1
    cases.set(cle, entree)
  }

  const triees = [...cases.values()].sort((a, b) => b.total - a.total)
  const retenues = triees.slice(0, nombre)

  while (retenues.length < nombre && retenues.length > 0) {
    retenues.push(retenues[retenues.length - 1])
  }

  return retenues.map(({ somme, total }) =>
    versHex({ r: somme.r / total, g: somme.g / total, b: somme.b / total }),
  )
}

/**
 * Lit les pixels d'une affiche déjà chargée via un canvas hors écran, et en
 * tire deux couleurs. Dépend du DOM — non testée par Vitest, vérifiée par le
 * test Playwright de la tâche 17 (fond « teinté » du thème actif).
 */
export function extraireCouleursAffiche(img: HTMLImageElement): string[] {
  const canvas = document.createElement('canvas')
  const taille = 48
  canvas.width = taille
  canvas.height = taille
  const contexte = canvas.getContext('2d')
  if (!contexte) return ['#000000', '#000000']
  contexte.drawImage(img, 0, 0, taille, taille)
  const { data } = contexte.getImageData(0, 0, taille, taille)
  const pixels: Pixel[] = []
  for (let i = 0; i < data.length; i += 4) {
    pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] })
  }
  return couleursDominantes(pixels, 2)
}

const CACHE_TEINTE = new Map<string, string[]>()

/**
 * Pose `--sp-tint-a`/`--sp-tint-b` sur l'élément (`.sp-page`), consommées par
 * le fond « teinté » (data-bg="4") des deux thèmes (tâche 1). Met en cache
 * par URL d'affiche pour ne recalculer qu'une fois par film (§8.3).
 */
export function appliquerTeinte(element: HTMLElement, urlAffiche: string, img: HTMLImageElement): void {
  const enCache = CACHE_TEINTE.get(urlAffiche)
  const couleurs = enCache ?? extraireCouleursAffiche(img)
  if (!enCache) CACHE_TEINTE.set(urlAffiche, couleurs)
  element.style.setProperty('--sp-tint-a', couleurs[0])
  element.style.setProperty('--sp-tint-b', couleurs[1])
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
pnpm vitest run tests/unit/color-extract.test.ts
```

Attendu : `5 passed`.

- [ ] **Step 5: Brancher dans `/salon`**

Dans `app/salon/page.tsx`, ajouter un effet qui applique la teinte quand le fond « teinté » (`data-bg="4"`) est actif et que la carte du dessus change :

```tsx
// Importer :
import { appliquerTeinte } from '@/lib/color-extract'

// Ajouter un effet, après celui qui recharge le paquet :
useEffect(() => {
  if (document.documentElement.dataset.bg !== '4' || !carteHaut?.posterPath) return
  const img = new window.Image()
  img.crossOrigin = 'anonymous'
  img.src = `https://image.tmdb.org/t/p/w92${carteHaut.posterPath}`
  img.onload = () => appliquerTeinte(document.body, carteHaut.posterPath!, img)
}, [carteHaut])
```

- [ ] **Step 6: Vérifier**

```bash
pnpm exec tsc --noEmit
pnpm build
pnpm test
```

- [ ] **Step 7: Commit**

```bash
git add lib/color-extract.ts app/salon/page.tsx tests/unit/color-extract.test.ts
git commit -m "Ajoute le fond teinté par l'affiche"
```

---

## Task 15: Réglages — feuille modale

**Files:**
- Create: `app/api/session/leave/route.ts`, `components/settings/SettingsSheet.tsx`
- Modify: `lib/api-client.ts`, `app/salon/page.tsx`
- Test: `tests/integration/api-session-leave.test.ts`

**Interfaces:**
- Consumes: `useTheme` (`lib/theme.ts`), `poserSession`/`erreur`/`ok`/`avecErreurs` (`lib/api/respond.ts`, plan 2), `SESSION_COOKIE` (`lib/session.ts`, plan 2)
- Produit :
  - `POST /api/session/leave` → `{ ok: true }`, expire le cookie
  - `quitterSalon(): Promise<void>` ajouté à `lib/api-client.ts`
  - `SettingsSheet(props: { ouverte: boolean; onFermer(): void; code: string; lien: string }): JSX.Element`

§7.6 : thème, fond (quatre par thème, vignettes), prénom, code et lien du salon, **quitter le salon**. *Quitter* efface uniquement le cookie de cet appareil — le membre, ses balayages et les matchs restent intacts en base, ce qui est déjà le comportement naturel puisque cette route ne touche à aucune table.

Le cookie `sp_session` est posé `HttpOnly` par `poserSession` (`lib/api/respond.ts`, plan 2), donc illisible et inexpirable en JavaScript : la suppression **doit** passer par une route serveur. C'est la seule route que ce plan ajoute (Global Constraints) ; elle ne touche à aucune donnée, elle ne fait qu'expirer un cookie déjà posé par le plan 2.

- [ ] **Step 1: Écrire le test qui échoue**

`tests/integration/api-session-leave.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

describe('POST /api/session/leave', () => {
  it('répond 200 et expire le cookie sp_session', async () => {
    const { POST } = await import('@/app/api/session/leave/route')
    const r = await POST()
    expect(r.status).toBe(200)
    const cookie = r.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/sp_session=;/)
    expect(cookie).toMatch(/Max-Age=0/)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm vitest run tests/integration/api-session-leave.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "@/app/api/session/leave/route"`.

- [ ] **Step 3: Écrire la route**

`app/api/session/leave/route.ts` — même cookie, même chemin que `poserSession`, `Max-Age=0` pour l'expirer immédiatement :

```ts
import { avecErreurs, ok } from '@/lib/api/respond'
import { SESSION_COOKIE } from '@/lib/session'

export async function POST(): Promise<Response> {
  return avecErreurs(async () => {
    const reponse = ok({ ok: true })
    reponse.headers.append('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
    return reponse
  })
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
pnpm vitest run tests/integration/api-session-leave.test.ts
```

Attendu : `1 passed`.

- [ ] **Step 5: Ajouter `quitterSalon` au client API**

Dans `lib/api-client.ts`, ajouter à la suite des autres fonctions exportées :

```ts
export async function quitterSalon(): Promise<void> {
  await appeler('/api/session/leave', { method: 'POST' })
}
```

- [ ] **Step 6: Écrire `SettingsSheet`**

```tsx
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
  lien,
}: {
  ouverte: boolean
  onFermer: () => void
  code: string
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
        <h2 className="mb-4 text-xl">Réglages</h2>

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
                className="sp-page aspect-square"
                style={{
                  borderRadius: 'var(--sp-radius-card)',
                  border: fond === f ? '3px solid var(--sp-accent)' : '1px solid var(--sp-ink-soft)',
                }}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="mb-4">
          <legend className="sp-meta mb-2 text-sm">Salon</legend>
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
```

- [ ] **Step 7: Brancher dans `/salon`**

Dans `app/salon/page.tsx` :

```tsx
// Importer :
import { SettingsSheet } from '@/components/settings/SettingsSheet'

// Ajouter un état :
const [reglagesOuverts, setReglagesOuverts] = useState(false)

// Ajouter un bouton réglages dans le <header>, à côté du bouton filtres :
<button type="button" aria-label="Réglages" onClick={() => setReglagesOuverts(true)}>
  ⚙︎
</button>

// Juste avant <MovieSheet ... /> :
<SettingsSheet
  ouverte={reglagesOuverts}
  onFermer={() => setReglagesOuverts(false)}
  code={evenementsSalon.room?.code ?? ''}
  lien={
    typeof window !== 'undefined' && evenementsSalon.room
      ? `${window.location.origin}/j/${evenementsSalon.room.code}`
      : ''
  }
/>
```

- [ ] **Step 8: Vérifier**

```bash
pnpm exec tsc --noEmit
pnpm build
pnpm test
```

Attendu : compilation propre, suite verte (le nouveau test d'intégration inclus).

- [ ] **Step 9: Commit**

```bash
git add app/api/session/leave lib/api-client.ts components/settings/SettingsSheet.tsx app/salon/page.tsx tests/integration/api-session-leave.test.ts
git commit -m "Ajoute les réglages et une route pour quitter le salon"
```

---

## Task 16: Installation mobile et déploiement Vercel

**Files:**
- Create: `app/manifest.ts`, `public/icon.svg`, `vercel.json`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: rien
- Produit : manifeste PWA installable, tâche planifiée Vercel Cron pour `/api/cron/ingest`

- [ ] **Step 1: Créer l'icône**

`public/icon.svg` — pastille ronde ton sur ton, initiale du produit, fonctionne sur les deux thèmes puisqu'elle vit hors du système de jetons (métadonnée de plateforme, pas élément d'interface) :

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0E2E2A"/>
  <circle cx="256" cy="256" r="176" fill="#F3E9D2"/>
  <text x="256" y="300" font-family="Georgia, serif" font-size="220" font-weight="700"
        text-anchor="middle" fill="#E4572E">P</text>
</svg>
```

> **Limite acceptée :** les icônes maskables Android et `apple-touch-icon` iOS attendent classiquement un PNG raster, pas un SVG. Ce plan ne peut pas produire de binaire PNG par ce moyen ; le SVG ci-dessus couvre Chrome/Android (support natif des icônes SVG dans le manifeste) mais pas iOS Safari de façon garantie. Générer les PNG 192×192 et 512×512 (maskables, marge de sécurité 40 px) à partir de ce SVG est un suivi manuel, hors périmètre de ce plan.

- [ ] **Step 2: Écrire le manifeste**

`app/manifest.ts` — Next.js 15 sert `MetadataRoute.Manifest` nativement à `/manifest.webmanifest`, sans dépendance ni fichier statique séparé.

```ts
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Soirée Popcorn',
    short_name: 'Popcorn',
    description: 'Choisissez un film à deux, en balayant.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0e2e2a',
    theme_color: '#0e2e2a',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  }
}
```

- [ ] **Step 3: Référencer l'icône pour iOS**

Dans `app/layout.tsx`, étendre l'objet `metadata` déjà présent :

```tsx
export const metadata: Metadata = {
  title: 'Soirée Popcorn',
  description: 'Choisissez un film à deux, en balayant.',
  icons: { apple: '/icon.svg' },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Popcorn' },
}
```

- [ ] **Step 4: Configurer le cron Vercel**

`vercel.json` — Vercel envoie automatiquement `Authorization: Bearer $CRON_SECRET` aux routes déclarées ici, exactement ce que `app/api/cron/ingest/route.ts` (plan 2) attend déjà ; aucune modification de cette route n'est nécessaire. Hebdomadaire, dimanche 4 h UTC (faible trafic) — répond au point laissé ouvert du plan 2 (« Forme du cron », `HANDOVER.md` §6).

```json
{
  "crons": [
    {
      "path": "/api/cron/ingest",
      "schedule": "0 4 * * 0"
    }
  ]
}
```

- [ ] **Step 5: Vérifier**

```bash
pnpm exec tsc --noEmit
pnpm build
```

Attendu : `/manifest.webmanifest` apparaît dans la sortie de `next build` aux côtés des routes existantes.

- [ ] **Step 6: Commit**

```bash
git add app/manifest.ts public/icon.svg vercel.json app/layout.tsx
git commit -m "Ajoute l'installation mobile et le cron de déploiement"
```

---

## Task 17: Test Playwright de bout en bout

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/helpers.ts`, `tests/e2e/match-visible-des-deux-cotes.spec.ts`, `tests/e2e/parcours.spec.ts`
- Modify: `package.json` (dépendance `@playwright/test`, script `test:e2e`)

**Interfaces:**
- Consumes: toutes les pages et routes livrées par les plans 2 et 3
- Produit : `creerSalon(browser)`, `rejoindreSalon(browser, code)` (`tests/e2e/helpers.ts`), deux specs exécutables par `pnpm test:e2e`

C'est le test qui compte (§12 de la spec) : deux contextes de navigateur, deux membres du même salon, le même film aimé des deux côtés, la superposition de match apparaît **chez les deux**. Plus un parcours complet — créer, rejoindre, filtrer, balayer, matcher, marquer *vu*, tirer au sort.

Un match exige structurellement deux membres au complet (§6 de la spec, plan 1 : `shouldCreateMatch` n'accepte jamais un salon incomplet) — le parcours complet ne peut donc pas se limiter à un seul navigateur comme les pages précédentes de ce plan pourraient le laisser croire : les deux specs partagent la même mise en place à deux personnes, factorisée dans `helpers.ts`.

- [ ] **Step 1: Installer Playwright**

```bash
pnpm add -D @playwright/test
pnpm exec playwright install --with-deps chromium
```

- [ ] **Step 2: Écrire la configuration**

Lance `pnpm dev` automatiquement pour la durée des tests, contre une base de test réelle — Playwright exerce l'application par-dessus HTTP, il ne peut pas substituer `getDb()` comme le font les tests d'intégration Vitest ; il lui faut donc un vrai `DATABASE_URL` de test (Neon offre des branches de base jetables, adaptées à cet usage) plutôt que PGlite.

`playwright.config.ts` :

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
```

- [ ] **Step 3: Ajouter le script**

Dans `package.json`, section `scripts` :

```json
"test:e2e": "playwright test"
```

- [ ] **Step 4: Écrire les aides partagées**

`tests/e2e/helpers.ts` :

```ts
import { expect, type Browser } from '@playwright/test'

export async function creerSalon(browser: Browser, prenom = 'Djo') {
  const contexte = await browser.newContext()
  const page = await contexte.newPage()
  await page.goto('/')
  await page.getByRole('button', { name: 'Créer un salon' }).click()
  await page.getByLabel('Ton prénom').fill(prenom)
  // Effectif 2, seuil 2 par défaut (§7.1) : rien à régler pour un salon à deux.
  await page.getByRole('button', { name: 'Créer' }).click()

  // §7.1 : le lien à partager s'affiche avant le balayage — le lire ici,
  // puis continuer vers /salon.
  await page.getByText('Salon créé !').waitFor()
  const code = (await page.locator('span.sp-meta').first().innerText()).trim()
  await page.getByRole('button', { name: 'Continuer' }).click()
  await expect(page).toHaveURL('/salon')
  return { contexte, page, code }
}

export async function rejoindreSalon(browser: Browser, code: string, prenom = 'Alice') {
  const contexte = await browser.newContext()
  const page = await contexte.newPage()
  await page.goto(`/j/${code}`)
  await page.getByLabel('Ton prénom').fill(prenom)
  await page.getByRole('button', { name: 'Rejoindre' }).click()
  await expect(page).toHaveURL('/salon')
  return { contexte, page }
}
```

- [ ] **Step 5: Écrire le test central — la superposition apparaît chez les deux**

Volontairement minimal : deux contextes isolés, le même salon, le même film aimé des deux côtés, et la superposition qui apparaît chez les deux — rien d'autre, pour que ce test reste lisible comme LE test qui compte.

`tests/e2e/match-visible-des-deux-cotes.spec.ts` :

```ts
import { expect, test } from '@playwright/test'
import { creerSalon, rejoindreSalon } from './helpers'

test('la superposition de match apparaît chez les deux membres', async ({ browser }) => {
  const { contexte: contexteA, page: pageA, code } = await creerSalon(browser)
  const { contexte: contexteB, page: pageB } = await rejoindreSalon(browser, code)

  // Salon complet : le bandeau de salle d'attente doit disparaître des deux côtés.
  await expect(pageA.getByText(/arrivés/)).toBeHidden({ timeout: 10_000 })
  await expect(pageB.getByText(/arrivés/)).toBeHidden({ timeout: 10_000 })

  // Les deux paquets partagent le même ordre (lib/deck.ts, plan 1) : le
  // premier film visible est donc le même des deux côtés — aimer sur les
  // deux revient à aimer le même film, sans avoir besoin de le nommer.
  await pageA.getByRole('button', { name: "J'aime" }).click()
  await pageB.getByRole('button', { name: "J'aime" }).click()

  // La superposition doit apparaître chez les deux, y compris chez A qui n'a
  // pas provoqué le match en dernier — c'est le sondage des événements
  // (tâche 4) qui le pousse, pas seulement le retour direct du balayage.
  await expect(pageA.getByText('Match !')).toBeVisible({ timeout: 10_000 })
  await expect(pageB.getByText('Match !')).toBeVisible({ timeout: 10_000 })

  await contexteA.close()
  await contexteB.close()
})
```

- [ ] **Step 6: Écrire le parcours complet**

Reprend le scénario déjà prouvé côté API par `tests/integration/parcours.test.ts` (plan 2), cette fois par de vrais clics à deux — c'est la preuve que l'interface appelle correctement les routes, pas une redite de leur logique. Les étapes *matcher*, *marquer vu* et *tirer au sort* exigent toutes les deux un salon complet, donc les deux contextes créés en tâche 4 restent ouverts jusqu'à la fin.

`tests/e2e/parcours.spec.ts` :

```ts
import { expect, test } from '@playwright/test'
import { creerSalon, rejoindreSalon } from './helpers'

test('parcours complet : créer, rejoindre, filtrer, balayer, matcher, marquer vu, tirer au sort', async ({
  browser,
}) => {
  const { contexte: contexteA, page: pageA, code } = await creerSalon(browser)
  const { contexte: contexteB, page: pageB } = await rejoindreSalon(browser, code)

  await expect(pageA.getByText(/arrivés/)).toBeHidden({ timeout: 10_000 })

  // Filtrer : ouvrir la feuille, cocher un genre, voir le compte en direct —
  // puis fermer SANS appliquer (clic sur le fond, pas sur « Appliquer »).
  // Persister le filtre limiterait le paquet de A à ce genre tandis que B
  // resterait sur le paquet complet : comme l'ordre est partagé mais pas le
  // sous-ensemble visible, A et B risqueraient de ne plus voir le même
  // premier film, rendant le match qui suit imprévisible. Ce n'est pas ce
  // que cette étape doit prouver — la persistance des filtres est déjà
  // couverte par `tests/integration/api-matches.test.ts` (plan 2).
  await pageA.getByRole('button', { name: 'Filtres' }).click()
  await pageA.getByRole('button', { name: 'Action' }).click()
  await expect(pageA.getByText(/films correspondent/)).toBeVisible()
  await pageA.locator('.fixed.inset-0').first().click({ position: { x: 10, y: 10 } })

  // Balayer jusqu'au match : aucun filtre n'a été persisté à l'étape
  // précédente, les deux paquets sont donc restés identiques (même ordre,
  // §5 de la spec) — le premier film visible est le même des deux côtés,
  // aimer sur les deux revient à aimer le même film.
  await pageA.getByRole('button', { name: "J'aime" }).click()
  await pageB.getByRole('button', { name: "J'aime" }).click()
  await expect(pageA.getByText('Match !')).toBeVisible({ timeout: 10_000 })
  await pageA.getByRole('button', { name: 'Continuer' }).click()
  // B a aussi reçu la superposition (poussée par le sondage, tâche 4) : la
  // fermer avant de naviguer, sinon elle intercepterait le clic suivant.
  await pageB.getByRole('button', { name: 'Continuer' }).click()

  // Nos matchs, tirer au sort — tant que le seul match est encore « à voir »,
  // sans quoi « Décide pour nous » ne s'affiche plus (app/salon/matchs/page.tsx).
  await pageB.getByRole('link', { name: /match/ }).click()
  await expect(pageB).toHaveURL('/salon/matchs')
  await pageB.getByRole('button', { name: 'Décide pour nous' }).click()
  await expect(pageB.getByRole('button', { name: 'Fermer' })).toBeVisible({ timeout: 5_000 })
  await pageB.getByRole('button', { name: 'Fermer' }).click()

  // Marquer vu, côté A.
  await pageA.getByRole('link', { name: /match/ }).click()
  await expect(pageA).toHaveURL('/salon/matchs')
  await pageA.locator('button').first().click()
  await pageA.getByRole('button', { name: 'Vu' }).click()
  await expect(pageA.getByRole('button', { name: 'Décide pour nous' })).toBeHidden()

  await contexteA.close()
  await contexteB.close()
})
```

- [ ] **Step 7: Lancer les deux specs**

```bash
pnpm test:e2e
```

Attendu : `2 passed`. Si l'application n'est pas déjà servie, `webServer` dans `playwright.config.ts` lance `pnpm dev` automatiquement — s'assurer que `.env.local` pointe vers une base de test réelle (pas de production) avant de lancer.

- [ ] **Step 8: Vérification finale de la branche**

```bash
pnpm exec tsc --noEmit
pnpm test
pnpm build
pnpm test:e2e
```

Attendu : tout vert. C'est le livrable vérifiable de ce plan.

- [ ] **Step 9: Commit**

```bash
git add playwright.config.ts tests/e2e package.json pnpm-lock.yaml
git commit -m "Ajoute le test de bout en bout à deux navigateurs"
```
