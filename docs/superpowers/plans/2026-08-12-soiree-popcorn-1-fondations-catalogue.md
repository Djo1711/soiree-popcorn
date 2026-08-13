# Soirée Popcorn — Plan 1 : fondations et catalogue

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser le socle technique du projet et remplir une base Neon avec le catalogue complet des films disponibles en abonnement sur Netflix, MyCanal et Disney+ en France, plus le top 200 all-time, chaque film portant ses tags français.

**Architecture:** Toute la logique qui doit être juste vit dans des fonctions pures et testées (`lib/roomcode`, `lib/deck`, `lib/match`, `lib/keywords`), indépendantes de la base et du réseau. Le schéma Drizzle est la seule définition des tables. Le client TMDB isole la pagination et la reprise sur erreur. Le script d'ingestion orchestre ces briques en trois phases reprenables, dont la progression est portée par la base elle-même plutôt que par un fichier d'état volumineux.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript strict, Tailwind CSS v4, Drizzle ORM, Neon Postgres, PGlite (Postgres embarqué pour les tests), Vitest, pnpm, tsx.

**Spec de référence :** `docs/superpowers/specs/2026-08-12-soiree-popcorn-design.md`

**Périmètre de ce plan :** sections 3.1, 3.2, 4, 5 (calcul de clé), 6 (règle pure), 10, 13 et 14 de la spec. L'interface, les routes API, la session et le déploiement font l'objet du plan 2.

**Livrable vérifiable en fin de plan :** `pnpm test` vert, et une base Neon contenant environ 10 000 films avec affiche, synopsis français, date, durée, genres, tags français et plateformes.

## Global Constraints

- Gestionnaire de paquets : **pnpm**. Node 20.20 (déjà installé).
- TypeScript en mode **strict**. Aucun `any` implicite, aucun `@ts-ignore`.
- Toute l'interface et tous les messages d'erreur destinés à l'utilisateur sont **en français**.
- Les identifiants de plateformes TMDB ne sont **jamais codés en dur** : ils sont résolus par nom à chaque exécution.
- Valeurs vérifiées le 12 août 2026 : Netflix `8`, Netflix Standard with Ads `1796`, Disney Plus `337`, Canal+ `381` (c'est MyCanal). Canal VOD `58` est **exclu**.
- La collecte TMDB se fait **plateforme par plateforme**, jamais en une requête combinée : le plafond de TMDB est de 500 pages et la requête combinée en renvoie 499.
- `.env.local` n'est **jamais** commité. Il est déjà couvert par `.gitignore`.
- Alphabet des codes de salon : `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (32 caractères, sans `I`, `O`, `0`, `1`), longueur 6.
- Taille d'un salon : de **2 à 8** participants, effectif annoncé à la création. Seuil de match réglable entre **2** et l'effectif, valant l'effectif par défaut (unanimité). Aucun match tant que l'effectif annoncé n'est pas au complet.
- Formule de tri du paquet : `u × (1.30 − 0.60 × popularity_percentile)` où `u` provient des **7 premiers** caractères hexadécimaux de `md5(code_salon || ':' || id_film)` divisés par `0xFFFFFFF`. Sept et non huit : 28 bits n'activent jamais le bit de signe d'un entier Postgres.
- Un commit par tâche, message en français, à l'impératif.

---

## Structure des fichiers

| Fichier | Responsabilité | Tâche |
|---|---|---|
| `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts` | Configuration du projet | 1 |
| `app/layout.tsx`, `app/page.tsx`, `app/globals.css` | Coquille Next.js minimale | 1 |
| `lib/roomcode.ts` | Génération et validation des codes de salon | 2 |
| `lib/deck.ts` | Clé de tri pondérée du paquet | 3 |
| `lib/match.ts` | Règle de match : effectif complet et seuil de « j'aime » atteint | 4, 4b |
| `data/keywords-fr.json` | Dictionnaire mot-clé TMDB → français | 5 |
| `lib/keywords.ts` | Traduction des mots-clés et composition des tags | 5 |
| `lib/db/schema.ts` | Définition Drizzle des huit tables | 6 |
| `lib/db/client.ts` | Connexion Neon partagée | 6 |
| `drizzle.config.ts`, `drizzle/` | Configuration et migrations générées | 6 |
| `tests/helpers/db.ts` | Base PGlite jetable pour les tests d'intégration | 6 |
| `lib/tmdb.ts` | Client TMDB : requêtes, repli exponentiel, résolution des plateformes | 7 |
| `scripts/ingest.ts` | Ingestion en trois phases reprenables | 9 |
| `scripts/build-keywords.ts` | Recensement des mots-clés bruts par fréquence | 10 |

---

## Task 1: Échafaudage du projet et harnais de test

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`
- Create: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- Test: `tests/unit/smoke.test.ts`

**Interfaces:**
- Consumes: rien
- Produits: alias d'import `@/*` vers la racine du projet ; commandes `pnpm test`, `pnpm build`, `pnpm dev`

- [ ] **Step 1: Créer `package.json`**

```json
{
  "name": "soiree-popcorn",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx scripts/migrate.ts",
    "ingest": "tsx scripts/ingest.ts",
    "keywords": "tsx scripts/build-keywords.ts"
  },
  "dependencies": {
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "drizzle-orm": "^0.38.0",
    "@neondatabase/serverless": "^0.10.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@electric-sql/pglite": "^0.2.0",
    "@tailwindcss/postcss": "^4.0.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/ws": "^8.5.0",
    "drizzle-kit": "^0.30.0",
    "tailwindcss": "^4.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Créer `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Créer les fichiers de configuration Next, PostCSS et Vitest**

`next.config.ts` :

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'image.tmdb.org' }],
  },
}

export default nextConfig
```

`postcss.config.mjs` :

```js
export default {
  plugins: { '@tailwindcss/postcss': {} },
}
```

`vitest.config.ts` :

```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
  },
})
```

- [ ] **Step 4: Créer la coquille Next.js**

`app/globals.css` :

```css
@import "tailwindcss";
```

`app/layout.tsx` :

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Soirée Popcorn',
  description: 'Choisissez un film à deux, en balayant.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
```

`app/page.tsx` :

```tsx
export default function Home() {
  return <main>Soirée Popcorn</main>
}
```

- [ ] **Step 5: Écrire le test de fumée**

`tests/unit/smoke.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

describe('harnais de test', () => {
  it('exécute les tests', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 6: Installer et vérifier**

```bash
pnpm install
pnpm test
```

Attendu : `1 passed`.

```bash
pnpm build
```

Attendu : la compilation réussit et affiche la route `/`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Échafaude le projet Next.js et le harnais de test"
```

---

## Task 2: Codes de salon

**Files:**
- Create: `lib/roomcode.ts`
- Test: `tests/unit/roomcode.test.ts`

**Interfaces:**
- Consumes: rien
- Produit :
  - `ROOM_CODE_ALPHABET: string` — les 32 caractères autorisés
  - `ROOM_CODE_LENGTH: number` — vaut 6
  - `generateRoomCode(): string`
  - `normalizeRoomCode(input: string): string`
  - `isValidRoomCode(input: string): boolean`

- [ ] **Step 1: Écrire le test qui échoue**

`tests/unit/roomcode.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
} from '@/lib/roomcode'

describe('generateRoomCode', () => {
  it('produit un code de la bonne longueur', () => {
    expect(generateRoomCode()).toHaveLength(ROOM_CODE_LENGTH)
  })

  it("n'utilise jamais de caractère ambigu sur mille tirages", () => {
    for (let i = 0; i < 1000; i++) {
      const code = generateRoomCode()
      expect(code).not.toMatch(/[IO01]/)
      for (const c of code) expect(ROOM_CODE_ALPHABET).toContain(c)
    }
  })

  it('produit des codes différents', () => {
    const codes = new Set(Array.from({ length: 200 }, generateRoomCode))
    expect(codes.size).toBeGreaterThan(190)
  })
})

describe('normalizeRoomCode', () => {
  it('met en majuscules et retire espaces et tirets', () => {
    expect(normalizeRoomCode('  k4p-2m9 ')).toBe('K4P2M9')
  })
})

describe('isValidRoomCode', () => {
  it('accepte un code généré', () => {
    expect(isValidRoomCode(generateRoomCode())).toBe(true)
  })

  it('accepte une saisie en minuscules avec des espaces', () => {
    expect(isValidRoomCode(' k4p 2m9 ')).toBe(true)
  })

  it('refuse une mauvaise longueur', () => {
    expect(isValidRoomCode('K4P2M')).toBe(false)
    expect(isValidRoomCode('K4P2M99')).toBe(false)
  })

  it('refuse les caractères ambigus et hors alphabet', () => {
    expect(isValidRoomCode('K4P2MO')).toBe(false)
    expect(isValidRoomCode('K4P2M1')).toBe(false)
    expect(isValidRoomCode('K4P2M!')).toBe(false)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm vitest run tests/unit/roomcode.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "@/lib/roomcode"`.

- [ ] **Step 3: Écrire l'implémentation minimale**

`lib/roomcode.ts` :

```ts
import { randomInt } from 'node:crypto'

/** 32 caractères, sans I, O, 0 ni 1 — impossible de se tromper en dictant un code. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 6

export function generateRoomCode(): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]
  }
  return code
}

export function normalizeRoomCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase()
}

export function isValidRoomCode(input: string): boolean {
  const code = normalizeRoomCode(input)
  if (code.length !== ROOM_CODE_LENGTH) return false
  return [...code].every((c) => ROOM_CODE_ALPHABET.includes(c))
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
pnpm vitest run tests/unit/roomcode.test.ts
```

Attendu : `8 passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/roomcode.ts tests/unit/roomcode.test.ts
git commit -m "Ajoute la génération et la validation des codes de salon"
```

---

## Task 3: Clé de tri du paquet

**Files:**
- Create: `lib/deck.ts`
- Test: `tests/unit/deck.test.ts`

**Interfaces:**
- Consumes: rien
- Produit :
  - `BASE_WEIGHT: number` — vaut `1.3`
  - `POPULARITY_WEIGHT: number` — vaut `0.6`
  - `deckSortKey(roomCode: string, movieId: number, popularityPercentile: number): number`

- [ ] **Step 1: Écrire le test qui échoue**

`tests/unit/deck.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { deckSortKey } from '@/lib/deck'

describe('deckSortKey', () => {
  it('est déterministe pour les mêmes entrées', () => {
    expect(deckSortKey('K4P2M9', 550, 0.5)).toBe(deckSortKey('K4P2M9', 550, 0.5))
  })

  it('donne un ordre différent selon le salon', () => {
    const ids = Array.from({ length: 100 }, (_, i) => i + 1)
    const order = (room: string) =>
      [...ids].sort((a, b) => deckSortKey(room, a, 0) - deckSortKey(room, b, 0)).join(',')
    expect(order('AAAAAA')).not.toBe(order('BBBBBB'))
  })

  it('reste dans l’intervalle attendu', () => {
    for (let id = 1; id <= 500; id++) {
      const key = deckSortKey('K4P2M9', id, 0)
      expect(key).toBeGreaterThanOrEqual(0)
      expect(key).toBeLessThan(1.3)
    }
  })

  it('remonte les films populaires en moyenne', () => {
    const ids = Array.from({ length: 1000 }, (_, i) => i + 1)
    // les identifiants pairs sont très populaires, les impairs obscurs
    const pop = (id: number) => (id % 2 === 0 ? 1 : 0)
    const ordered = [...ids].sort(
      (a, b) => deckSortKey('K4P2M9', a, pop(a)) - deckSortKey('K4P2M9', b, pop(b)),
    )
    const positionMoyenne = (parite: number) => {
      const positions = ordered
        .map((id, index) => ({ id, index }))
        .filter(({ id }) => id % 2 === parite)
        .map(({ index }) => index)
      return positions.reduce((a, b) => a + b, 0) / positions.length
    }
    // Un écart de 150 places discrimine réellement : la formule pondérée sépare
    // les deux groupes d'environ 239 places, une formule sans pondération de 23.
    expect(positionMoyenne(1) - positionMoyenne(0)).toBeGreaterThan(150)
  })

  it('ne rend jamais un film obscur inatteignable', () => {
    const ids = Array.from({ length: 1000 }, (_, i) => i + 1)
    const pop = (id: number) => (id % 2 === 0 ? 1 : 0)
    const ordered = [...ids].sort(
      (a, b) => deckSortKey('K4P2M9', a, pop(a)) - deckSortKey('K4P2M9', b, pop(b)),
    )
    // au moins un film obscur figure dans le premier dixième du paquet
    expect(ordered.slice(0, 100).some((id) => id % 2 === 1)).toBe(true)
  })

  it('borne un percentile hors intervalle', () => {
    expect(deckSortKey('K4P2M9', 42, 5)).toBe(deckSortKey('K4P2M9', 42, 1))
    expect(deckSortKey('K4P2M9', 42, -5)).toBe(deckSortKey('K4P2M9', 42, 0))
  })

  it('traite un percentile NaN comme nul plutôt que de propager NaN', () => {
    expect(deckSortKey('K4P2M9', 42, Number.NaN)).toBe(deckSortKey('K4P2M9', 42, 0))
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm vitest run tests/unit/deck.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "@/lib/deck"`.

- [ ] **Step 3: Écrire l'implémentation minimale**

`lib/deck.ts` :

```ts
import { createHash } from 'node:crypto'

export const BASE_WEIGHT = 1.3
export const POPULARITY_WEIGHT = 0.6

/** Diviseur de 7 caractères hexadécimaux, soit 28 bits. */
const HASH_MAX = 0xfffffff

/**
 * Position d'un film dans le paquet d'un salon.
 *
 * Sept caractères hexadécimaux et non huit : 28 bits n'activent jamais le bit
 * de signe d'un entier Postgres, donc `::bit(28)::int` reste positif et l'ordre
 * SQL correspond exactement à celui calculé ici.
 */
export function deckSortKey(
  roomCode: string,
  movieId: number,
  popularityPercentile: number,
): number {
  const hex = createHash('md5').update(`${roomCode}:${movieId}`).digest('hex').slice(0, 7)
  const u = parseInt(hex, 16) / HASH_MAX
  const p = Number.isNaN(popularityPercentile) ? 0 : Math.min(1, Math.max(0, popularityPercentile))
  return u * (BASE_WEIGHT - POPULARITY_WEIGHT * p)
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
pnpm vitest run tests/unit/deck.test.ts
```

Attendu : `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/deck.ts tests/unit/deck.test.ts
git commit -m "Ajoute la clé de tri pondérée du paquet"
```

---

## Task 4: Règle de match

**Files:**
- Create: `lib/match.ts`
- Test: `tests/unit/match.test.ts`

**Interfaces:**
- Consumes: rien
- Produit : `shouldCreateMatch(memberIds: string[], likedByMemberIds: Iterable<string>): boolean`

- [ ] **Step 1: Écrire le test qui échoue**

`tests/unit/match.test.ts` :

```ts
import { describe, expect, it } from ‘vitest’
import { shouldCreateMatch } from ‘@/lib/match’

describe(‘shouldCreateMatch’, () => {
  it(‘crée un match quand les deux membres ont aimé’, () => {
    expect(shouldCreateMatch([‘djo’, ‘alice’], [‘djo’, ‘alice’])).toBe(true)
  })

  it(‘ne crée pas de match si un membre manque’, () => {
    expect(shouldCreateMatch([‘djo’, ‘alice’], [‘djo’])).toBe(false)
  })

  it(`ne crée jamais de match dans un salon d’une seule personne`, () => {
    expect(shouldCreateMatch([‘djo’], [‘djo’])).toBe(false)
  })

  it(‘ne se laisse pas duper par un identifiant en double’, () => {
    expect(shouldCreateMatch([‘solo’, ‘solo’], [‘solo’])).toBe(false)
  })

  it(‘déduplique sans empêcher un match légitime’, () => {
    expect(shouldCreateMatch([‘djo’, ‘djo’, ‘alice’], [‘djo’, ‘alice’])).toBe(true)
  })

  it(‘ne crée jamais de match dans un salon vide’, () => {
    expect(shouldCreateMatch([], [])).toBe(false)
  })

  it(‘exige que les trois membres aient aimé’, () => {
    expect(shouldCreateMatch([‘a’, ‘b’, ‘c’], [‘a’, ‘b’, ‘c’])).toBe(true)
    expect(shouldCreateMatch([‘a’, ‘b’, ‘c’], [‘a’, ‘b’])).toBe(false)
  })

  it(`ignore un like venant de quelqu’un qui a quitté le salon`, () => {
    expect(shouldCreateMatch([‘djo’, ‘alice’], [‘djo’, ‘alice’, ‘ancien’])).toBe(true)
    expect(shouldCreateMatch([‘djo’, ‘alice’], [‘djo’, ‘ancien’])).toBe(false)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm vitest run tests/unit/match.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "@/lib/match"`.

- [ ] **Step 3: Écrire l'implémentation minimale**

`lib/match.ts` :

```ts
/**
 * Un match naît quand *tous* les membres du salon ont aimé le film.
 *
 * Écrit pour N membres plutôt que pour 2 : cela ne coûte rien aujourd'hui et
 * permettra d'inviter des amis sans réécriture. Le garde-fou sur la taille du
 * salon empêche une personne seule de matcher avec elle-même.
 */
export function shouldCreateMatch(
  memberIds: string[],
  likedByMemberIds: Iterable<string>,
): boolean {
  const membresDistincts = new Set(memberIds)
  if (membresDistincts.size < 2) return false
  const liked = new Set(likedByMemberIds)
  return Array.from(membresDistincts).every((id) => liked.has(id))
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
pnpm vitest run tests/unit/match.test.ts
```

Attendu : `8 passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/match.ts tests/unit/match.test.ts
git commit -m "Ajoute la règle de création de match à N membres"
```

---

## Task 4b: Effectif du salon et seuil de match

La règle de la tâche 4 exige l'unanimité des membres présents. Deux exigences s'y ajoutent : un salon compte de 2 à 8 participants dont l'effectif est annoncé à la création, aucun match ne se crée tant que tout le monde n'a pas rejoint, et le nombre de « j'aime » requis est réglable entre 2 et l'effectif.

Le seuil existe parce que l'unanimité ne passe pas à l'échelle : à huit personnes aimant chacune 40 % des films, l'unanimité survient dans 0,07 % des cas.

**Files:**
- Modify: `lib/match.ts`
- Test: `tests/unit/match.test.ts`

**Interfaces:**
- Consumes: rien
- Produit :
  - `MIN_MEMBERS: number` — vaut 2
  - `MAX_MEMBERS: number` — vaut 8
  - `MatchRule` — `{ expectedMembers: number; threshold: number }`
  - `shouldCreateMatch(memberIds: string[], likedByMemberIds: Iterable<string>, rule: MatchRule): boolean` — **la signature change**, un troisième paramètre obligatoire apparaît

- [ ] **Step 1: Réécrire le test qui échoue**

Remplacer intégralement `tests/unit/match.test.ts` par :

```ts
import { describe, expect, it } from 'vitest'
import { MAX_MEMBERS, MIN_MEMBERS, shouldCreateMatch } from '@/lib/match'

/** Salon de `n` membres nommés m1…mn. */
const salon = (n: number) => Array.from({ length: n }, (_, i) => `m${i + 1}`)
/** Règle par défaut : unanimité sur un effectif de `n`. */
const unanimite = (n: number) => ({ expectedMembers: n, threshold: n })

describe('bornes', () => {
  it('expose un plancher de 2 et un plafond de 8', () => {
    expect(MIN_MEMBERS).toBe(2)
    expect(MAX_MEMBERS).toBe(8)
  })

  it('refuse un effectif hors bornes', () => {
    expect(shouldCreateMatch(salon(1), salon(1), unanimite(1))).toBe(false)
    expect(shouldCreateMatch(salon(9), salon(9), unanimite(9))).toBe(false)
  })

  it('refuse un seuil inférieur à 2, pour qu’un seul avis ne décide jamais', () => {
    expect(shouldCreateMatch(salon(4), ['m1'], { expectedMembers: 4, threshold: 1 })).toBe(false)
  })

  it('refuse un seuil supérieur à l’effectif', () => {
    expect(shouldCreateMatch(salon(4), salon(4), { expectedMembers: 4, threshold: 5 })).toBe(false)
  })
})

describe('effectif incomplet', () => {
  it('ne matche pas tant que tout le monde n’a pas rejoint', () => {
    // 5 arrivés sur 6 annoncés, tous les 5 ont aimé, seuil de 4 pourtant atteint
    expect(shouldCreateMatch(salon(5), salon(5), { expectedMembers: 6, threshold: 4 })).toBe(false)
  })

  it('matche dès que le dernier arrivant complète l’effectif', () => {
    expect(shouldCreateMatch(salon(6), salon(6), { expectedMembers: 6, threshold: 4 })).toBe(true)
  })

  it('ne compte pas un identifiant dupliqué comme un participant de plus', () => {
    expect(shouldCreateMatch(['solo', 'solo'], ['solo'], unanimite(2))).toBe(false)
  })
})

describe('seuil', () => {
  it('matche à deux quand les deux ont aimé', () => {
    expect(shouldCreateMatch(['djo', 'alice'], ['djo', 'alice'], unanimite(2))).toBe(true)
  })

  it('ne matche pas à deux si un seul a aimé', () => {
    expect(shouldCreateMatch(['djo', 'alice'], ['djo'], unanimite(2))).toBe(false)
  })

  it('matche quand le seuil est exactement atteint', () => {
    const aime = ['m1', 'm2', 'm3', 'm4']
    expect(shouldCreateMatch(salon(6), aime, { expectedMembers: 6, threshold: 4 })).toBe(true)
  })

  it('ne matche pas une voix en dessous du seuil', () => {
    const aime = ['m1', 'm2', 'm3']
    expect(shouldCreateMatch(salon(6), aime, { expectedMembers: 6, threshold: 4 })).toBe(false)
  })

  it('exige l’unanimité quand le seuil vaut l’effectif', () => {
    expect(shouldCreateMatch(salon(8), salon(8), unanimite(8))).toBe(true)
    expect(shouldCreateMatch(salon(8), salon(7), unanimite(8))).toBe(false)
  })
})

describe('likes étrangers au salon', () => {
  it('ignore le like de quelqu’un qui a quitté le salon', () => {
    expect(shouldCreateMatch(['djo', 'alice'], ['djo', 'alice', 'ancien'], unanimite(2))).toBe(true)
    expect(shouldCreateMatch(['djo', 'alice'], ['djo', 'ancien'], unanimite(2))).toBe(false)
  })

  it('ne laisse pas des likes étrangers atteindre le seuil à eux seuls', () => {
    const etrangers = ['x1', 'x2', 'x3', 'x4']
    expect(shouldCreateMatch(salon(6), etrangers, { expectedMembers: 6, threshold: 4 })).toBe(false)
  })

  it('déduplique sans empêcher un match légitime', () => {
    // « djo » compté une seule fois : 2 participants distincts, effectif de 2 annoncé,
    // les deux ont aimé — le dédoublonnage ne doit pas transformer ce cas valide en refus.
    expect(shouldCreateMatch(['djo', 'djo', 'alice'], ['djo', 'alice'], unanimite(2))).toBe(true)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm vitest run tests/unit/match.test.ts
```

Attendu : ÉCHEC — `MIN_MEMBERS`/`MAX_MEMBERS` n'existent pas et `shouldCreateMatch` n'accepte que deux arguments.

- [ ] **Step 3: Réécrire l'implémentation**

Remplacer intégralement `lib/match.ts` par :

```ts
export const MIN_MEMBERS = 2
export const MAX_MEMBERS = 8

export interface MatchRule {
  /** Effectif annoncé à la création du salon, entre MIN_MEMBERS et MAX_MEMBERS. */
  expectedMembers: number
  /** Nombre de « j'aime » requis, entre MIN_MEMBERS et expectedMembers. */
  threshold: number
}

/**
 * Un match naît quand deux conditions sont réunies : l'effectif annoncé est au
 * complet, et le nombre de membres ayant aimé le film atteint le seuil.
 *
 * Les identifiants sont dédoublonnés avant d'être comptés, pour qu'un doublon
 * ne puisse pas faire passer une personne pour deux participants.
 *
 * Le seuil existe parce que l'unanimité ne passe pas à l'échelle : à huit
 * personnes aimant chacune 40 % des films, elle survient dans 0,07 % des cas.
 * Son plancher de 2 empêche qu'un seul avis décide pour le groupe.
 */
export function shouldCreateMatch(
  memberIds: string[],
  likedByMemberIds: Iterable<string>,
  rule: MatchRule,
): boolean {
  const { expectedMembers, threshold } = rule

  if (!Number.isInteger(expectedMembers) || !Number.isInteger(threshold)) return false
  if (expectedMembers < MIN_MEMBERS || expectedMembers > MAX_MEMBERS) return false
  if (threshold < MIN_MEMBERS || threshold > expectedMembers) return false

  const membresDistincts = new Set(memberIds)
  if (membresDistincts.size !== expectedMembers) return false

  const liked = new Set(likedByMemberIds)
  let votes = 0
  for (const id of membresDistincts) {
    if (liked.has(id)) votes++
  }
  return votes >= threshold
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
pnpm vitest run tests/unit/match.test.ts
```

Attendu : `15 passed`.

- [ ] **Step 5: Vérifier que le seuil discrimine réellement**

Remplacer temporairement la dernière ligne par `return votes >= 1`, relancer le fichier, et constater que les tests de seuil échouent. Restaurer, relancer, constater `15 passed`. Ne pas commiter la version cassée.

- [ ] **Step 6: Commit**

```bash
git add lib/match.ts tests/unit/match.test.ts
git commit -m "Ajoute l'effectif du salon et le seuil de match réglable"
```

---

## Task 5: Dictionnaire de mots-clés et composition des tags

Le dictionnaire livré ici est une amorce d'environ 90 entrées choisies parmi les mots-clés TMDB les plus courants. La tâche 10 l'enrichira à partir des fréquences réelles du catalogue, une fois celui-ci ingéré.

**Files:**
- Create: `data/keywords-fr.json`
- Create: `lib/keywords.ts`
- Test: `tests/unit/keywords.test.ts`

**Interfaces:**
- Consumes: rien
- Produit :
  - `MAX_TAGS: number` — vaut 4
  - `translateKeywords(raw: string[]): string[]`
  - `buildTags(keywordsFr: string[], genresFr: string[], max?: number): string[]`

- [ ] **Step 1: Créer le dictionnaire d'amorce**

`data/keywords-fr.json` — les clés sont en minuscules, exactement comme TMDB les renvoie :

```json
{
  "medieval": "moyen-âge",
  "knight": "chevalier",
  "castle": "château",
  "superhero": "super-héros",
  "heist": "braquage",
  "time travel": "voyage dans le temps",
  "dystopia": "dystopie",
  "post-apocalyptic future": "post-apocalyptique",
  "space travel": "voyage spatial",
  "alien": "extraterrestre",
  "zombie": "zombies",
  "vampire": "vampires",
  "werewolf": "loups-garous",
  "ghost": "fantômes",
  "haunted house": "maison hantée",
  "serial killer": "tueur en série",
  "detective": "enquête",
  "police": "police",
  "spy": "espionnage",
  "world war ii": "seconde guerre mondiale",
  "world war i": "première guerre mondiale",
  "cold war": "guerre froide",
  "vietnam war": "guerre du vietnam",
  "based on novel or book": "tiré d'un livre",
  "based on true story": "histoire vraie",
  "based on comic": "tiré d'une bande dessinée",
  "based on video game": "tiré d'un jeu vidéo",
  "biography": "biographie",
  "road movie": "road movie",
  "coming of age": "passage à l'âge adulte",
  "high school": "lycée",
  "college": "études",
  "friendship": "amitié",
  "love triangle": "triangle amoureux",
  "wedding": "mariage",
  "christmas": "noël",
  "sport": "sport",
  "boxing": "boxe",
  "martial arts": "arts martiaux",
  "kung fu": "kung-fu",
  "samurai": "samouraï",
  "pirate": "pirates",
  "western": "western",
  "gangster": "gangsters",
  "mafia": "mafia",
  "prison": "prison",
  "courtroom": "procès",
  "journalism": "journalisme",
  "politics": "politique",
  "revenge": "vengeance",
  "survival": "survie",
  "shipwreck": "naufrage",
  "mountain": "montagne",
  "desert": "désert",
  "jungle": "jungle",
  "island": "île",
  "submarine": "sous-marin",
  "airplane": "avion",
  "train": "train",
  "car race": "course automobile",
  "robot": "robots",
  "artificial intelligence": "intelligence artificielle",
  "cyberpunk": "cyberpunk",
  "virtual reality": "réalité virtuelle",
  "magic": "magie",
  "witch": "sorcellerie",
  "dragon": "dragons",
  "fairy tale": "conte",
  "mythology": "mythologie",
  "greek mythology": "mythologie grecque",
  "ancient rome": "rome antique",
  "ancient egypt": "égypte antique",
  "victorian era": "époque victorienne",
  "1920s": "années 20",
  "1980s": "années 80",
  "paris": "paris",
  "new york city": "new york",
  "london": "londres",
  "japan": "japon",
  "italy": "italie",
  "africa": "afrique",
  "family": "famille",
  "father son relationship": "père et fils",
  "mother daughter relationship": "mère et fille",
  "adoption": "adoption",
  "grief": "deuil",
  "mental illness": "maladie mentale",
  "addiction": "addiction",
  "music": "musique",
  "rock and roll": "rock",
  "dance": "danse",
  "chef": "cuisine",
  "kidnapping": "enlèvement",
  "hostage": "prise d'otages",
  "conspiracy": "complot",
  "apocalypse": "apocalypse",
  "pandemic": "pandémie",
  "dinosaur": "dinosaures",
  "shark": "requins",
  "dog": "chien",
  "horse": "cheval",
  "talking animals": "animaux qui parlent",
  "anime": "animation japonaise",
  "sequel": "suite",
  "remake": "remake"
}
```

- [ ] **Step 2: Écrire le test qui échoue**

`tests/unit/keywords.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { MAX_TAGS, buildTags, translateKeywords } from '@/lib/keywords'

describe('translateKeywords', () => {
  it('traduit les mots-clés connus', () => {
    expect(translateKeywords(['medieval', 'heist'])).toEqual(['moyen-âge', 'braquage'])
  })

  it('ignore les mots-clés absents du dictionnaire plutôt que de les afficher en anglais', () => {
    expect(translateKeywords(['medieval', 'woman director', 'duringcreditsstinger'])).toEqual([
      'moyen-âge',
    ])
  })

  it('normalise la casse et les espaces', () => {
    expect(translateKeywords([' Medieval ', 'TIME TRAVEL'])).toEqual([
      'moyen-âge',
      'voyage dans le temps',
    ])
  })

  it('ne renvoie jamais de doublon', () => {
    expect(translateKeywords(['medieval', 'medieval'])).toEqual(['moyen-âge'])
  })

  it('renvoie une liste vide pour une entrée vide', () => {
    expect(translateKeywords([])).toEqual([])
  })
})

describe('buildTags', () => {
  it('place les mots-clés avant les genres', () => {
    expect(buildTags(['moyen-âge'], ['Aventure', 'Drame'])).toEqual([
      'moyen-âge',
      'Aventure',
      'Drame',
    ])
  })

  it('plafonne à quatre tags', () => {
    const tags = buildTags(
      ['moyen-âge', 'braquage', 'vengeance'],
      ['Action', 'Aventure', 'Drame'],
    )
    expect(tags).toHaveLength(MAX_TAGS)
    expect(tags).toEqual(['moyen-âge', 'braquage', 'vengeance', 'Action'])
  })

  it('déduplique entre mots-clés et genres', () => {
    expect(buildTags(['western'], ['western', 'Action'])).toEqual(['western', 'Action'])
  })

  it('accepte un plafond personnalisé', () => {
    expect(buildTags(['a', 'b', 'c'], ['d'], 2)).toEqual(['a', 'b'])
  })

  it('tombe sur les genres quand aucun mot-clé n’est traduit', () => {
    expect(buildTags([], ['Comédie'])).toEqual(['Comédie'])
  })
})
```

- [ ] **Step 3: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm vitest run tests/unit/keywords.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "@/lib/keywords"`.

- [ ] **Step 4: Écrire l'implémentation minimale**

`lib/keywords.ts` :

```ts
import dictionary from '@/data/keywords-fr.json'

const DICTIONARY = dictionary as Record<string, string>

export const MAX_TAGS = 4

/**
 * Traduit les mots-clés TMDB en français. Les mots-clés absents du dictionnaire
 * sont ignorés : mieux vaut moins de tags que du franglais sur la carte.
 */
export function translateKeywords(raw: string[]): string[] {
  const out: string[] = []
  for (const keyword of raw) {
    const french = DICTIONARY[keyword.trim().toLowerCase()]
    if (french && !out.includes(french)) out.push(french)
  }
  return out
}

/** Mots-clés d'abord, genres ensuite, sans doublon, plafonnés. */
export function buildTags(
  keywordsFr: string[],
  genresFr: string[],
  max: number = MAX_TAGS,
): string[] {
  const out: string[] = []
  for (const tag of [...keywordsFr, ...genresFr]) {
    if (!tag) continue
    if (!out.includes(tag)) out.push(tag)
    if (out.length >= max) break
  }
  return out
}
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

```bash
pnpm vitest run tests/unit/keywords.test.ts
```

Attendu : `10 passed`.

- [ ] **Step 6: Commit**

```bash
git add data/keywords-fr.json lib/keywords.ts tests/unit/keywords.test.ts
git commit -m "Ajoute le dictionnaire de mots-clés français et la composition des tags"
```

---

## Task 6: Schéma de base, migrations et harnais PGlite

Le test central de cette tâche vérifie que **l'ordre produit par SQL est exactement celui produit par `deckSortKey`**. C'est le seul endroit où une divergence entre les deux implémentations de la formule pourrait passer inaperçue et casser silencieusement les matchs.

**Files:**
- Create: `lib/db/schema.ts`, `lib/db/client.ts`, `drizzle.config.ts`, `scripts/migrate.ts`
- Create: `tests/helpers/db.ts`
- Test: `tests/integration/schema.test.ts`

**Interfaces:**
- Consumes: `deckSortKey` de la tâche 3
- Produit :
  - `lib/db/schema.ts` : `rooms`, `members`, `movies`, `memberFilters`, `swipes`, `matches`, `ingestState`, `rateLimits`
  - `lib/db/client.ts` : `db` (instance Drizzle branchée sur Neon), `pool`
  - `tests/helpers/db.ts` : `createTestDb(): Promise<{ db: TestDb; close: () => Promise<void> }>` et le type `TestDb`

- [ ] **Step 1: Écrire le schéma**

`lib/db/schema.ts` :

```ts
import { sql } from 'drizzle-orm'
import {
  bigserial,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

export const rooms = pgTable(
  'rooms',
  {
    code: text('code').primaryKey(),
    /** Effectif annoncé à la création : aucun match tant qu'il n'est pas atteint. */
    expectedMembers: integer('expected_members').notNull(),
    /** Nombre de « j'aime » requis, entre 2 et expectedMembers. */
    matchThreshold: integer('match_threshold').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('rooms_expected_members_range', sql`${t.expectedMembers} BETWEEN 2 AND 8`),
    check('rooms_threshold_range', sql`${t.matchThreshold} BETWEEN 2 AND ${t.expectedMembers}`),
  ],
)

export const members = pgTable(
  'members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomCode: text('room_code')
      .notNull()
      .references(() => rooms.code, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('members_room_name_unique').on(t.roomCode, t.displayName)],
)

export const movies = pgTable(
  'movies',
  {
    id: integer('id').primaryKey(),
    title: text('title').notNull(),
    originalTitle: text('original_title'),
    overview: text('overview'),
    posterPath: text('poster_path'),
    backdropPath: text('backdrop_path'),
    releaseDate: date('release_date'),
    releaseYear: integer('release_year'),
    runtime: integer('runtime'),
    voteAverage: real('vote_average'),
    voteCount: integer('vote_count'),
    popularity: real('popularity'),
    popularityPercentile: doublePrecision('popularity_percentile').notNull().default(0),
    genres: text('genres').array().notNull().default(sql`'{}'`),
    keywords: text('keywords').array().notNull().default(sql`'{}'`),
    providers: text('providers').array().notNull().default(sql`'{}'`),
    inTop200: boolean('in_top200').notNull().default(false),
    director: text('director'),
    detailFetchedAt: timestamp('detail_fetched_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('movies_genres_idx').using('gin', t.genres),
    index('movies_keywords_idx').using('gin', t.keywords),
    index('movies_providers_idx').using('gin', t.providers),
    index('movies_release_year_idx').on(t.releaseYear),
    index('movies_vote_average_idx').on(t.voteAverage),
    index('movies_top200_idx').on(t.inTop200),
    index('movies_detail_fetched_idx').on(t.detailFetchedAt),
  ],
)

export const memberFilters = pgTable('member_filters', {
  memberId: uuid('member_id')
    .primaryKey()
    .references(() => members.id, { onDelete: 'cascade' }),
  genres: text('genres').array().notNull().default(sql`'{}'`),
  yearFrom: integer('year_from'),
  yearTo: integer('year_to'),
  minRating: real('min_rating').notNull().default(0),
  maxRuntime: integer('max_runtime'),
  providers: text('providers').array().notNull().default(sql`'{}'`),
  includeTop200: boolean('include_top200').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const swipes = pgTable(
  'swipes',
  {
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    movieId: integer('movie_id')
      .notNull()
      .references(() => movies.id, { onDelete: 'cascade' }),
    liked: boolean('liked').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.memberId, t.movieId] }),
    index('swipes_member_recent_idx').on(t.memberId, t.createdAt),
  ],
)

export const matches = pgTable(
  'matches',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    roomCode: text('room_code')
      .notNull()
      .references(() => rooms.code, { onDelete: 'cascade' }),
    movieId: integer('movie_id')
      .notNull()
      .references(() => movies.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('a_voir'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('matches_room_movie_unique').on(t.roomCode, t.movieId),
    index('matches_room_id_idx').on(t.roomCode, t.id),
  ],
)

export const ingestState = pgTable('ingest_state', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull().defaultNow(),
})

export type MatchStatus = 'a_voir' | 'vu' | 'abandonne'
export type ProviderKey = 'netflix' | 'canal' | 'disney'
```

- [ ] **Step 2: Écrire le client et la configuration Drizzle**

`lib/db/client.ts` :

```ts
import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import ws from 'ws'
import * as schema from './schema'

// Le pilote WebSocket est nécessaire hors navigateur (scripts et fonctions Node).
if (typeof WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws
}

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL est absent. Copiez .env.example vers .env.local et remplissez-le.')
}

export const pool = new Pool({ connectionString })
export const db = drizzle(pool, { schema })
```

`drizzle.config.ts` :

```ts
import type { Config } from 'drizzle-kit'

export default {
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
} satisfies Config
```

`scripts/migrate.ts` :

```ts
import 'dotenv/config'
import { migrate } from 'drizzle-orm/neon-serverless/migrator'
import { db, pool } from '@/lib/db/client'

await migrate(db, { migrationsFolder: './drizzle' })
await pool.end()
console.log('Migrations appliquées.')
```

Ajouter `dotenv` aux dépendances de développement :

```bash
pnpm add -D dotenv
```

- [ ] **Step 3: Générer la migration**

```bash
pnpm db:generate
```

Attendu : un fichier `drizzle/0000_*.sql` est créé et contient `CREATE TABLE "movies"` ainsi que les index GIN.

Vérifier :

```bash
grep -c "CREATE TABLE" drizzle/0000_*.sql
```

Attendu : `8`.

- [ ] **Step 4: Écrire le harnais de base jetable**

`tests/helpers/db.ts` :

```ts
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import * as schema from '@/lib/db/schema'

export type TestDb = ReturnType<typeof drizzle<typeof schema>>

/**
 * Postgres embarqué, en mémoire, sans Docker ni service distant.
 * Chaque appel produit une base neuve et migrée.
 */
export async function createTestDb(): Promise<{ db: TestDb; close: () => Promise<void> }> {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  return { db, close: () => client.close() }
}
```

- [ ] **Step 5: Écrire le test d'intégration qui échoue**

`tests/integration/schema.test.ts` :

```ts
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deckSortKey } from '@/lib/deck'
import { matches, members, movies, rooms, swipes } from '@/lib/db/schema'
import { createTestDb, type TestDb } from '@/tests/helpers/db'

let db: TestDb
let close: () => Promise<void>

beforeEach(async () => {
  ;({ db, close } = await createTestDb())
})

afterEach(async () => {
  await close()
})

async function seedMovies(count: number) {
  await db.insert(movies).values(
    Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      title: `Film ${i + 1}`,
      popularityPercentile: (i % 10) / 10,
    })),
  )
}

describe('schéma', () => {
  it('crée les huit tables', async () => {
    const rows = await db.execute<{ table_name: string }>(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    )
    const names = rows.rows.map((r) => r.table_name).sort()
    expect(names).toEqual([
      'ingest_state',
      'matches',
      'member_filters',
      'members',
      'movies',
      'rate_limits',
      'rooms',
      'swipes',
    ])
  })

  it('interdit deux balayages du même membre sur le même film', async () => {
    await db.insert(rooms).values({ code: 'K4P2M9', expectedMembers: 2, matchThreshold: 2 })
    const [member] = await db
      .insert(members)
      .values({ roomCode: 'K4P2M9', displayName: 'Djo' })
      .returning()
    await seedMovies(1)

    await db.insert(swipes).values({ memberId: member.id, movieId: 1, liked: true })
    const inserted = await db
      .insert(swipes)
      .values({ memberId: member.id, movieId: 1, liked: false })
      .onConflictDoNothing()
      .returning()

    expect(inserted).toHaveLength(0)
  })

  it('interdit deux matchs sur le même film dans le même salon', async () => {
    await db.insert(rooms).values({ code: 'K4P2M9', expectedMembers: 2, matchThreshold: 2 })
    await seedMovies(1)

    await db.insert(matches).values({ roomCode: 'K4P2M9', movieId: 1 })
    const inserted = await db
      .insert(matches)
      .values({ roomCode: 'K4P2M9', movieId: 1 })
      .onConflictDoNothing()
      .returning()

    expect(inserted).toHaveLength(0)
  })

  it('supprime les membres et les balayages avec le salon', async () => {
    await db.insert(rooms).values({ code: 'K4P2M9', expectedMembers: 2, matchThreshold: 2 })
    const [member] = await db
      .insert(members)
      .values({ roomCode: 'K4P2M9', displayName: 'Djo' })
      .returning()
    await seedMovies(1)
    await db.insert(swipes).values({ memberId: member.id, movieId: 1, liked: true })

    await db.delete(rooms)

    expect(await db.select().from(members)).toHaveLength(0)
    expect(await db.select().from(swipes)).toHaveLength(0)
  })

  it('refuse un effectif hors des bornes 2 à 8', async () => {
    await expect(
      db.insert(rooms).values({ code: 'TROP01', expectedMembers: 9, matchThreshold: 2 }),
    ).rejects.toThrow()
    await expect(
      db.insert(rooms).values({ code: 'PEU001', expectedMembers: 1, matchThreshold: 2 }),
    ).rejects.toThrow()
  })

  it('refuse un seuil hors des bornes 2 à effectif', async () => {
    await expect(
      db.insert(rooms).values({ code: 'SEUI01', expectedMembers: 4, matchThreshold: 5 }),
    ).rejects.toThrow()
    await expect(
      db.insert(rooms).values({ code: 'SEUI02', expectedMembers: 4, matchThreshold: 1 }),
    ).rejects.toThrow()
  })
})

describe('ordre du paquet', () => {
  it("l'ordre SQL correspond exactement à deckSortKey", async () => {
    await seedMovies(300)
    const room = 'K4P2M9'

    const result = await db.execute<{ id: number }>(sql`
      SELECT id FROM movies
      ORDER BY (('x' || substr(md5(${room} || ':' || id::text), 1, 7))::bit(28)::int::double precision
                / 268435455.0)
               * (1.30 - 0.60 * popularity_percentile),
               id
    `)
    const ordreSql = result.rows.map((r) => Number(r.id))

    const lignes = await db.select().from(movies)
    const ordreTs = [...lignes]
      .sort((a, b) => {
        const ka = deckSortKey(room, a.id, a.popularityPercentile)
        const kb = deckSortKey(room, b.id, b.popularityPercentile)
        return ka - kb || a.id - b.id
      })
      .map((m) => m.id)

    expect(ordreSql).toEqual(ordreTs)
  })

  it('la clé SQL est toujours positive', async () => {
    await seedMovies(500)
    const result = await db.execute<{ mini: number }>(sql`
      SELECT MIN(('x' || substr(md5('K4P2M9' || ':' || id::text), 1, 7))::bit(28)::int) AS mini
      FROM movies
    `)
    expect(Number(result.rows[0].mini)).toBeGreaterThanOrEqual(0)
  })
})
```

- [ ] **Step 6: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm vitest run tests/integration/schema.test.ts
```

Attendu : ÉCHEC — le module `@/lib/db/schema` ou le dossier `drizzle` est introuvable tant que l'étape 3 n'a pas été faite. Si l'étape 3 est faite, ce test doit déjà passer : dans ce cas, vérifier qu'il échoue en changeant temporairement `1, 7` en `1, 8` dans la requête SQL du test d'ordre — il doit alors échouer, ce qui prouve que le test détecte bien une divergence. Remettre `1, 7` ensuite.

- [ ] **Step 7: Lancer tous les tests**

```bash
pnpm test
```

Attendu : tous les tests passent, dont les 6 du fichier d'intégration.

- [ ] **Step 8: Commit**

```bash
git add lib/db drizzle drizzle.config.ts scripts/migrate.ts tests/helpers tests/integration package.json pnpm-lock.yaml
git commit -m "Ajoute le schéma de base, les migrations et le harnais PGlite"
```

---

## Task 7: Client TMDB

**Files:**
- Create: `lib/tmdb.ts`
- Test: `tests/unit/tmdb.test.ts`

**Interfaces:**
- Consumes: `ProviderKey` de `lib/db/schema.ts`
- Produit :
  - `TmdbClient` avec `listProviders()`, `resolveProviderIds()`, `discover(providerId, page)`, `topRated(page)`, `movieDetail(id)`
  - Types `TmdbProvider`, `TmdbPage`, `TmdbMovieDetail`
  - `PROVIDER_MATCHERS: { key: ProviderKey; test: (name: string) => boolean }[]`

- [ ] **Step 1: Écrire le test qui échoue**

`tests/unit/tmdb.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest'
import { TmdbClient } from '@/lib/tmdb'

function fakeResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers })
}

function client(fetchImpl: typeof fetch) {
  return new TmdbClient({ token: 'jeton-de-test', fetchImpl, sleepImpl: async () => {} })
}

describe('TmdbClient', () => {
  it('envoie le jeton et force le français', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ results: [] }))
    await client(fetchImpl as unknown as typeof fetch).listProviders()

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit]
    expect(url.toString()).toContain('language=fr-FR')
    expect(url.toString()).toContain('watch_region=FR')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jeton-de-test')
  })

  it('réessaie après un 429 puis réussit', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({}, 429, { 'retry-after': '0' }))
      .mockResolvedValueOnce(fakeResponse({ results: [{ provider_id: 8, provider_name: 'Netflix' }] }))

    const providers = await client(fetchImpl as unknown as typeof fetch).listProviders()

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(providers).toEqual([{ provider_id: 8, provider_name: 'Netflix' }])
  })

  it('abandonne après six tentatives', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({}, 500))
    await expect(client(fetchImpl as unknown as typeof fetch).listProviders()).rejects.toThrow(
      /6 tentatives/,
    )
    expect(fetchImpl).toHaveBeenCalledTimes(6)
  })

  it('ne réessaie pas sur un 404', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({}, 404))
    await expect(client(fetchImpl as unknown as typeof fetch).movieDetail(1)).rejects.toThrow(/404/)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('resolveProviderIds', () => {
  const listeTmdb = [
    { provider_id: 8, provider_name: 'Netflix' },
    { provider_id: 1796, provider_name: 'Netflix Standard with Ads' },
    { provider_id: 337, provider_name: 'Disney Plus' },
    { provider_id: 381, provider_name: 'Canal+' },
    { provider_id: 58, provider_name: 'Canal VOD' },
    { provider_id: 119, provider_name: 'Amazon Prime Video' },
  ]

  it('retient les bonnes plateformes et écarte Canal VOD', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ results: listeTmdb }))
    const resolved = await client(fetchImpl as unknown as typeof fetch).resolveProviderIds()

    expect(resolved).toEqual([
      { key: 'netflix', ids: [8, 1796] },
      { key: 'disney', ids: [337] },
      { key: 'canal', ids: [381] },
    ])
  })

  it('échoue bruyamment si une plateforme attendue a disparu', async () => {
    const sansDisney = listeTmdb.filter((p) => p.provider_id !== 337)
    const fetchImpl = vi.fn(async () => fakeResponse({ results: sansDisney }))
    await expect(
      client(fetchImpl as unknown as typeof fetch).resolveProviderIds(),
    ).rejects.toThrow(/disney/i)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm vitest run tests/unit/tmdb.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "@/lib/tmdb"`.

- [ ] **Step 3: Écrire l'implémentation minimale**

`lib/tmdb.ts` :

```ts
import type { ProviderKey } from '@/lib/db/schema'

const BASE_URL = 'https://api.themoviedb.org/3'
const MAX_ATTEMPTS = 6

export interface TmdbProvider {
  provider_id: number
  provider_name: string
}

export interface TmdbPage<T> {
  page: number
  results: T[]
  total_pages: number
  total_results: number
}

export interface TmdbMovieSummary {
  id: number
  title: string
}

export interface TmdbMovieDetail {
  id: number
  title: string
  original_title: string | null
  overview: string | null
  poster_path: string | null
  backdrop_path: string | null
  release_date: string | null
  runtime: number | null
  vote_average: number | null
  vote_count: number | null
  popularity: number | null
  genres: { id: number; name: string }[]
  keywords?: { keywords: { id: number; name: string }[] }
  credits?: { crew: { job: string; name: string }[] }
  'watch/providers'?: {
    results?: { FR?: { flatrate?: TmdbProvider[] } }
  }
}

/**
 * Les identifiants ne sont jamais codés en dur : TMDB les renomme et les
 * renumérote. « Canal VOD » ne commence pas par « Canal+ » et se trouve donc
 * naturellement écarté, en plus du filtre `flatrate`.
 */
export const PROVIDER_MATCHERS: { key: ProviderKey; test: (name: string) => boolean }[] = [
  { key: 'netflix', test: (n) => /^netflix/i.test(n) },
  { key: 'disney', test: (n) => /^disney plus$/i.test(n) },
  { key: 'canal', test: (n) => /^canal\+/i.test(n) },
]

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export interface TmdbClientOptions {
  token?: string
  fetchImpl?: typeof fetch
  sleepImpl?: (ms: number) => Promise<void>
}

export class TmdbClient {
  private token: string
  private fetchImpl: typeof fetch
  private sleepImpl: (ms: number) => Promise<void>

  constructor(options: TmdbClientOptions = {}) {
    const token = options.token ?? process.env.TMDB_READ_TOKEN
    if (!token) throw new Error('TMDB_READ_TOKEN est absent de l’environnement.')
    this.token = token
    this.fetchImpl = options.fetchImpl ?? fetch
    this.sleepImpl = options.sleepImpl ?? sleep
  }

  private async get<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<T> {
    const url = new URL(BASE_URL + path)
    url.searchParams.set('language', 'fr-FR')
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const response = await this.fetchImpl(url, {
        headers: { Authorization: `Bearer ${this.token}`, accept: 'application/json' },
      })

      if (response.ok) return (await response.json()) as T

      const recuperable = response.status === 429 || response.status >= 500
      if (!recuperable) throw new Error(`TMDB a répondu ${response.status} sur ${path}`)
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`TMDB a répondu ${response.status} sur ${path} après 6 tentatives`)
      }

      const retryAfter = Number(response.headers.get('retry-after'))
      const attente = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 2 ** (attempt - 1) * 500
      await this.sleepImpl(attente)
    }

    throw new Error('inatteignable')
  }

  async listProviders(): Promise<TmdbProvider[]> {
    const page = await this.get<{ results: TmdbProvider[] }>('/watch/providers/movie', {
      watch_region: 'FR',
    })
    return page.results
  }

  async resolveProviderIds(): Promise<{ key: ProviderKey; ids: number[] }[]> {
    const providers = await this.listProviders()
    return PROVIDER_MATCHERS.map(({ key, test }) => {
      const ids = providers.filter((p) => test(p.provider_name)).map((p) => p.provider_id)
      if (ids.length === 0) {
        throw new Error(
          `Aucun fournisseur TMDB ne correspond à « ${key} » en France. ` +
            'Le nom a probablement changé : mettre à jour PROVIDER_MATCHERS.',
        )
      }
      return { key, ids }
    })
  }

  discover(providerId: number, page: number): Promise<TmdbPage<TmdbMovieSummary>> {
    return this.get<TmdbPage<TmdbMovieSummary>>('/discover/movie', {
      watch_region: 'FR',
      with_watch_providers: providerId,
      with_watch_monetization_types: 'flatrate',
      sort_by: 'popularity.desc',
      page,
    })
  }

  topRated(page: number): Promise<TmdbPage<TmdbMovieSummary>> {
    return this.get<TmdbPage<TmdbMovieSummary>>('/movie/top_rated', { page })
  }

  movieDetail(id: number): Promise<TmdbMovieDetail> {
    return this.get<TmdbMovieDetail>(`/movie/${id}`, {
      append_to_response: 'keywords,credits,watch/providers',
    })
  }
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
pnpm vitest run tests/unit/tmdb.test.ts
```

Attendu : `6 passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/tmdb.ts tests/unit/tmdb.test.ts
git commit -m "Ajoute le client TMDB avec repli exponentiel et résolution des plateformes"
```

---

## Task 8: Base Neon et application des migrations

Cette tâche comporte une action manuelle de l'utilisateur. Ne pas tenter de créer le projet Neon en ligne de commande.

**Files:**
- Modify: `.env.local` (non commité)

**Interfaces:**
- Consumes: `scripts/migrate.ts` de la tâche 6
- Produit : une base Neon accessible via `DATABASE_URL`, avec les huit tables créées

- [ ] **Step 1: Demander à l'utilisateur de créer la base**

Message à afficher, mot pour mot :

> Il me faut une base Neon. Deux minutes :
> 1. Va sur https://neon.tech, connecte-toi avec GitHub.
> 2. Crée un projet nommé `soiree-popcorn`, région **Europe (Frankfurt)**.
> 3. Copie la chaîne de connexion (« Connection string », format `postgresql://…?sslmode=require`).
> 4. Colle-la ici.
>
> On la reliera à Vercel au moment du déploiement — pour l'instant elle sert au développement local et à l'ingestion.

Attendre la réponse. Ne pas continuer sans la chaîne.

- [ ] **Step 2: Renseigner `.env.local`**

Remplir la ligne `DATABASE_URL=` avec la chaîne fournie, puis générer les deux secrets :

```bash
echo "SESSION_SECRET=$(openssl rand -hex 32)" && echo "CRON_SECRET=$(openssl rand -hex 32)"
```

Reporter les deux valeurs dans `.env.local`. Vérifier qu'il reste ignoré :

```bash
git check-ignore -v .env.local
```

Attendu : `.gitignore:13:.env.*	.env.local`.

- [ ] **Step 3: Appliquer les migrations**

```bash
pnpm db:migrate
```

Attendu : `Migrations appliquées.`

- [ ] **Step 4: Vérifier les tables**

```bash
pnpm tsx -e "import 'dotenv/config'; import { sql } from 'drizzle-orm'; import { db, pool } from './lib/db/client.ts'; const r = await db.execute(sql\`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1\`); console.log(r.rows.map(x => x.table_name).join(', ')); await pool.end()"
```

Attendu : `ingest_state, matches, member_filters, members, movies, rate_limits, rooms, swipes`.

- [ ] **Step 5: Commit**

Rien à commiter — `.env.local` est ignoré et les migrations l'ont déjà été à la tâche 6. Confirmer :

```bash
git status --short
```

Attendu : aucune sortie.

---

## Task 9: Script d'ingestion

Trois phases, chacune reprenable. La progression n'est pas stockée dans un gros document JSON mais portée par la base : la phase 2 traite simplement les films dont le détail n'a pas encore été récupéré.

**Files:**
- Create: `scripts/ingest.ts`
- Test: `tests/integration/ingest.test.ts`

**Interfaces:**
- Consumes: `TmdbClient` (tâche 7), `translateKeywords` et `buildTags` (tâche 5), le schéma (tâche 6)
- Produit :
  - `collectCatalogue(client, db, log): Promise<number>` — phase 1, renvoie le nombre de films recensés
  - `fetchDetails(client, db, log): Promise<number>` — phase 2, renvoie le nombre de films complétés
  - `computePercentiles(db): Promise<void>` — phase 3
  - `mapDetailToRow(detail: TmdbMovieDetail)` — conversion pure, exportée pour les tests

- [ ] **Step 1: Écrire le test qui échoue**

`tests/integration/ingest.test.ts` :

```ts
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { movies } from '@/lib/db/schema'
import type { TmdbMovieDetail } from '@/lib/tmdb'
import { computePercentiles, mapDetailToRow } from '@/scripts/ingest'
import { createTestDb, type TestDb } from '@/tests/helpers/db'

let db: TestDb
let close: () => Promise<void>

beforeEach(async () => {
  ;({ db, close } = await createTestDb())
})

afterEach(async () => {
  await close()
})

const detail: TmdbMovieDetail = {
  id: 598,
  title: 'Le Nom de la Rose',
  original_title: 'Der Name der Rose',
  overview: 'Un moine franciscain enquête sur des morts suspectes.',
  poster_path: '/abc.jpg',
  backdrop_path: '/def.jpg',
  release_date: '1986-09-24',
  runtime: 130,
  vote_average: 7.8,
  vote_count: 3200,
  popularity: 42.5,
  genres: [{ id: 9648, name: 'Mystère' }, { id: 12, name: 'Aventure' }],
  keywords: { keywords: [{ id: 1, name: 'medieval' }, { id: 2, name: 'woman director' }] },
  credits: { crew: [{ job: 'Producer', name: 'X' }, { job: 'Director', name: 'Jean-Jacques Annaud' }] },
  'watch/providers': {
    results: { FR: { flatrate: [{ provider_id: 8, provider_name: 'Netflix' }] } },
  },
}

describe('mapDetailToRow', () => {
  it('extrait année, réalisateur et tags français', () => {
    const row = mapDetailToRow(detail)
    expect(row.releaseYear).toBe(1986)
    expect(row.director).toBe('Jean-Jacques Annaud')
    expect(row.keywords).toEqual(['moyen-âge'])
    expect(row.genres).toEqual(['Mystère', 'Aventure'])
    expect(row.runtime).toBe(130)
  })

  it('ignore les mots-clés hors dictionnaire', () => {
    expect(mapDetailToRow(detail).keywords).not.toContain('woman director')
  })

  it('supporte une date de sortie absente', () => {
    const row = mapDetailToRow({ ...detail, release_date: null })
    expect(row.releaseYear).toBeNull()
    expect(row.releaseDate).toBeNull()
  })

  it('supporte un film sans réalisateur ni mots-clés', () => {
    const row = mapDetailToRow({ ...detail, credits: undefined, keywords: undefined })
    expect(row.director).toBeNull()
    expect(row.keywords).toEqual([])
  })
})

describe('computePercentiles', () => {
  it('classe les films du moins au plus populaire entre 0 et 1', async () => {
    await db.insert(movies).values([
      { id: 1, title: 'Obscur', popularity: 1 },
      { id: 2, title: 'Moyen', popularity: 50 },
      { id: 3, title: 'Célèbre', popularity: 900 },
    ])

    await computePercentiles(db)

    const rows = await db.select().from(movies).orderBy(movies.id)
    expect(rows[0].popularityPercentile).toBe(0)
    expect(rows[1].popularityPercentile).toBeCloseTo(0.5, 5)
    expect(rows[2].popularityPercentile).toBe(1)
  })

  it('traite une popularité absente comme la plus basse', async () => {
    await db.insert(movies).values([
      { id: 1, title: 'Sans donnée', popularity: null },
      { id: 2, title: 'Célèbre', popularity: 900 },
    ])

    await computePercentiles(db)

    const rows = await db.select().from(movies).orderBy(movies.id)
    expect(rows[0].popularityPercentile).toBe(0)
    expect(rows[1].popularityPercentile).toBe(1)
  })
})

describe('upsert des plateformes', () => {
  it('accumule les plateformes sans doublon quand un film est vu deux fois', async () => {
    await db.execute(sql`
      INSERT INTO movies (id, title, providers) VALUES (1, 'Film', ARRAY['netflix'])
      ON CONFLICT (id) DO NOTHING
    `)
    await db.execute(sql`
      INSERT INTO movies (id, title, providers) VALUES (1, 'Film', ARRAY['disney'])
      ON CONFLICT (id) DO UPDATE SET providers = (
        SELECT COALESCE(array_agg(DISTINCT p ORDER BY p), '{}')
        FROM unnest(movies.providers || excluded.providers) AS p
      )
    `)

    const [row] = await db.select().from(movies)
    expect(row.providers).toEqual(['disney', 'netflix'])
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm vitest run tests/integration/ingest.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "@/scripts/ingest"`.

- [ ] **Step 3: Écrire le script**

`scripts/ingest.ts` :

```ts
import 'dotenv/config'
import { sql } from 'drizzle-orm'
import { translateKeywords } from '@/lib/keywords'
import type { ProviderKey } from '@/lib/db/schema'
import { TmdbClient, type TmdbMovieDetail } from '@/lib/tmdb'

/** Toute base Postgres pilotée par Drizzle : Neon en production, PGlite en test. */
type AnyDb = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }

const TOP_RATED_PAGES = 10
const DETAIL_CONCURRENCY = 8
const DETAIL_BATCH = 200

export function mapDetailToRow(detail: TmdbMovieDetail) {
  const genres = detail.genres.map((g) => g.name)
  const keywordsFr = translateKeywords((detail.keywords?.keywords ?? []).map((k) => k.name))
  const director = detail.credits?.crew.find((c) => c.job === 'Director')?.name ?? null
  const flatrate = detail['watch/providers']?.results?.FR?.flatrate ?? []

  const providers: ProviderKey[] = []
  for (const p of flatrate) {
    if (/^netflix/i.test(p.provider_name) && !providers.includes('netflix')) providers.push('netflix')
    if (/^disney plus$/i.test(p.provider_name) && !providers.includes('disney')) providers.push('disney')
    if (/^canal\+/i.test(p.provider_name) && !providers.includes('canal')) providers.push('canal')
  }

  return {
    id: detail.id,
    title: detail.title,
    originalTitle: detail.original_title,
    overview: detail.overview,
    posterPath: detail.poster_path,
    backdropPath: detail.backdrop_path,
    releaseDate: detail.release_date || null,
    releaseYear: detail.release_date ? Number(detail.release_date.slice(0, 4)) : null,
    runtime: detail.runtime,
    voteAverage: detail.vote_average,
    voteCount: detail.vote_count,
    popularity: detail.popularity,
    genres,
    keywords: keywordsFr,
    providers,
    director,
  }
}
```

Les quatre tags affichés ne sont pas stockés : ils se recomposent à l'affichage avec `buildTags(keywords, genres)`. Stocker un dérivé de deux colonnes déjà présentes obligerait à le régénérer à chaque évolution du dictionnaire.

```ts

/** Phase 1 — recense les identifiants et pose une ligne minimale par film. */
export async function collectCatalogue(
  client: TmdbClient,
  db: AnyDb,
  log: (message: string) => void,
): Promise<number> {
  const resolved = await client.resolveProviderIds()
  log(
    'Plateformes résolues : ' +
      resolved.map((r) => `${r.key}=${r.ids.join('|')}`).join(', '),
  )

  let total = 0

  for (const { key, ids } of resolved) {
    for (const providerId of ids) {
      const first = await client.discover(providerId, 1)
      const pages = Math.min(first.total_pages, 500)
      if (first.total_pages > 500) {
        log(
          `ATTENTION : ${key}/${providerId} annonce ${first.total_pages} pages, ` +
            'plafonné à 500 par TMDB. Des films sont perdus — découper par années.',
        )
      }
      log(`${key}/${providerId} : ${first.total_results} films sur ${pages} pages`)

      for (let page = 1; page <= pages; page++) {
        const data = page === 1 ? first : await client.discover(providerId, page)
        for (const movie of data.results) {
          await upsertStub(db, movie.id, movie.title, key, false)
          total++
        }
      }
    }
  }

  for (let page = 1; page <= TOP_RATED_PAGES; page++) {
    const data = await client.topRated(page)
    for (const movie of data.results) {
      await upsertStub(db, movie.id, movie.title, null, true)
      total++
    }
  }

  log(`Phase 1 terminée : ${total} lignes recensées (doublons inclus).`)
  return total
}

async function upsertStub(
  db: AnyDb,
  id: number,
  title: string,
  provider: ProviderKey | null,
  inTop200: boolean,
) {
  const nouveaux = provider ? sql`ARRAY[${provider}]::text[]` : sql`'{}'::text[]`
  await db.execute(sql`
    INSERT INTO movies (id, title, providers, in_top200)
    VALUES (${id}, ${title}, ${nouveaux}, ${inTop200})
    ON CONFLICT (id) DO UPDATE SET
      providers = (
        SELECT COALESCE(array_agg(DISTINCT p ORDER BY p), '{}')
        FROM unnest(movies.providers || excluded.providers) AS p
      ),
      in_top200 = movies.in_top200 OR excluded.in_top200
  `)
}

/** Phase 2 — complète les films dont le détail manque. */
export async function fetchDetails(
  client: TmdbClient,
  db: AnyDb,
  log: (message: string) => void,
): Promise<number> {
  let complets = 0

  for (;;) {
    const result = (await db.execute(sql`
      SELECT id FROM movies WHERE detail_fetched_at IS NULL LIMIT ${DETAIL_BATCH}
    `)) as { rows: { id: number }[] }
    const ids = result.rows.map((r) => Number(r.id))
    if (ids.length === 0) break

    for (let i = 0; i < ids.length; i += DETAIL_CONCURRENCY) {
      const lot = ids.slice(i, i + DETAIL_CONCURRENCY)
      await Promise.all(
        lot.map(async (id) => {
          try {
            const row = mapDetailToRow(await client.movieDetail(id))
            await db.execute(sql`
              UPDATE movies SET
                title = ${row.title},
                original_title = ${row.originalTitle},
                overview = ${row.overview},
                poster_path = ${row.posterPath},
                backdrop_path = ${row.backdropPath},
                release_date = ${row.releaseDate}::date,
                release_year = ${row.releaseYear},
                runtime = ${row.runtime},
                vote_average = ${row.voteAverage},
                vote_count = ${row.voteCount},
                popularity = ${row.popularity},
                genres = ${sql.raw(pgArray(row.genres))},
                keywords = ${sql.raw(pgArray(row.keywords))},
                director = ${row.director},
                detail_fetched_at = now(),
                updated_at = now()
              WHERE id = ${id}
            `)
            complets++
          } catch (error) {
            log(`Film ${id} ignoré : ${(error as Error).message}`)
            await db.execute(sql`UPDATE movies SET detail_fetched_at = now() WHERE id = ${id}`)
          }
        }),
      )
    }
    log(`Phase 2 : ${complets} films complétés…`)
  }

  return complets
}

function pgArray(values: string[]): string {
  if (values.length === 0) return `'{}'::text[]`
  const echappees = values.map((v) => `'${v.replace(/'/g, "''")}'`).join(',')
  return `ARRAY[${echappees}]::text[]`
}

/** Phase 3 — rang de popularité relatif, entre 0 et 1. */
export async function computePercentiles(db: AnyDb): Promise<void> {
  await db.execute(sql`
    UPDATE movies m
    SET popularity_percentile = r.pct
    FROM (
      SELECT id, percent_rank() OVER (ORDER BY COALESCE(popularity, 0)) AS pct
      FROM movies
    ) r
    WHERE m.id = r.id
  `)
}

async function main() {
  const { db, pool } = await import('@/lib/db/client')
  const client = new TmdbClient()
  const log = (message: string) => console.log(`[${new Date().toISOString()}] ${message}`)

  const debut = Date.now()
  await collectCatalogue(client, db, log)
  await fetchDetails(client, db, log)
  await computePercentiles(db)

  const total = (await db.execute(sql`SELECT count(*)::int AS n FROM movies`)) as {
    rows: { n: number }[]
  }
  log(`Terminé : ${total.rows[0].n} films en base en ${Math.round((Date.now() - debut) / 1000)} s.`)
  await pool.end()
}

if (process.argv[1]?.endsWith('ingest.ts')) {
  await main()
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
pnpm vitest run tests/integration/ingest.test.ts
```

Attendu : `7 passed`.

- [ ] **Step 5: Lancer l'ingestion réelle**

```bash
pnpm ingest
```

Attendu : les plateformes résolues sont affichées en premier (`netflix=8|1796, disney=337, canal=381`), puis la progression. Durée 15 à 30 minutes. Le script est reprenable : en cas d'interruption, le relancer reprend où il en était.

- [ ] **Step 6: Vérifier le catalogue**

```bash
pnpm tsx -e "import 'dotenv/config'; import { sql } from 'drizzle-orm'; import { db, pool } from './lib/db/client.ts'; const r = await db.execute(sql\`SELECT count(*)::int AS total, count(*) FILTER (WHERE overview IS NOT NULL AND overview <> '')::int AS avec_synopsis, count(*) FILTER (WHERE poster_path IS NOT NULL)::int AS avec_affiche, count(*) FILTER (WHERE cardinality(keywords) > 0)::int AS avec_tags, count(*) FILTER (WHERE in_top200)::int AS top200, count(*) FILTER (WHERE 'netflix' = ANY(providers))::int AS netflix, count(*) FILTER (WHERE 'canal' = ANY(providers))::int AS canal, count(*) FILTER (WHERE 'disney' = ANY(providers))::int AS disney FROM movies\`); console.table(r.rows); await pool.end()"
```

Attendu, ordres de grandeur : `total` entre 9 000 et 11 000, `avec_affiche` supérieur à 95 % du total, `top200` égal à 200, `netflix` autour de 7 000, `disney` autour de 2 500, `canal` autour de 800.

Si `avec_tags` est inférieur à 40 % du total, c'est normal à ce stade : le dictionnaire d'amorce ne couvre qu'une partie des mots-clés. La tâche 10 corrige cela.

- [ ] **Step 7: Commit**

```bash
git add scripts/ingest.ts tests/integration/ingest.test.ts
git commit -m "Ajoute l'ingestion du catalogue TMDB en trois phases reprenables"
```

---

## Task 10: Enrichissement du dictionnaire de mots-clés

**Files:**
- Create: `scripts/build-keywords.ts`
- Modify: `data/keywords-fr.json`
- Test: `tests/unit/keywords.test.ts` (ajout d'un test de non-régression)

**Interfaces:**
- Consumes: la base remplie par la tâche 9
- Produit : `data/keywords-fr.json` porté à environ 200 entrées, et une couverture de tags mesurée

- [ ] **Step 1: Écrire le script de recensement**

`scripts/build-keywords.ts` :

```ts
import 'dotenv/config'
import { writeFile } from 'node:fs/promises'
import { sql } from 'drizzle-orm'
import dictionary from '@/data/keywords-fr.json'
import { db, pool } from '@/lib/db/client'
import { TmdbClient } from '@/lib/tmdb'

const TAILLE_ECHANTILLON = 1500
const SORTIE = 'data/keywords-a-traduire.json'

/**
 * Recense les mots-clés bruts les plus fréquents encore absents du dictionnaire,
 * sur un échantillon des films les plus populaires — ce sont ceux que l'on verra
 * le plus souvent passer dans le paquet.
 */
async function main() {
  const client = new TmdbClient()
  const connus = new Set(Object.keys(dictionary as Record<string, string>))

  const result = (await db.execute(sql`
    SELECT id FROM movies ORDER BY popularity DESC NULLS LAST LIMIT ${TAILLE_ECHANTILLON}
  `)) as { rows: { id: number }[] }

  const frequences = new Map<string, number>()
  const ids = result.rows.map((r) => Number(r.id))

  for (let i = 0; i < ids.length; i += 8) {
    await Promise.all(
      ids.slice(i, i + 8).map(async (id) => {
        try {
          const detail = await client.movieDetail(id)
          for (const k of detail.keywords?.keywords ?? []) {
            const nom = k.name.trim().toLowerCase()
            if (connus.has(nom)) continue
            frequences.set(nom, (frequences.get(nom) ?? 0) + 1)
          }
        } catch {
          // un film manquant ne doit pas interrompre le recensement
        }
      }),
    )
    console.log(`${Math.min(i + 8, ids.length)}/${ids.length} films analysés…`)
  }

  const classement = [...frequences.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 300)
    .map(([nom, n]) => ({ nom, occurrences: n }))

  await writeFile(SORTIE, JSON.stringify(classement, null, 2), 'utf8')
  console.log(`${classement.length} mots-clés à trier écrits dans ${SORTIE}`)
  await pool.end()
}

await main()
```

- [ ] **Step 2: Lancer le recensement**

```bash
pnpm keywords
```

Attendu : `data/keywords-a-traduire.json` contient 300 entrées triées par fréquence décroissante.

- [ ] **Step 3: Traduire les entrées pertinentes**

Ouvrir `data/keywords-a-traduire.json`. Pour chaque entrée, décider :

- **Traduire** si le mot-clé décrit ce que le film raconte et aiderait quelqu'un à choisir : un lieu, une époque, un genre narratif, un thème, une créature. Exemples : `sword fight` → « combat à l'épée », `small town` → « petite ville », `undercover` → « infiltration ».
- **Écarter** si le mot-clé est une donnée de production ou de catalogage, invisible pour le spectateur : `woman director`, `duringcreditsstinger`, `aftercreditsstinger`, `imax`, `live action`, `independent film`, ou tout mot-clé apparaissant moins de 5 fois.

Ajouter les entrées retenues à `data/keywords-fr.json`, en minuscules côté clé. Viser environ 200 entrées au total.

Supprimer ensuite le fichier de travail :

```bash
rm data/keywords-a-traduire.json
```

- [ ] **Step 4: Ajouter un test de non-régression du dictionnaire**

Ajouter à la fin de `tests/unit/keywords.test.ts` :

```ts
import dictionnaire from '@/data/keywords-fr.json'

describe('dictionnaire', () => {
  it('compte au moins 180 entrées', () => {
    expect(Object.keys(dictionnaire).length).toBeGreaterThanOrEqual(180)
  })

  it('n’a que des clés en minuscules et sans espaces superflus', () => {
    for (const cle of Object.keys(dictionnaire)) {
      expect(cle).toBe(cle.toLowerCase().trim())
    }
  })

  it('n’a aucune traduction vide', () => {
    for (const valeur of Object.values(dictionnaire)) {
      expect(String(valeur).trim().length).toBeGreaterThan(0)
    }
  })

  it('exclut les mots-clés de production', () => {
    const exclus = ['woman director', 'duringcreditsstinger', 'aftercreditsstinger']
    for (const cle of exclus) {
      expect(dictionnaire).not.toHaveProperty(cle)
    }
  })
})
```

- [ ] **Step 5: Lancer les tests**

```bash
pnpm test
```

Attendu : tous les tests passent, dont les 4 nouveaux.

- [ ] **Step 6: Réappliquer les tags au catalogue**

Les mots-clés bruts n'étant pas conservés en base, il faut refaire passer la phase 2 avec le dictionnaire enrichi :

```bash
pnpm tsx -e "import 'dotenv/config'; import { sql } from 'drizzle-orm'; import { db, pool } from './lib/db/client.ts'; await db.execute(sql\`UPDATE movies SET detail_fetched_at = NULL\`); await pool.end(); console.log('Détails à re-récupérer.')"
pnpm ingest
```

Attendu : la phase 1 ne recense rien de nouveau, la phase 2 repasse sur tous les films avec le dictionnaire enrichi.

- [ ] **Step 7: Mesurer la couverture des tags**

```bash
pnpm tsx -e "import 'dotenv/config'; import { sql } from 'drizzle-orm'; import { db, pool } from './lib/db/client.ts'; const r = await db.execute(sql\`SELECT count(*)::int AS total, count(*) FILTER (WHERE cardinality(keywords) > 0)::int AS avec_tag, round(100.0 * count(*) FILTER (WHERE cardinality(keywords) > 0) / count(*), 1) AS pourcentage FROM movies\`); console.table(r.rows); await pool.end()"
```

Attendu : `pourcentage` supérieur à 60. En dessous, retourner à l'étape 3 et traduire davantage d'entrées.

- [ ] **Step 8: Commit**

```bash
git add scripts/build-keywords.ts data/keywords-fr.json tests/unit/keywords.test.ts
git commit -m "Enrichit le dictionnaire de mots-clés à partir du catalogue réel"
```

---

## Fin du plan 1

À ce stade :

- `pnpm test` est vert sur l'ensemble des tests unitaires et d'intégration ;
- une base Neon contient environ 10 000 films avec affiche, synopsis français, date de sortie, durée, note, genres, tags français et plateformes ;
- l'ordre du paquet est prouvé identique entre TypeScript et SQL ;
- la règle de match, les codes de salon et la traduction des tags sont testés.

Le plan 2 couvrira la session, les routes API, les deux thèmes, l'interface de balayage, la page des matchs, l'installation sur téléphone, le test de bout en bout et le déploiement sur Vercel.
