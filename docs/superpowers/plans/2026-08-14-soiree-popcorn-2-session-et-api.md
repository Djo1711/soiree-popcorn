# Soirée Popcorn — Plan 2 : session et API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire toute la moitié serveur de l'application — session sans mot de passe, couche de requêtes, et les quinze routes HTTP — de sorte qu'un salon puisse être créé, rejoint, balayé et matché intégralement par appels HTTP, avant qu'une seule ligne d'interface n'existe.

**Architecture:** Trois couches strictement séparées. Les requêtes SQL vivent dans `lib/db/queries/`, une fonction par intention, et sont les seules à connaître la base. Les routes de `app/api/` ne font que valider l'entrée, lire la session et appeler une requête. Entre les deux, `lib/api/` porte la lecture de session, les gardes et le format des réponses. La règle de match et l'ordre du paquet ne sont jamais réécrits : ils viennent des modules du plan 1.

**Tech Stack:** Next.js 15 App Router (route handlers), TypeScript strict, Drizzle ORM sur Neon Postgres, Vitest avec PGlite en mémoire pour les tests d'intégration.

**Spec de référence :** `docs/superpowers/specs/2026-08-12-soiree-popcorn-design.md`
**Plan précédent :** `docs/superpowers/plans/2026-08-12-soiree-popcorn-1-fondations-catalogue.md`

**Périmètre :** sections 6, 7 (côté données), 9 et 11 de la spec. Les thèmes, l'interface de balayage, la page des matchs, l'installation mobile, le test Playwright et le déploiement font l'objet du plan 3.

**Livrable vérifiable :** `pnpm test` vert, et un test de bout en bout qui crée un salon, y fait entrer trois membres, balaye des deux côtés et vérifie qu'un match naît une seule fois — uniquement par appels aux routes.

## Global Constraints

- Gestionnaire de paquets **pnpm**, Node 20.20, TypeScript **strict**, aucun `any` implicite, aucun `@ts-ignore`.
- Tous les messages destinés à l'utilisateur sont **en français**, y compris les erreurs d'API.
- Salon de **2 à 8** participants (`MIN_MEMBERS`, `MAX_MEMBERS` de `lib/match.ts`). Seuil entre 2 et l'effectif. Aucun match tant que l'effectif annoncé n'est pas complet.
- L'ordre du paquet vient **exclusivement** de `deckOrderBy` (`lib/deck-sql.ts`). Ne jamais réécrire la formule dans une requête.
- Le cookie de session s'appelle `sp_session`, il est `HttpOnly`, `SameSite=Lax`, `Secure` en production, et vit un an.
- Aucune route ne renvoie d'information sur les balayages négatifs d'autrui : un rejet n'est jamais communiqué.
- Un commit par tâche, message en français, à l'impératif.

---

## Ce que le plan 1 a livré et que ce plan consomme

| Module | Ce qu'il expose |
|---|---|
| `lib/roomcode.ts` | `ROOM_CODE_ALPHABET`, `ROOM_CODE_LENGTH`, `generateRoomCode()`, `normalizeRoomCode(s)`, `isValidRoomCode(s)` |
| `lib/deck.ts` | `BASE_WEIGHT`, `POPULARITY_WEIGHT`, `HASH_MAX`, `deckSortKey(room, movieId, percentile)` |
| `lib/deck-sql.ts` | `deckOrderBy(roomCode)` — le fragment `ORDER BY`, unique écriture SQL de la formule |
| `lib/match.ts` | `MIN_MEMBERS` (2), `MAX_MEMBERS` (8), `MatchRule { expectedMembers, threshold }`, `shouldCreateMatch(memberIds, likedBy, rule)` |
| `lib/keywords.ts` | `MAX_TAGS` (4), `translateKeywords(raw)`, `buildTags(keywordsFr, genresFr, max?)` |
| `lib/db/schema.ts` | `rooms`, `members`, `movies`, `memberFilters`, `swipes`, `matches`, `rateLimits`, types `MatchStatus`, `ProviderKey` |
| `tests/helpers/db.ts` | `createTestDb()` → `{ db, close }`, Postgres PGlite en mémoire |

Trois dettes ont été explicitement reportées du plan 1 vers celui-ci, et sont traitées en tâche 1 :

1. `lib/db/client.ts` lève une exception **à l'import** quand `DATABASE_URL` manque, ce qui fera échouer `next build` dès qu'une route l'importera.
2. Son garde `typeof WebSocket === 'undefined'` se comporte différemment sur le Node 22 de Vercel, où `WebSocket` est global : le pilote prendrait un chemin non testé localement.
3. `lib/db/schema.ts` importe `lib/roomcode.ts`, qui importe `node:crypto`. Dès qu'un composant client aura besoin de `isValidRoomCode`, le bundle cassera.

---

## Structure des fichiers

| Fichier | Responsabilité | Tâche |
|---|---|---|
| `lib/roomcode.ts` | Validation et normalisation, **sans dépendance Node** | 1 |
| `lib/roomcode-server.ts` | Génération d'un code (`node:crypto`) | 1 |
| `lib/db/client.ts` | Connexion paresseuse, utilisable en build sans base | 1 |
| `lib/session.ts` | Signature, lecture et pose du cookie | 2 |
| `lib/rate-limit.ts` | Comptage atomique par fenêtre | 3 |
| `lib/db/queries/rooms.ts` | Créer, rejoindre, lister les membres, reprendre une identité | 4 |
| `lib/db/queries/deck.ts` | Paquet de cartes et comptage selon filtres | 5 |
| `lib/db/queries/swipes.ts` | Enregistrer un balayage, créer le match, annuler | 6 |
| `lib/db/queries/matches.ts` | Liste, statut, tirage au sort, événements | 7 |
| `lib/db/queries/filters.ts` | Lecture et écriture des filtres d'un membre | 7 |
| `lib/api/respond.ts` | Réponses JSON et erreurs françaises normalisées | 8 |
| `lib/api/guard.ts` | Lecture de session, résolution du membre, refus | 8 |
| `app/api/rooms/**` | Création, adhésion, membres, reprise d'identité | 8 |
| `app/api/deck/**`, `app/api/swipes/**`, `app/api/events/` | Paquet, balayage, sondage | 9 |
| `app/api/matches/**`, `app/api/filters/` | Matchs et filtres | 10 |
| `app/api/cron/ingest/` | Rafraîchissement hebdomadaire protégé | 10 |

---

## Task 1: Rendre le socle utilisable par un serveur web

Trois corrections héritées de la revue du plan 1. Aucune n'ajoute de fonctionnalité ; toutes empêchent une panne certaine plus loin.

**Files:**
- Modify: `lib/roomcode.ts`
- Create: `lib/roomcode-server.ts`
- Modify: `lib/db/schema.ts` (import), `scripts/ingest.ts` si nécessaire
- Modify: `lib/db/client.ts`
- Test: `tests/unit/roomcode.test.ts`, `tests/integration/client.test.ts`

**Interfaces:**
- Consumes: `lib/roomcode.ts` du plan 1
- Produit :
  - `lib/roomcode.ts` : `ROOM_CODE_ALPHABET`, `ROOM_CODE_LENGTH`, `normalizeRoomCode`, `isValidRoomCode` — **plus de `generateRoomCode`, plus d'import Node**
  - `lib/roomcode-server.ts` : `generateRoomCode(): string`
  - `lib/db/client.ts` : `getDb(): NeonDb`, `closePool(): Promise<void>` — **plus d'export `db` évalué à l'import**

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à `tests/unit/roomcode.test.ts` :

```ts
import { readFileSync } from 'node:fs'

describe('portabilité client', () => {
  it('n’importe rien de Node, pour rester utilisable dans un composant client', () => {
    const source = readFileSync('lib/roomcode.ts', 'utf8')
    expect(source).not.toMatch(/from ['"]node:/)
  })
})
```

Et remplacer l'import de `generateRoomCode` par `import { generateRoomCode } from '@/lib/roomcode-server'`.

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm vitest run tests/unit/roomcode.test.ts
```

Attendu : ÉCHEC — `lib/roomcode.ts` contient encore `from 'node:crypto'`, et `@/lib/roomcode-server` n'existe pas.

- [ ] **Step 3: Scinder le module**

Retirer de `lib/roomcode.ts` l'import `node:crypto` et la fonction `generateRoomCode`. Créer `lib/roomcode-server.ts` :

```ts
import { randomInt } from 'node:crypto'
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@/lib/roomcode'

/**
 * Génération d'un code de salon. Isolée de la validation parce qu'elle dépend
 * de `node:crypto` : un composant client doit pouvoir valider une saisie sans
 * embarquer de module Node.
 */
export function generateRoomCode(): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]
  }
  return code
}
```

Corriger les imports partout où `generateRoomCode` est utilisé (`grep -rn "generateRoomCode" --include=*.ts .` hors `node_modules`).

- [ ] **Step 4: Rendre la connexion paresseuse**

Remplacer intégralement `lib/db/client.ts` :

```ts
import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import ws from 'ws'
import * as schema from './schema'

export type NeonDb = ReturnType<typeof drizzle<typeof schema>>

let pool: Pool | undefined
let instance: NeonDb | undefined

/**
 * Connexion construite au premier appel et non à l'import.
 *
 * Deux raisons. `next build` importe les modules des routes sans que
 * `DATABASE_URL` soit nécessairement présent : lever à l'import ferait échouer
 * la compilation. Et le pilote WebSocket doit être imposé inconditionnellement
 * côté serveur : le garde « si WebSocket n'existe pas » se comportait
 * différemment sur Node 22, où la variable globale existe, faisant emprunter au
 * pilote un chemin jamais testé en local.
 */
export function getDb(): NeonDb {
  if (instance) return instance

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL est absent. Copiez .env.example vers .env.local et remplissez-le.',
    )
  }

  neonConfig.webSocketConstructor = ws
  pool = new Pool({ connectionString })
  instance = drizzle(pool, { schema })
  return instance
}

export async function closePool(): Promise<void> {
  await pool?.end()
  pool = undefined
  instance = undefined
}
```

Corriger `scripts/migrate.ts`, `scripts/ingest.ts` et `scripts/build-keywords.ts` pour appeler `getDb()` et `closePool()`.

- [ ] **Step 5: Écrire le test d'intégration de la connexion**

`tests/integration/client.test.ts` :

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { closePool, getDb } from '@/lib/db/client'

const original = process.env.DATABASE_URL

afterEach(async () => {
  process.env.DATABASE_URL = original
  await closePool()
})

describe('getDb', () => {
  it('ne lève pas au simple import du module', async () => {
    delete process.env.DATABASE_URL
    await expect(import('@/lib/db/client')).resolves.toBeDefined()
  })

  it('lève un message actionnable quand DATABASE_URL manque', () => {
    delete process.env.DATABASE_URL
    expect(() => getDb()).toThrow(/DATABASE_URL est absent/)
  })
})
```

- [ ] **Step 6: Vérifier**

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm build
```

Attendu : suite verte, compilation propre, et `pnpm build` réussit — c'est cette dernière commande qui prouve la correction de la dette n°1.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Rend le socle utilisable par un serveur web"
```

---

## Task 2: Session signée

**Files:**
- Create: `lib/session.ts`
- Test: `tests/unit/session.test.ts`

**Interfaces:**
- Consumes: rien
- Produit :
  - `SessionPayload { memberId: string; roomCode: string }`
  - `signSession(payload: SessionPayload): string`
  - `readSession(token: string | undefined): SessionPayload | null`
  - `SESSION_COOKIE` — vaut `'sp_session'`
  - `SESSION_MAX_AGE_SECONDS` — vaut `31_536_000`

- [ ] **Step 1: Écrire le test qui échoue**

`tests/unit/session.test.ts` :

```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { readSession, signSession } from '@/lib/session'

beforeAll(() => {
  process.env.SESSION_SECRET = 'secret-de-test-suffisamment-long-pour-hmac'
})

const charge = { memberId: '11111111-2222-3333-4444-555555555555', roomCode: 'K4P2M9' }

describe('session', () => {
  it('relit ce qu’elle a signé', () => {
    expect(readSession(signSession(charge))).toEqual(charge)
  })

  it('refuse un jeton dont la charge a été modifiée', () => {
    const jeton = signSession(charge)
    const [donnees, signature] = jeton.split('.')
    const falsifiee = Buffer.from(
      JSON.stringify({ ...charge, roomCode: 'AUTRE1' }),
      'utf8',
    ).toString('base64url')
    expect(readSession(`${falsifiee}.${signature}`)).toBeNull()
    expect(donnees).not.toBe(falsifiee)
  })

  it('refuse un jeton dont la signature a été modifiée', () => {
    const [donnees] = signSession(charge).split('.')
    expect(readSession(`${donnees}.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`)).toBeNull()
  })

  it('refuse un jeton malformé, vide ou absent', () => {
    expect(readSession(undefined)).toBeNull()
    expect(readSession('')).toBeNull()
    expect(readSession('pasdepoint')).toBeNull()
    expect(readSession('a.b.c')).toBeNull()
  })

  it('refuse une charge qui n’a pas la forme attendue', () => {
    const bidon = Buffer.from(JSON.stringify({ nimporte: 'quoi' }), 'utf8').toString('base64url')
    expect(readSession(`${bidon}.peu-importe`)).toBeNull()
  })

  it('produit une signature différente pour deux membres', () => {
    const autre = { ...charge, memberId: '99999999-2222-3333-4444-555555555555' }
    expect(signSession(charge)).not.toBe(signSession(autre))
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm vitest run tests/unit/session.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "@/lib/session"`.

- [ ] **Step 3: Écrire l'implémentation**

`lib/session.ts` :

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'sp_session'
export const SESSION_MAX_AGE_SECONDS = 31_536_000

export interface SessionPayload {
  memberId: string
  roomCode: string
}

function secret(): string {
  const valeur = process.env.SESSION_SECRET
  if (!valeur) throw new Error('SESSION_SECRET est absent de l’environnement.')
  return valeur
}

function signature(donnees: string): string {
  return createHmac('sha256', secret()).update(donnees).digest('base64url')
}

export function signSession(payload: SessionPayload): string {
  const donnees = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `${donnees}.${signature(donnees)}`
}

/**
 * Relit un jeton. Renvoie `null` sur toute anomalie plutôt que de lever :
 * un cookie invalide est un cas courant — effacé, expiré, recopié à la main —
 * et non une erreur du serveur.
 */
export function readSession(token: string | undefined): SessionPayload | null {
  if (!token) return null
  const morceaux = token.split('.')
  if (morceaux.length !== 2) return null
  const [donnees, recue] = morceaux

  const attendue = signature(donnees)
  const a = Buffer.from(recue)
  const b = Buffer.from(attendue)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const charge: unknown = JSON.parse(Buffer.from(donnees, 'base64url').toString('utf8'))
    if (
      typeof charge !== 'object' ||
      charge === null ||
      typeof (charge as SessionPayload).memberId !== 'string' ||
      typeof (charge as SessionPayload).roomCode !== 'string'
    ) {
      return null
    }
    const { memberId, roomCode } = charge as SessionPayload
    return { memberId, roomCode }
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
pnpm vitest run tests/unit/session.test.ts
```

Attendu : `6 passed`.

- [ ] **Step 5: Prouver que la vérification de signature mord**

Remplacer temporairement la comparaison `timingSafeEqual` par `recue === attendue.slice(0, 4)`. Le test de signature falsifiée doit échouer. Restaurer.

- [ ] **Step 6: Commit**

```bash
git add lib/session.ts tests/unit/session.test.ts
git commit -m "Ajoute le cookie de session signé"
```

---

## Task 3: Limitation de débit atomique

Le code de salon est le seul secret de l'application. Sans limitation, un balayage automatisé finirait par en trouver un. La contrainte de correction est l'atomicité : une lecture suivie d'une écriture depuis une fonction serverless sous-compterait exactement pendant la rafale de tentatives simultanées que ce compteur existe pour arrêter.

**Files:**
- Create: `lib/rate-limit.ts`
- Test: `tests/integration/rate-limit.test.ts`

**Interfaces:**
- Consumes: `rateLimits` de `lib/db/schema.ts`
- Produit : `hitRateLimit(db, key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; count: number }>`

- [ ] **Step 1: Écrire le test qui échoue**

`tests/integration/rate-limit.test.ts` :

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { hitRateLimit } from '@/lib/rate-limit'
import { createTestDb, type TestDb } from '@/tests/helpers/db'

let db: TestDb
let close: () => Promise<void>

beforeEach(async () => {
  ;({ db, close } = await createTestDb())
})
afterEach(async () => {
  await close()
})

describe('hitRateLimit', () => {
  it('autorise jusqu’à la limite puis refuse', async () => {
    for (let i = 1; i <= 3; i++) {
      const r = await hitRateLimit(db, 'join:1.2.3.4', 3, 60)
      expect(r).toEqual({ allowed: true, count: i })
    }
    expect(await hitRateLimit(db, 'join:1.2.3.4', 3, 60)).toEqual({ allowed: false, count: 4 })
  })

  it('compte séparément deux clés', async () => {
    await hitRateLimit(db, 'join:1.1.1.1', 1, 60)
    expect(await hitRateLimit(db, 'join:2.2.2.2', 1, 60)).toEqual({ allowed: true, count: 1 })
  })

  it('repart à un quand la fenêtre est écoulée', async () => {
    await hitRateLimit(db, 'join:1.2.3.4', 1, 60)
    await db.execute(
      sql`UPDATE rate_limits SET window_start = now() - interval '2 minutes' WHERE key = 'join:1.2.3.4'`,
    )
    expect(await hitRateLimit(db, 'join:1.2.3.4', 1, 60)).toEqual({ allowed: true, count: 1 })
  })

  it('compte juste sous vingt appels simultanés', async () => {
    const resultats = await Promise.all(
      Array.from({ length: 20 }, () => hitRateLimit(db, 'join:9.9.9.9', 100, 60)),
    )
    expect(resultats.map((r) => r.count).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    )
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm vitest run tests/integration/rate-limit.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "@/lib/rate-limit"`.

- [ ] **Step 3: Écrire l'implémentation**

`lib/rate-limit.ts` :

```ts
import { sql } from 'drizzle-orm'

type Executor = { execute<T>(query: ReturnType<typeof sql>): Promise<{ rows: T[] }> }

/**
 * Incrémente et lit le compteur en **une seule instruction**.
 *
 * Une lecture suivie d'une écriture sous-compterait précisément pendant la
 * rafale de tentatives simultanées que ce compteur existe pour arrêter : deux
 * fonctions serverless liraient la même valeur avant que l'une n'écrive.
 */
export async function hitRateLimit(
  db: Executor,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; count: number }> {
  const fenetre = sql.raw(`interval '${Math.trunc(windowSeconds)} seconds'`)
  const result = await db.execute<{ count: number }>(sql`
    INSERT INTO rate_limits (key, count, window_start)
    VALUES (${key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN rate_limits.window_start < now() - ${fenetre} THEN 1
        ELSE rate_limits.count + 1
      END,
      window_start = CASE
        WHEN rate_limits.window_start < now() - ${fenetre} THEN now()
        ELSE rate_limits.window_start
      END
    RETURNING count
  `)
  const count = Number(result.rows[0].count)
  return { allowed: count <= limit, count }
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
pnpm vitest run tests/integration/rate-limit.test.ts
```

Attendu : `4 passed`.

- [ ] **Step 5: Prouver que l'atomicité est ce qui fait passer le test de concurrence**

Remplacer temporairement le corps par une lecture puis une écriture séparées :

```ts
const lu = await db.execute<{ count: number }>(sql`SELECT count FROM rate_limits WHERE key = ${key}`)
const n = (lu.rows[0]?.count ?? 0) + 1
await db.execute(sql`
  INSERT INTO rate_limits (key, count, window_start) VALUES (${key}, ${n}, now())
  ON CONFLICT (key) DO UPDATE SET count = ${n}
`)
return { allowed: n <= limit, count: n }
```

Le test « compte juste sous vingt appels simultanés » doit échouer avec des valeurs dupliquées. Restaurer l'instruction unique et confirmer les 4 tests verts.

- [ ] **Step 6: Commit**

```bash
git add lib/rate-limit.ts tests/integration/rate-limit.test.ts
git commit -m "Ajoute une limitation de débit atomique"
```

---

## Task 4: Requêtes de salon

**Files:**
- Create: `lib/db/queries/rooms.ts`
- Test: `tests/integration/queries-rooms.test.ts`

**Interfaces:**
- Consumes: `generateRoomCode` (tâche 1), `MIN_MEMBERS`/`MAX_MEMBERS` (`lib/match.ts`), `rooms`/`members`/`memberFilters` du schéma
- Produit :
  - `RoomSummary { code: string; expectedMembers: number; matchThreshold: number; memberCount: number; complete: boolean }`
  - `MemberSummary { id: string; displayName: string }`
  - `createRoom(db, input: { displayName: string; expectedMembers: number; matchThreshold: number }): Promise<{ room: RoomSummary; member: MemberSummary }>`
  - `joinRoom(db, code: string, displayName: string): Promise<{ member: MemberSummary } | { error: 'introuvable' | 'complet' | 'prenom_pris' }>`
  - `listMembers(db, code: string): Promise<MemberSummary[]>`
  - `claimMember(db, code: string, memberId: string): Promise<MemberSummary | null>`
  - `getRoom(db, code: string): Promise<RoomSummary | null>`

- [ ] **Step 1: Écrire le test qui échoue**

`tests/integration/queries-rooms.test.ts` :

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  claimMember,
  createRoom,
  getRoom,
  joinRoom,
  listMembers,
} from '@/lib/db/queries/rooms'
import { createTestDb, type TestDb } from '@/tests/helpers/db'

let db: TestDb
let close: () => Promise<void>

beforeEach(async () => {
  ;({ db, close } = await createTestDb())
})
afterEach(async () => {
  await close()
})

const base = { displayName: 'Djo', expectedMembers: 2, matchThreshold: 2 }

describe('createRoom', () => {
  it('crée un salon valide et son premier membre', async () => {
    const { room, member } = await createRoom(db, base)
    expect(room.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
    expect(room.expectedMembers).toBe(2)
    expect(room.memberCount).toBe(1)
    expect(room.complete).toBe(false)
    expect(member.displayName).toBe('Djo')
  })

  it('refuse un effectif hors bornes', async () => {
    await expect(createRoom(db, { ...base, expectedMembers: 9, matchThreshold: 2 })).rejects.toThrow()
    await expect(createRoom(db, { ...base, expectedMembers: 1, matchThreshold: 2 })).rejects.toThrow()
  })

  it('refuse un seuil hors bornes', async () => {
    await expect(createRoom(db, { ...base, expectedMembers: 4, matchThreshold: 5 })).rejects.toThrow()
    await expect(createRoom(db, { ...base, expectedMembers: 4, matchThreshold: 1 })).rejects.toThrow()
  })

  it('dote le premier membre de filtres par défaut', async () => {
    const { member } = await createRoom(db, base)
    const filtres = await db.query.memberFilters.findFirst({
      where: (f, { eq }) => eq(f.memberId, member.id),
    })
    expect(filtres?.includeTop200).toBe(true)
    expect(filtres?.minRating).toBe(0)
  })
})

describe('joinRoom', () => {
  it('ajoute un membre et complète l’effectif', async () => {
    const { room } = await createRoom(db, base)
    const r = await joinRoom(db, room.code, 'Alice')
    expect('member' in r && r.member.displayName).toBe('Alice')
    expect((await getRoom(db, room.code))?.complete).toBe(true)
  })

  it('accepte un code en minuscules avec des espaces', async () => {
    const { room } = await createRoom(db, base)
    const saisie = ` ${room.code.toLowerCase()} `
    expect('member' in (await joinRoom(db, saisie, 'Alice'))).toBe(true)
  })

  it('refuse un code inexistant', async () => {
    expect(await joinRoom(db, 'K4P2M9', 'Alice')).toEqual({ error: 'introuvable' })
  })

  it('refuse au-delà de l’effectif annoncé', async () => {
    const { room } = await createRoom(db, base)
    await joinRoom(db, room.code, 'Alice')
    expect(await joinRoom(db, room.code, 'Chloé')).toEqual({ error: 'complet' })
  })

  it('refuse un prénom déjà pris dans ce salon', async () => {
    const { room } = await createRoom(db, base)
    expect(await joinRoom(db, room.code, 'Djo')).toEqual({ error: 'prenom_pris' })
  })
})

describe('claimMember', () => {
  it('rend une identité existante du salon', async () => {
    const { room, member } = await createRoom(db, base)
    expect(await claimMember(db, room.code, member.id)).toEqual(member)
  })

  it('refuse un membre d’un autre salon', async () => {
    const a = await createRoom(db, base)
    const b = await createRoom(db, base)
    expect(await claimMember(db, b.room.code, a.member.id)).toBeNull()
  })
})

describe('listMembers', () => {
  it('liste les prénoms dans l’ordre d’arrivée', async () => {
    const { room } = await createRoom(db, base)
    await joinRoom(db, room.code, 'Alice')
    expect((await listMembers(db, room.code)).map((m) => m.displayName)).toEqual(['Djo', 'Alice'])
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm vitest run tests/integration/queries-rooms.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "@/lib/db/queries/rooms"`.

- [ ] **Step 3: Écrire l'implémentation**

`lib/db/queries/rooms.ts` :

```ts
import { and, asc, eq, sql } from 'drizzle-orm'
import { memberFilters, members, rooms } from '@/lib/db/schema'
import { normalizeRoomCode } from '@/lib/roomcode'
import { generateRoomCode } from '@/lib/roomcode-server'

export interface RoomSummary {
  code: string
  expectedMembers: number
  matchThreshold: number
  memberCount: number
  complete: boolean
}

export interface MemberSummary {
  id: string
  displayName: string
}

/** Nombre de tentatives avant d'abandonner sur une collision de code. */
const TENTATIVES_CODE = 5

export async function getRoom(db: any, code: string): Promise<RoomSummary | null> {
  const normalise = normalizeRoomCode(code)
  const result = await db.execute<{
    code: string
    expected_members: number
    match_threshold: number
    n: number
  }>(sql`
    SELECT r.code, r.expected_members, r.match_threshold,
           (SELECT count(*)::int FROM members m WHERE m.room_code = r.code) AS n
    FROM rooms r WHERE r.code = ${normalise}
  `)
  const ligne = result.rows[0]
  if (!ligne) return null
  return {
    code: ligne.code,
    expectedMembers: Number(ligne.expected_members),
    matchThreshold: Number(ligne.match_threshold),
    memberCount: Number(ligne.n),
    complete: Number(ligne.n) >= Number(ligne.expected_members),
  }
}

export async function createRoom(
  db: any,
  input: { displayName: string; expectedMembers: number; matchThreshold: number },
): Promise<{ room: RoomSummary; member: MemberSummary }> {
  let code = ''
  for (let i = 0; i < TENTATIVES_CODE; i++) {
    const candidat = generateRoomCode()
    const insere = await db
      .insert(rooms)
      .values({
        code: candidat,
        expectedMembers: input.expectedMembers,
        matchThreshold: input.matchThreshold,
      })
      .onConflictDoNothing()
      .returning()
    if (insere.length > 0) {
      code = candidat
      break
    }
  }
  if (!code) throw new Error('Impossible de générer un code de salon libre.')

  const [membre] = await db
    .insert(members)
    .values({ roomCode: code, displayName: input.displayName.trim() })
    .returning()
  await db.insert(memberFilters).values({ memberId: membre.id })

  const room = await getRoom(db, code)
  if (!room) throw new Error('Salon introuvable juste après sa création.')
  return { room, member: { id: membre.id, displayName: membre.displayName } }
}

export async function joinRoom(
  db: any,
  code: string,
  displayName: string,
): Promise<{ member: MemberSummary } | { error: 'introuvable' | 'complet' | 'prenom_pris' }> {
  const room = await getRoom(db, code)
  if (!room) return { error: 'introuvable' }
  if (room.memberCount >= room.expectedMembers) return { error: 'complet' }

  const insere = await db
    .insert(members)
    .values({ roomCode: room.code, displayName: displayName.trim() })
    .onConflictDoNothing()
    .returning()
  if (insere.length === 0) return { error: 'prenom_pris' }

  await db.insert(memberFilters).values({ memberId: insere[0].id }).onConflictDoNothing()
  return { member: { id: insere[0].id, displayName: insere[0].displayName } }
}

export async function listMembers(db: any, code: string): Promise<MemberSummary[]> {
  const lignes = await db
    .select({ id: members.id, displayName: members.displayName })
    .from(members)
    .where(eq(members.roomCode, normalizeRoomCode(code)))
    .orderBy(asc(members.createdAt))
  return lignes
}

export async function claimMember(
  db: any,
  code: string,
  memberId: string,
): Promise<MemberSummary | null> {
  const lignes = await db
    .select({ id: members.id, displayName: members.displayName })
    .from(members)
    .where(and(eq(members.roomCode, normalizeRoomCode(code)), eq(members.id, memberId)))
  return lignes[0] ?? null
}
```

> **Note sur le typage.** Le paramètre `db` est laissé volontairement large parce que deux pilotes différents circulent : Neon en production, PGlite en test. Si le typage exact devient pénible, extraire un type `Database` partagé dans `lib/db/types.ts` et l'utiliser partout — mais ne pas répandre `any` au-delà de cette signature.

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
pnpm vitest run tests/integration/queries-rooms.test.ts
```

Attendu : `12 passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries/rooms.ts tests/integration/queries-rooms.test.ts
git commit -m "Ajoute les requêtes de création et d'adhésion à un salon"
```

---

## Task 5: Requêtes du paquet

**Files:**
- Create: `lib/db/queries/deck.ts`
- Test: `tests/integration/queries-deck.test.ts`

**Interfaces:**
- Consumes: `deckOrderBy` (`lib/deck-sql.ts`), `deckSortKey` (`lib/deck.ts`), `buildTags` (`lib/keywords.ts`)
- Produit :
  - `DeckFilters { genres: string[]; yearFrom: number | null; yearTo: number | null; minRating: number; maxRuntime: number | null; providers: string[]; includeTop200: boolean }`
  - `DeckCard { id: number; title: string; overview: string | null; posterPath: string | null; releaseDate: string | null; releaseYear: number | null; runtime: number | null; voteAverage: number | null; director: string | null; providers: string[]; tags: string[] }`
  - `fetchDeck(db, roomCode: string, memberId: string, filters: DeckFilters, limit: number): Promise<DeckCard[]>`
  - `countDeck(db, memberId: string, filters: DeckFilters): Promise<number>`

Deux points de sémantique que la revue du plan 1 a signalés et qui se tranchent ici. TMDB renvoie `runtime = 0` et `vote_average = 0` pour « inconnu », pas pour « nul ». Un filtre « durée maximale 90 minutes » ne doit donc pas faire remonter les films de durée inconnue comme s'ils duraient zéro minute, et un filtre « note minimale 6 » doit les écarter plutôt que de les traiter comme notés zéro.

- [ ] **Step 1: Écrire le test qui échoue**

`tests/integration/queries-deck.test.ts` :

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deckSortKey } from '@/lib/deck'
import { countDeck, fetchDeck, type DeckFilters } from '@/lib/db/queries/deck'
import { movies, rooms, members, swipes } from '@/lib/db/schema'
import { createTestDb, type TestDb } from '@/tests/helpers/db'

let db: TestDb
let close: () => Promise<void>

const AUCUN: DeckFilters = {
  genres: [],
  yearFrom: null,
  yearTo: null,
  minRating: 0,
  maxRuntime: null,
  providers: [],
  includeTop200: true,
}

beforeEach(async () => {
  ;({ db, close } = await createTestDb())
  await db.insert(rooms).values({ code: 'K4P2M9', expectedMembers: 2, matchThreshold: 2 })
})
afterEach(async () => {
  await close()
})

async function semer(n: number, extra: (i: number) => Partial<typeof movies.$inferInsert> = () => ({})) {
  await db.insert(movies).values(
    Array.from({ length: n }, (_, i) => ({
      id: i + 1,
      title: `Film ${i + 1}`,
      popularityPercentile: (i % 10) / 10,
      genres: ['Action'],
      keywords: ['braquage'],
      providers: ['netflix'],
      runtime: 100,
      voteAverage: 7,
      releaseYear: 2000,
      ...extra(i + 1),
    })),
  )
}

async function unMembre(prenom = 'Djo') {
  const [m] = await db.insert(members).values({ roomCode: 'K4P2M9', displayName: prenom }).returning()
  return m.id
}

describe('fetchDeck', () => {
  it('rend les cartes dans l’ordre de deckSortKey', async () => {
    await semer(200)
    const id = await unMembre()
    const cartes = await fetchDeck(db, 'K4P2M9', id, AUCUN, 50)
    const attendu = Array.from({ length: 200 }, (_, i) => i + 1)
      .sort((a, b) => {
        const ka = deckSortKey('K4P2M9', a, ((a - 1) % 10) / 10)
        const kb = deckSortKey('K4P2M9', b, ((b - 1) % 10) / 10)
        return ka - kb || a - b
      })
      .slice(0, 50)
    expect(cartes.map((c) => c.id)).toEqual(attendu)
  })

  it('donne le même ordre à deux membres du même salon', async () => {
    await semer(100)
    const a = await unMembre('Djo')
    const b = await unMembre('Alice')
    const ca = await fetchDeck(db, 'K4P2M9', a, AUCUN, 30)
    const cb = await fetchDeck(db, 'K4P2M9', b, AUCUN, 30)
    expect(ca.map((c) => c.id)).toEqual(cb.map((c) => c.id))
  })

  it('exclut les films déjà balayés par ce membre seulement', async () => {
    await semer(50)
    const a = await unMembre('Djo')
    const b = await unMembre('Alice')
    const premier = (await fetchDeck(db, 'K4P2M9', a, AUCUN, 1))[0].id
    await db.insert(swipes).values({ memberId: a, movieId: premier, liked: false })
    expect((await fetchDeck(db, 'K4P2M9', a, AUCUN, 50)).map((c) => c.id)).not.toContain(premier)
    expect((await fetchDeck(db, 'K4P2M9', b, AUCUN, 50)).map((c) => c.id)).toContain(premier)
  })

  it('compose au plus quatre tags, mots-clés avant genres', async () => {
    await semer(1)
    const cartes = await fetchDeck(db, 'K4P2M9', await unMembre(), AUCUN, 1)
    expect(cartes[0].tags).toEqual(['braquage', 'Action'])
  })

  it('filtre par genre', async () => {
    await semer(4, (i) => ({ genres: i <= 2 ? ['Comédie'] : ['Horreur'] }))
    const cartes = await fetchDeck(db, 'K4P2M9', await unMembre(), { ...AUCUN, genres: ['Comédie'] }, 10)
    expect(cartes.map((c) => c.id).sort()).toEqual([1, 2])
  })

  it('filtre par décennie', async () => {
    await semer(4, (i) => ({ releaseYear: 1980 + i * 10 }))
    const cartes = await fetchDeck(db, 'K4P2M9', await unMembre(), { ...AUCUN, yearFrom: 2000, yearTo: 2010 }, 10)
    expect(cartes.map((c) => c.id).sort()).toEqual([2, 3])
  })

  it('écarte une durée inconnue quand une durée maximale est demandée', async () => {
    await semer(3, (i) => ({ runtime: i === 1 ? 80 : i === 2 ? 200 : 0 }))
    const cartes = await fetchDeck(db, 'K4P2M9', await unMembre(), { ...AUCUN, maxRuntime: 120 }, 10)
    expect(cartes.map((c) => c.id)).toEqual([1])
  })

  it('écarte une note inconnue quand une note minimale est demandée', async () => {
    await semer(3, (i) => ({ voteAverage: i === 1 ? 8 : i === 2 ? 4 : 0 }))
    const cartes = await fetchDeck(db, 'K4P2M9', await unMembre(), { ...AUCUN, minRating: 6 }, 10)
    expect(cartes.map((c) => c.id)).toEqual([1])
  })

  it('accepte un film du top 200 sans plateforme quand le top 200 est inclus', async () => {
    await semer(2, (i) => (i === 1 ? { providers: [], inTop200: true } : { providers: ['disney'] }))
    const cartes = await fetchDeck(
      db, 'K4P2M9', await unMembre(), { ...AUCUN, providers: ['netflix'], includeTop200: true }, 10,
    )
    expect(cartes.map((c) => c.id)).toEqual([1])
  })

  it('écarte ce même film quand le top 200 est exclu', async () => {
    await semer(2, (i) => (i === 1 ? { providers: [], inTop200: true } : { providers: ['disney'] }))
    const cartes = await fetchDeck(
      db, 'K4P2M9', await unMembre(), { ...AUCUN, providers: ['netflix'], includeTop200: false }, 10,
    )
    expect(cartes).toEqual([])
  })
})

describe('countDeck', () => {
  it('compte ce que fetchDeck renverrait sans limite', async () => {
    await semer(30, (i) => ({ genres: i <= 7 ? ['Comédie'] : ['Action'] }))
    const id = await unMembre()
    const filtres = { ...AUCUN, genres: ['Comédie'] }
    expect(await countDeck(db, id, filtres)).toBe(7)
    expect((await fetchDeck(db, 'K4P2M9', id, filtres, 100)).length).toBe(7)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm vitest run tests/integration/queries-deck.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "@/lib/db/queries/deck"`.

- [ ] **Step 3: Écrire l'implémentation**

`lib/db/queries/deck.ts` :

```ts
import { sql } from 'drizzle-orm'
import { deckOrderBy } from '@/lib/deck-sql'
import { buildTags } from '@/lib/keywords'

export interface DeckFilters {
  genres: string[]
  yearFrom: number | null
  yearTo: number | null
  minRating: number
  maxRuntime: number | null
  providers: string[]
  includeTop200: boolean
}

export interface DeckCard {
  id: number
  title: string
  overview: string | null
  posterPath: string | null
  releaseDate: string | null
  releaseYear: number | null
  runtime: number | null
  voteAverage: number | null
  director: string | null
  providers: string[]
  tags: string[]
}

/*
 * Les deux requêtes ci-dessous portent leurs conditions en clair plutôt que via
 * un fragment partagé. TMDB code « inconnu » par un zéro sur la durée et la
 * note : une durée inconnue ne doit donc pas passer pour très courte, ni une
 * note inconnue pour très mauvaise, dès qu'un seuil est demandé.
 */

export async function fetchDeck(
  db: any,
  roomCode: string,
  memberId: string,
  f: DeckFilters,
  limit: number,
): Promise<DeckCard[]> {
  const result = await db.execute<Record<string, unknown>>(sql`
    SELECT movies.id, movies.title, movies.overview, movies.poster_path, movies.release_date,
           movies.release_year, movies.runtime, movies.vote_average, movies.director,
           movies.providers, movies.keywords, movies.genres
    FROM movies
    WHERE (${f.genres.length} = 0 OR movies.genres && ${sql.param(f.genres)}::text[])
      AND (${f.yearFrom === null} OR movies.release_year >= ${f.yearFrom ?? 0})
      AND (${f.yearTo === null} OR movies.release_year <= ${f.yearTo ?? 0})
      AND (${f.maxRuntime === null}
           OR (movies.runtime IS NOT NULL AND movies.runtime > 0 AND movies.runtime <= ${f.maxRuntime ?? 0}))
      AND (${f.minRating <= 0}
           OR (movies.vote_average IS NOT NULL AND movies.vote_average > 0
               AND movies.vote_average >= ${f.minRating}))
      AND (${f.providers.length} = 0
           OR movies.providers && ${sql.param(f.providers)}::text[]
           OR (${f.includeTop200} AND movies.in_top200))
      AND NOT EXISTS (
        SELECT 1 FROM swipes s WHERE s.member_id = ${memberId}::uuid AND s.movie_id = movies.id
      )
    ORDER BY ${deckOrderBy(roomCode)}
    LIMIT ${limit}
  `)

  return result.rows.map((r) => ({
    id: Number(r.id),
    title: String(r.title),
    overview: (r.overview as string | null) ?? null,
    posterPath: (r.poster_path as string | null) ?? null,
    releaseDate: r.release_date ? String(r.release_date) : null,
    releaseYear: r.release_year === null ? null : Number(r.release_year),
    runtime: r.runtime ? Number(r.runtime) : null,
    voteAverage: r.vote_average ? Number(r.vote_average) : null,
    director: (r.director as string | null) ?? null,
    providers: (r.providers as string[]) ?? [],
    tags: buildTags((r.keywords as string[]) ?? [], (r.genres as string[]) ?? []),
  }))
}

export async function countDeck(db: any, memberId: string, f: DeckFilters): Promise<number> {
  const result = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n
    FROM movies
    WHERE (${f.genres.length} = 0 OR movies.genres && ${sql.param(f.genres)}::text[])
      AND (${f.yearFrom === null} OR movies.release_year >= ${f.yearFrom ?? 0})
      AND (${f.yearTo === null} OR movies.release_year <= ${f.yearTo ?? 0})
      AND (${f.maxRuntime === null}
           OR (movies.runtime IS NOT NULL AND movies.runtime > 0 AND movies.runtime <= ${f.maxRuntime ?? 0}))
      AND (${f.minRating <= 0}
           OR (movies.vote_average IS NOT NULL AND movies.vote_average > 0
               AND movies.vote_average >= ${f.minRating}))
      AND (${f.providers.length} = 0
           OR movies.providers && ${sql.param(f.providers)}::text[]
           OR (${f.includeTop200} AND movies.in_top200))
      AND NOT EXISTS (
        SELECT 1 FROM swipes s WHERE s.member_id = ${memberId}::uuid AND s.movie_id = movies.id
      )
  `)
  return Number(result.rows[0].n)
}
```

Si un troisième appelant apparaît un jour, extraire alors seulement un fragment `sql` partagé — pas avant.

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
pnpm vitest run tests/integration/queries-deck.test.ts
```

Attendu : `11 passed`.

- [ ] **Step 5: Prouver que l'ordre vient bien de `deckOrderBy`**

Remplacer temporairement `ORDER BY ${deckOrderBy(roomCode)}` par `ORDER BY movies.id`. Les deux premiers tests doivent échouer. Restaurer.

- [ ] **Step 6: Commit**

```bash
git add lib/db/queries/deck.ts tests/integration/queries-deck.test.ts
git commit -m "Ajoute les requêtes du paquet de cartes"
```

---

## Task 6: Balayage, match et annulation

C'est la tâche la plus délicate du plan. Le match doit naître d'**une seule instruction SQL** : l'atomicité de « les deux aiment en même temps → exactement un match » tient entièrement dans cette instruction et dans la contrainte d'unicité `matches_room_movie_unique`. Une lecture suivie d'une écriture en TypeScript rouvrirait la fenêtre que la contrainte est censée fermer.

Cette tâche porte aussi un test qui n'existait pas : la vérification que le SQL et `shouldCreateMatch` sont **d'accord** sur une table de cas. Sans lui, `lib/match.ts` devient une jolie fonction que le chemin réel n'exécute jamais.

**Files:**
- Create: `lib/db/queries/swipes.ts`
- Test: `tests/integration/queries-swipes.test.ts`

**Interfaces:**
- Consumes: `shouldCreateMatch`, `MatchRule` (`lib/match.ts`)
- Produit :
  - `SwipeResult { match: { movieId: number; matchId: number } | null }`
  - `recordSwipe(db, roomCode: string, memberId: string, movieId: number, liked: boolean): Promise<SwipeResult>`
  - `undoLastSwipe(db, memberId: string): Promise<{ movieId: number } | { error: 'aucun' | 'match_cree' }>`

- [ ] **Step 1: Écrire le test qui échoue**

`tests/integration/queries-swipes.test.ts` :

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { shouldCreateMatch } from '@/lib/match'
import { recordSwipe, undoLastSwipe } from '@/lib/db/queries/swipes'
import { matches, members, movies, rooms, swipes } from '@/lib/db/schema'
import { createTestDb, type TestDb } from '@/tests/helpers/db'

let db: TestDb
let close: () => Promise<void>

beforeEach(async () => {
  ;({ db, close } = await createTestDb())
  await db.insert(movies).values(
    Array.from({ length: 5 }, (_, i) => ({ id: i + 1, title: `Film ${i + 1}` })),
  )
})
afterEach(async () => {
  await close()
})

async function salon(expectedMembers: number, matchThreshold: number, prenoms: string[]) {
  await db.insert(rooms).values({ code: 'K4P2M9', expectedMembers, matchThreshold })
  const ids: string[] = []
  for (const p of prenoms) {
    const [m] = await db.insert(members).values({ roomCode: 'K4P2M9', displayName: p }).returning()
    ids.push(m.id)
  }
  return ids
}

describe('recordSwipe', () => {
  it('n’annonce pas de match sur le premier like', async () => {
    const [djo] = await salon(2, 2, ['Djo', 'Alice'])
    expect((await recordSwipe(db, 'K4P2M9', djo, 1, true)).match).toBeNull()
  })

  it('annonce le match au second like', async () => {
    const [djo, alice] = await salon(2, 2, ['Djo', 'Alice'])
    await recordSwipe(db, 'K4P2M9', djo, 1, true)
    const r = await recordSwipe(db, 'K4P2M9', alice, 1, true)
    expect(r.match?.movieId).toBe(1)
    expect(await db.select().from(matches)).toHaveLength(1)
  })

  it('ne crée pas de match si un membre a rejeté', async () => {
    const [djo, alice] = await salon(2, 2, ['Djo', 'Alice'])
    await recordSwipe(db, 'K4P2M9', djo, 1, true)
    await recordSwipe(db, 'K4P2M9', alice, 1, false)
    expect(await db.select().from(matches)).toHaveLength(0)
  })

  it('ne crée aucun match tant que l’effectif annoncé n’est pas complet', async () => {
    const [djo, alice] = await salon(3, 2, ['Djo', 'Alice'])
    await recordSwipe(db, 'K4P2M9', djo, 1, true)
    await recordSwipe(db, 'K4P2M9', alice, 1, true)
    expect(await db.select().from(matches)).toHaveLength(0)
  })

  it('respecte un seuil inférieur à l’effectif', async () => {
    const [a, b, c] = await salon(3, 2, ['A', 'B', 'C'])
    await recordSwipe(db, 'K4P2M9', a, 1, true)
    const r = await recordSwipe(db, 'K4P2M9', b, 1, true)
    expect(r.match?.movieId).toBe(1)
    expect(c).toBeDefined()
  })

  it('ne crée qu’un seul match sur deux likes simultanés', async () => {
    const [djo, alice] = await salon(2, 2, ['Djo', 'Alice'])
    const [ra, rb] = await Promise.all([
      recordSwipe(db, 'K4P2M9', djo, 1, true),
      recordSwipe(db, 'K4P2M9', alice, 1, true),
    ])
    expect(await db.select().from(matches)).toHaveLength(1)
    expect([ra.match, rb.match].filter(Boolean)).toHaveLength(1)
  })

  it('est idempotent si le même balayage est rejoué', async () => {
    const [djo] = await salon(2, 2, ['Djo', 'Alice'])
    await recordSwipe(db, 'K4P2M9', djo, 1, true)
    await recordSwipe(db, 'K4P2M9', djo, 1, false)
    const lignes = await db.select().from(swipes).where(eq(swipes.memberId, djo))
    expect(lignes).toHaveLength(1)
    expect(lignes[0].liked).toBe(true)
  })
})

describe('accord entre le SQL et shouldCreateMatch', () => {
  const cas = [
    { effectif: 2, seuil: 2, presents: 2, likes: 2, attendu: true },
    { effectif: 2, seuil: 2, presents: 2, likes: 1, attendu: false },
    { effectif: 3, seuil: 3, presents: 3, likes: 3, attendu: true },
    { effectif: 3, seuil: 2, presents: 3, likes: 2, attendu: true },
    { effectif: 3, seuil: 2, presents: 3, likes: 1, attendu: false },
    { effectif: 4, seuil: 3, presents: 3, likes: 3, attendu: false },
    { effectif: 8, seuil: 5, presents: 8, likes: 5, attendu: true },
    { effectif: 8, seuil: 5, presents: 8, likes: 4, attendu: false },
  ]

  for (const c of cas) {
    it(`effectif ${c.effectif}, seuil ${c.seuil}, ${c.presents} présents, ${c.likes} likes`, async () => {
      const prenoms = Array.from({ length: c.presents }, (_, i) => `M${i + 1}`)
      const ids = await salon(c.effectif, c.seuil, prenoms)
      for (let i = 0; i < c.likes; i++) await recordSwipe(db, 'K4P2M9', ids[i], 1, true)

      const cree = (await db.select().from(matches)).length === 1
      const attenduParLaFonction = shouldCreateMatch(
        ids,
        ids.slice(0, c.likes),
        { expectedMembers: c.effectif, threshold: c.seuil },
      )
      expect(cree).toBe(c.attendu)
      expect(cree).toBe(attenduParLaFonction)
    })
  }
})

describe('undoLastSwipe', () => {
  it('retire le dernier balayage', async () => {
    const [djo] = await salon(2, 2, ['Djo', 'Alice'])
    await recordSwipe(db, 'K4P2M9', djo, 1, false)
    await recordSwipe(db, 'K4P2M9', djo, 2, false)
    expect(await undoLastSwipe(db, djo)).toEqual({ movieId: 2 })
    expect(await db.select().from(swipes).where(eq(swipes.memberId, djo))).toHaveLength(1)
  })

  it('refuse d’annuler un balayage qui a créé un match', async () => {
    const [djo, alice] = await salon(2, 2, ['Djo', 'Alice'])
    await recordSwipe(db, 'K4P2M9', djo, 1, true)
    await recordSwipe(db, 'K4P2M9', alice, 1, true)
    expect(await undoLastSwipe(db, alice)).toEqual({ error: 'match_cree' })
    expect(await db.select().from(matches)).toHaveLength(1)
  })

  it('refuse quand il n’y a rien à annuler', async () => {
    const [djo] = await salon(2, 2, ['Djo', 'Alice'])
    expect(await undoLastSwipe(db, djo)).toEqual({ error: 'aucun' })
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm vitest run tests/integration/queries-swipes.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "@/lib/db/queries/swipes"`.

- [ ] **Step 3: Écrire l'implémentation**

`lib/db/queries/swipes.ts` :

```ts
import { sql } from 'drizzle-orm'

export interface SwipeResult {
  match: { movieId: number; matchId: number } | null
}

/**
 * Enregistre un balayage puis tente de créer le match **en une seule
 * instruction**. L'atomicité de « les deux aiment au même instant → exactement
 * un match » tient dans cette instruction et dans la contrainte d'unicité
 * `matches_room_movie_unique` : une lecture suivie d'une écriture en TypeScript
 * rouvrirait la fenêtre que cette contrainte referme.
 *
 * Le premier balayage sur un film fait foi : `ON CONFLICT DO NOTHING` rend
 * l'appel idempotent, ce qui protège du double envoi depuis deux onglets.
 */
export async function recordSwipe(
  db: any,
  roomCode: string,
  memberId: string,
  movieId: number,
  liked: boolean,
): Promise<SwipeResult> {
  await db.execute(sql`
    INSERT INTO swipes (member_id, movie_id, liked)
    VALUES (${memberId}::uuid, ${movieId}, ${liked})
    ON CONFLICT (member_id, movie_id) DO NOTHING
  `)

  if (!liked) return { match: null }

  const result = await db.execute<{ id: number }>(sql`
    INSERT INTO matches (room_code, movie_id)
    SELECT r.code, ${movieId}
    FROM rooms r
    WHERE r.code = ${roomCode}
      AND (SELECT count(*) FROM members m WHERE m.room_code = r.code) = r.expected_members
      AND (
        SELECT count(*)
        FROM members m
        JOIN swipes s ON s.member_id = m.id AND s.movie_id = ${movieId} AND s.liked
        WHERE m.room_code = r.code
      ) >= r.match_threshold
    ON CONFLICT (room_code, movie_id) DO NOTHING
    RETURNING id
  `)

  const ligne = result.rows[0]
  return ligne ? { match: { movieId, matchId: Number(ligne.id) } } : { match: null }
}

/**
 * Annule le dernier balayage. Refusé si ce balayage a produit un match :
 * le match est peut-être déjà affiché chez les autres, et le voir disparaître
 * sans explication serait pire que de ne pas pouvoir revenir en arrière.
 */
export async function undoLastSwipe(
  db: any,
  memberId: string,
): Promise<{ movieId: number } | { error: 'aucun' | 'match_cree' }> {
  const dernier = await db.execute<{ movie_id: number; room_code: string }>(sql`
    SELECT s.movie_id, m.room_code
    FROM swipes s JOIN members m ON m.id = s.member_id
    WHERE s.member_id = ${memberId}::uuid
    ORDER BY s.created_at DESC
    LIMIT 1
  `)
  const ligne = dernier.rows[0]
  if (!ligne) return { error: 'aucun' }

  const match = await db.execute<{ id: number }>(sql`
    SELECT id FROM matches WHERE room_code = ${ligne.room_code} AND movie_id = ${ligne.movie_id}
  `)
  if (match.rows[0]) return { error: 'match_cree' }

  await db.execute(sql`
    DELETE FROM swipes WHERE member_id = ${memberId}::uuid AND movie_id = ${ligne.movie_id}
  `)
  return { movieId: Number(ligne.movie_id) }
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
pnpm vitest run tests/integration/queries-swipes.test.ts
```

Attendu : `18 passed`.

- [ ] **Step 5: Prouver que les garde-fous mordent**

Trois mutations, chacune suivie d'une restauration :

1. Retirer la condition `= r.expected_members` → le test « tant que l'effectif n'est pas complet » doit échouer.
2. Remplacer `>= r.match_threshold` par `>= 1` → « ne crée pas de match si un membre a rejeté » et plusieurs cas du tableau d'accord doivent échouer.
3. Retirer `ON CONFLICT (room_code, movie_id) DO NOTHING` → le test des deux likes simultanés doit échouer ou lever.

Coller chaque sortie en échec.

- [ ] **Step 6: Commit**

```bash
git add lib/db/queries/swipes.ts tests/integration/queries-swipes.test.ts
git commit -m "Ajoute l'enregistrement des balayages et la création atomique des matchs"
```

---

## Task 7: Matchs, événements et filtres

**Files:**
- Create: `lib/db/queries/matches.ts`, `lib/db/queries/filters.ts`
- Test: `tests/integration/queries-matches.test.ts`

**Interfaces:**
- Consumes: `MatchStatus` (`lib/db/schema.ts`), `DeckCard` (tâche 5)
- Produit :
  - `MatchRow { matchId: number; status: MatchStatus; createdAt: string; movie: DeckCard }`
  - `listMatches(db, roomCode: string, status?: MatchStatus): Promise<MatchRow[]>`
  - `setMatchStatus(db, roomCode: string, movieId: number, status: MatchStatus): Promise<boolean>`
  - `randomMatch(db, roomCode: string): Promise<MatchRow | null>`
  - `matchesSince(db, roomCode: string, sinceId: number): Promise<MatchRow[]>`
  - `getFilters(db, memberId: string): Promise<DeckFilters>`
  - `setFilters(db, memberId: string, filters: DeckFilters): Promise<void>`

- [ ] **Step 1: Écrire le test qui échoue**

`tests/integration/queries-matches.test.ts` :

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getFilters, setFilters } from '@/lib/db/queries/filters'
import { listMatches, matchesSince, randomMatch, setMatchStatus } from '@/lib/db/queries/matches'
import { matches, memberFilters, members, movies, rooms } from '@/lib/db/schema'
import { createTestDb, type TestDb } from '@/tests/helpers/db'

let db: TestDb
let close: () => Promise<void>

beforeEach(async () => {
  ;({ db, close } = await createTestDb())
  await db.insert(rooms).values({ code: 'K4P2M9', expectedMembers: 2, matchThreshold: 2 })
  await db.insert(movies).values(
    Array.from({ length: 4 }, (_, i) => ({
      id: i + 1,
      title: `Film ${i + 1}`,
      genres: ['Action'],
      keywords: ['braquage'],
    })),
  )
  await db.insert(matches).values([
    { roomCode: 'K4P2M9', movieId: 1 },
    { roomCode: 'K4P2M9', movieId: 2 },
    { roomCode: 'K4P2M9', movieId: 3 },
  ])
})
afterEach(async () => {
  await close()
})

describe('listMatches', () => {
  it('rend les matchs avec leur film et leurs tags', async () => {
    const l = await listMatches(db, 'K4P2M9')
    expect(l).toHaveLength(3)
    expect(l[0].movie.tags).toEqual(['braquage', 'Action'])
    expect(l[0].status).toBe('a_voir')
  })

  it('filtre par statut', async () => {
    await setMatchStatus(db, 'K4P2M9', 2, 'vu')
    expect((await listMatches(db, 'K4P2M9', 'vu')).map((m) => m.movie.id)).toEqual([2])
    expect((await listMatches(db, 'K4P2M9', 'a_voir')).map((m) => m.movie.id).sort()).toEqual([1, 3])
  })

  it('ne rend pas les matchs d’un autre salon', async () => {
    await db.insert(rooms).values({ code: 'AUTRE1', expectedMembers: 2, matchThreshold: 2 })
    await db.insert(matches).values({ roomCode: 'AUTRE1', movieId: 4 })
    expect((await listMatches(db, 'K4P2M9')).map((m) => m.movie.id)).not.toContain(4)
  })
})

describe('setMatchStatus', () => {
  it('accepte les trois statuts', async () => {
    for (const s of ['vu', 'abandonne', 'a_voir'] as const) {
      expect(await setMatchStatus(db, 'K4P2M9', 1, s)).toBe(true)
    }
  })

  it('rend false sur un film qui n’est pas un match de ce salon', async () => {
    expect(await setMatchStatus(db, 'K4P2M9', 4, 'vu')).toBe(false)
  })
})

describe('randomMatch', () => {
  it('ne tire que parmi les « à voir »', async () => {
    await setMatchStatus(db, 'K4P2M9', 1, 'vu')
    await setMatchStatus(db, 'K4P2M9', 3, 'abandonne')
    for (let i = 0; i < 10; i++) {
      expect((await randomMatch(db, 'K4P2M9'))?.movie.id).toBe(2)
    }
  })

  it('rend null quand il n’y a rien à voir', async () => {
    for (const id of [1, 2, 3]) await setMatchStatus(db, 'K4P2M9', id, 'vu')
    expect(await randomMatch(db, 'K4P2M9')).toBeNull()
  })
})

describe('matchesSince', () => {
  it('ne rend que les matchs postérieurs au curseur', async () => {
    const tous = await listMatches(db, 'K4P2M9')
    const curseur = Math.min(...tous.map((m) => m.matchId))
    const apres = await matchesSince(db, 'K4P2M9', curseur)
    expect(apres.map((m) => m.matchId).every((id) => id > curseur)).toBe(true)
    expect(apres).toHaveLength(2)
  })

  it('rend une liste vide quand rien n’est arrivé', async () => {
    const tous = await listMatches(db, 'K4P2M9')
    expect(await matchesSince(db, 'K4P2M9', Math.max(...tous.map((m) => m.matchId)))).toEqual([])
  })
})

describe('filtres', () => {
  it('rend les valeurs par défaut d’un membre neuf', async () => {
    const [m] = await db.insert(members).values({ roomCode: 'K4P2M9', displayName: 'Djo' }).returning()
    await db.insert(memberFilters).values({ memberId: m.id })
    expect(await getFilters(db, m.id)).toEqual({
      genres: [],
      yearFrom: null,
      yearTo: null,
      minRating: 0,
      maxRuntime: null,
      providers: [],
      includeTop200: true,
    })
  })

  it('relit ce qu’on a écrit', async () => {
    const [m] = await db.insert(members).values({ roomCode: 'K4P2M9', displayName: 'Djo' }).returning()
    await db.insert(memberFilters).values({ memberId: m.id })
    const voulu = {
      genres: ['Comédie'],
      yearFrom: 1990,
      yearTo: 1999,
      minRating: 6.5,
      maxRuntime: 120,
      providers: ['netflix'],
      includeTop200: false,
    }
    await setFilters(db, m.id, voulu)
    expect(await getFilters(db, m.id)).toEqual(voulu)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm vitest run tests/integration/queries-matches.test.ts
```

Attendu : ÉCHEC — modules introuvables.

- [ ] **Step 3: Écrire `lib/db/queries/matches.ts`**

```ts
import { sql } from 'drizzle-orm'
import type { MatchStatus } from '@/lib/db/schema'
import type { DeckCard } from '@/lib/db/queries/deck'
import { buildTags } from '@/lib/keywords'

export interface MatchRow {
  matchId: number
  status: MatchStatus
  createdAt: string
  movie: DeckCard
}

const COLONNES = sql`
  m.id AS match_id, m.status, m.created_at,
  movies.id, movies.title, movies.overview, movies.poster_path, movies.release_date,
  movies.release_year, movies.runtime, movies.vote_average, movies.director,
  movies.providers, movies.keywords, movies.genres
`

function versLigne(r: Record<string, unknown>): MatchRow {
  return {
    matchId: Number(r.match_id),
    status: String(r.status) as MatchStatus,
    createdAt: new Date(String(r.created_at)).toISOString(),
    movie: {
      id: Number(r.id),
      title: String(r.title),
      overview: (r.overview as string | null) ?? null,
      posterPath: (r.poster_path as string | null) ?? null,
      releaseDate: r.release_date ? String(r.release_date) : null,
      releaseYear: r.release_year === null ? null : Number(r.release_year),
      runtime: r.runtime ? Number(r.runtime) : null,
      voteAverage: r.vote_average ? Number(r.vote_average) : null,
      director: (r.director as string | null) ?? null,
      providers: (r.providers as string[]) ?? [],
      tags: buildTags((r.keywords as string[]) ?? [], (r.genres as string[]) ?? []),
    },
  }
}

export async function listMatches(
  db: any,
  roomCode: string,
  status?: MatchStatus,
): Promise<MatchRow[]> {
  const result = await db.execute<Record<string, unknown>>(sql`
    SELECT ${COLONNES}
    FROM matches m JOIN movies ON movies.id = m.movie_id
    WHERE m.room_code = ${roomCode}
      AND (${status === undefined} OR m.status = ${status ?? ''})
    ORDER BY m.id DESC
  `)
  return result.rows.map(versLigne)
}

export async function matchesSince(
  db: any,
  roomCode: string,
  sinceId: number,
): Promise<MatchRow[]> {
  const result = await db.execute<Record<string, unknown>>(sql`
    SELECT ${COLONNES}
    FROM matches m JOIN movies ON movies.id = m.movie_id
    WHERE m.room_code = ${roomCode} AND m.id > ${sinceId}
    ORDER BY m.id ASC
  `)
  return result.rows.map(versLigne)
}

export async function setMatchStatus(
  db: any,
  roomCode: string,
  movieId: number,
  status: MatchStatus,
): Promise<boolean> {
  const result = await db.execute<{ id: number }>(sql`
    UPDATE matches SET status = ${status}, updated_at = now()
    WHERE room_code = ${roomCode} AND movie_id = ${movieId}
    RETURNING id
  `)
  return result.rows.length > 0
}

export async function randomMatch(db: any, roomCode: string): Promise<MatchRow | null> {
  const result = await db.execute<Record<string, unknown>>(sql`
    SELECT ${COLONNES}
    FROM matches m JOIN movies ON movies.id = m.movie_id
    WHERE m.room_code = ${roomCode} AND m.status = 'a_voir'
    ORDER BY random() LIMIT 1
  `)
  const r = result.rows[0]
  return r ? versLigne(r) : null
}
```

- [ ] **Step 4: Écrire `lib/db/queries/filters.ts`**

```ts
import { eq } from 'drizzle-orm'
import type { DeckFilters } from '@/lib/db/queries/deck'
import { memberFilters } from '@/lib/db/schema'

export const FILTRES_PAR_DEFAUT: DeckFilters = {
  genres: [],
  yearFrom: null,
  yearTo: null,
  minRating: 0,
  maxRuntime: null,
  providers: [],
  includeTop200: true,
}

export async function getFilters(db: any, memberId: string): Promise<DeckFilters> {
  const lignes = await db.select().from(memberFilters).where(eq(memberFilters.memberId, memberId))
  const f = lignes[0]
  if (!f) return { ...FILTRES_PAR_DEFAUT }
  return {
    genres: f.genres ?? [],
    yearFrom: f.yearFrom ?? null,
    yearTo: f.yearTo ?? null,
    minRating: Number(f.minRating ?? 0),
    maxRuntime: f.maxRuntime ?? null,
    providers: f.providers ?? [],
    includeTop200: f.includeTop200 ?? true,
  }
}

export async function setFilters(db: any, memberId: string, f: DeckFilters): Promise<void> {
  await db
    .insert(memberFilters)
    .values({ memberId, ...f, updatedAt: new Date() })
    .onConflictDoUpdate({ target: memberFilters.memberId, set: { ...f, updatedAt: new Date() } })
}
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

```bash
pnpm vitest run tests/integration/queries-matches.test.ts
```

Attendu : `11 passed`.

- [ ] **Step 6: Commit**

```bash
git add lib/db/queries/matches.ts lib/db/queries/filters.ts tests/integration/queries-matches.test.ts
git commit -m "Ajoute les requêtes de matchs, d'événements et de filtres"
```

---

## Task 8: Socle des routes et routes de salon

**Files:**
- Create: `lib/api/respond.ts`, `lib/api/guard.ts`
- Create: `app/api/rooms/route.ts`, `app/api/rooms/[code]/join/route.ts`, `app/api/rooms/[code]/members/route.ts`, `app/api/rooms/[code]/claim/route.ts`
- Test: `tests/integration/api-rooms.test.ts`

**Interfaces:**
- Consumes: tâches 1 à 4
- Produit :
  - `ok<T>(data: T, init?: ResponseInit): Response`
  - `erreur(status: number, message: string): Response` — corps `{ erreur: string }`
  - `poserSession(response: Response, payload: SessionPayload): Response`
  - `lireMembre(request: Request): SessionPayload | null`
  - `exigerMembre(request: Request): SessionPayload | Response`

- [ ] **Step 1: Écrire le socle**

`lib/api/respond.ts` :

```ts
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, signSession, type SessionPayload } from '@/lib/session'

export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data as unknown as Record<string, unknown>, { status: 200, ...init })
}

/** Toutes les erreurs partagent la même forme et sont rédigées en français. */
export function erreur(status: number, message: string): Response {
  return Response.json({ erreur: message }, { status })
}

export function poserSession(response: Response, payload: SessionPayload): Response {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  response.headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE}=${signSession(payload)}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  )
  return response
}
```

`lib/api/guard.ts` :

```ts
import { SESSION_COOKIE, readSession, type SessionPayload } from '@/lib/session'
import { erreur } from '@/lib/api/respond'

function cookie(request: Request, nom: string): string | undefined {
  const brut = request.headers.get('cookie')
  if (!brut) return undefined
  for (const morceau of brut.split(';')) {
    const [cle, ...reste] = morceau.trim().split('=')
    if (cle === nom) return reste.join('=')
  }
  return undefined
}

export function lireMembre(request: Request): SessionPayload | null {
  return readSession(cookie(request, SESSION_COOKIE))
}

export function exigerMembre(request: Request): SessionPayload | Response {
  return lireMembre(request) ?? erreur(401, 'Rejoignez un salon avant de continuer.')
}
```

- [ ] **Step 2: Écrire le test qui échoue**

`tests/integration/api-rooms.test.ts` — les routes sont appelées comme de simples fonctions, sans serveur HTTP :

```ts
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestDb, type TestDb } from '@/tests/helpers/db'

let db: TestDb

beforeAll(async () => {
  process.env.SESSION_SECRET = 'secret-de-test-suffisamment-long-pour-hmac'
  ;({ db } = await createTestDb())
  vi.doMock('@/lib/db/client', () => ({ getDb: () => db, closePool: async () => {} }))
})

async function poster(url: string, body: unknown, cookie?: string) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  })
}

describe('POST /api/rooms', () => {
  it('crée un salon et pose le cookie', async () => {
    const { POST } = await import('@/app/api/rooms/route')
    const r = await POST(
      await poster('http://x/api/rooms', { displayName: 'Djo', expectedMembers: 2, matchThreshold: 2 }),
    )
    expect(r.status).toBe(200)
    expect(r.headers.get('set-cookie')).toMatch(/sp_session=.+HttpOnly/)
    const corps = await r.json()
    expect(corps.room.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
  })

  it('refuse un prénom vide', async () => {
    const { POST } = await import('@/app/api/rooms/route')
    const r = await POST(
      await poster('http://x/api/rooms', { displayName: '  ', expectedMembers: 2, matchThreshold: 2 }),
    )
    expect(r.status).toBe(400)
    expect((await r.json()).erreur).toMatch(/prénom/i)
  })

  it('refuse un effectif hors bornes avec un message français', async () => {
    const { POST } = await import('@/app/api/rooms/route')
    const r = await POST(
      await poster('http://x/api/rooms', { displayName: 'Djo', expectedMembers: 12, matchThreshold: 2 }),
    )
    expect(r.status).toBe(400)
    expect((await r.json()).erreur).toMatch(/entre 2 et 8/)
  })

  it('refuse un seuil supérieur à l’effectif', async () => {
    const { POST } = await import('@/app/api/rooms/route')
    const r = await POST(
      await poster('http://x/api/rooms', { displayName: 'Djo', expectedMembers: 3, matchThreshold: 4 }),
    )
    expect(r.status).toBe(400)
  })
})
```

- [ ] **Step 3: Écrire les routes**

`app/api/rooms/route.ts` :

```ts
import { MAX_MEMBERS, MIN_MEMBERS } from '@/lib/match'
import { erreur, ok, poserSession } from '@/lib/api/respond'
import { getDb } from '@/lib/db/client'
import { createRoom } from '@/lib/db/queries/rooms'

export async function POST(request: Request): Promise<Response> {
  let corps: unknown
  try {
    corps = await request.json()
  } catch {
    return erreur(400, 'Requête illisible.')
  }

  const { displayName, expectedMembers, matchThreshold } = corps as Record<string, unknown>

  if (typeof displayName !== 'string' || displayName.trim().length === 0) {
    return erreur(400, 'Indiquez un prénom.')
  }
  if (displayName.trim().length > 30) {
    return erreur(400, 'Le prénom ne doit pas dépasser 30 caractères.')
  }
  if (
    typeof expectedMembers !== 'number' ||
    !Number.isInteger(expectedMembers) ||
    expectedMembers < MIN_MEMBERS ||
    expectedMembers > MAX_MEMBERS
  ) {
    return erreur(400, `Le nombre de participants doit être entre ${MIN_MEMBERS} et ${MAX_MEMBERS}.`)
  }
  if (
    typeof matchThreshold !== 'number' ||
    !Number.isInteger(matchThreshold) ||
    matchThreshold < MIN_MEMBERS ||
    matchThreshold > expectedMembers
  ) {
    return erreur(400, `Le seuil doit être entre ${MIN_MEMBERS} et le nombre de participants.`)
  }

  const { room, member } = await createRoom(getDb(), {
    displayName: displayName.trim(),
    expectedMembers,
    matchThreshold,
  })
  return poserSession(ok({ room, member }), { memberId: member.id, roomCode: room.code })
}
```

`app/api/rooms/[code]/join/route.ts` :

```ts
import { erreur, ok, poserSession } from '@/lib/api/respond'
import { getDb } from '@/lib/db/client'
import { hitRateLimit } from '@/lib/rate-limit'
import { getRoom, joinRoom } from '@/lib/db/queries/rooms'
import { isValidRoomCode, normalizeRoomCode } from '@/lib/roomcode'

const TENTATIVES_PAR_MINUTE = 10

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await params
  if (!isValidRoomCode(code)) return erreur(400, 'Ce code de salon n’est pas valide.')

  const db = getDb()
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'inconnue'
  const limite = await hitRateLimit(db, `join:${ip}`, TENTATIVES_PAR_MINUTE, 60)
  if (!limite.allowed) return erreur(429, 'Trop de tentatives. Réessayez dans une minute.')

  let corps: unknown
  try {
    corps = await request.json()
  } catch {
    return erreur(400, 'Requête illisible.')
  }
  const { displayName } = corps as Record<string, unknown>
  if (typeof displayName !== 'string' || displayName.trim().length === 0) {
    return erreur(400, 'Indiquez un prénom.')
  }

  const resultat = await joinRoom(db, code, displayName.trim())
  if ('error' in resultat) {
    if (resultat.error === 'introuvable') return erreur(404, 'Aucun salon ne porte ce code.')
    if (resultat.error === 'complet') {
      const salon = await getRoom(db, code)
      return erreur(
        409,
        `Ce salon est complet : ${salon?.expectedMembers ?? 0} participants étaient annoncés.`,
      )
    }
    return erreur(409, 'Ce prénom est déjà pris dans ce salon.')
  }

  const salon = await getRoom(db, code)
  return poserSession(ok({ room: salon, member: resultat.member }), {
    memberId: resultat.member.id,
    roomCode: normalizeRoomCode(code),
  })
}
```

`app/api/rooms/[code]/members/route.ts` :

```ts
import { erreur, ok } from '@/lib/api/respond'
import { getDb } from '@/lib/db/client'
import { getRoom, listMembers } from '@/lib/db/queries/rooms'
import { isValidRoomCode } from '@/lib/roomcode'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await params
  if (!isValidRoomCode(code)) return erreur(400, 'Ce code de salon n’est pas valide.')
  const db = getDb()
  const salon = await getRoom(db, code)
  if (!salon) return erreur(404, 'Aucun salon ne porte ce code.')
  return ok({ room: salon, members: await listMembers(db, code) })
}
```

`app/api/rooms/[code]/claim/route.ts` :

```ts
import { erreur, ok, poserSession } from '@/lib/api/respond'
import { getDb } from '@/lib/db/client'
import { claimMember } from '@/lib/db/queries/rooms'
import { isValidRoomCode, normalizeRoomCode } from '@/lib/roomcode'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await params
  if (!isValidRoomCode(code)) return erreur(400, 'Ce code de salon n’est pas valide.')

  let corps: unknown
  try {
    corps = await request.json()
  } catch {
    return erreur(400, 'Requête illisible.')
  }
  const { memberId } = corps as Record<string, unknown>
  if (typeof memberId !== 'string') return erreur(400, 'Identifiant de membre manquant.')

  const membre = await claimMember(getDb(), code, memberId)
  if (!membre) return erreur(404, 'Cette personne n’est pas dans ce salon.')

  return poserSession(ok({ member: membre }), {
    memberId: membre.id,
    roomCode: normalizeRoomCode(code),
  })
}
```

- [ ] **Step 4: Lancer les tests**

```bash
pnpm vitest run tests/integration/api-rooms.test.ts
pnpm test
```

Attendu : la suite complète est verte.

- [ ] **Step 5: Commit**

```bash
git add lib/api app/api/rooms tests/integration/api-rooms.test.ts
git commit -m "Ajoute le socle des routes et les routes de salon"
```

---

## Task 9: Routes du paquet, du balayage et des événements

**Files:**
- Create: `app/api/deck/route.ts`, `app/api/deck/count/route.ts`, `app/api/swipes/route.ts`, `app/api/swipes/last/route.ts`, `app/api/events/route.ts`
- Test: `tests/integration/api-deck.test.ts`

**Interfaces:**
- Consumes: tâches 5, 6, 7, 8
- Produit : les cinq routes ci-dessus

Réponses attendues :

| Route | Méthode | Corps de réponse |
|---|---|---|
| `/api/deck?limit=20` | GET | `{ cards: DeckCard[] }` |
| `/api/deck/count` | GET | `{ count: number }` — accepte les filtres en paramètres de requête pour l'aperçu en direct |
| `/api/swipes` | POST | `{ match: { movieId, matchId } | null }` |
| `/api/swipes/last` | DELETE | `{ movieId }` ou une erreur 409 |
| `/api/events?since=0` | GET | `{ matches: MatchRow[], room: RoomSummary, members: MemberSummary[] }` |

- [ ] **Step 1: Écrire le test qui échoue**

`tests/integration/api-deck.test.ts` :

```ts
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { movies } from '@/lib/db/schema'
import { signSession } from '@/lib/session'
import { createTestDb, type TestDb } from '@/tests/helpers/db'

let db: TestDb

beforeAll(async () => {
  process.env.SESSION_SECRET = 'secret-de-test-suffisamment-long-pour-hmac'
  ;({ db } = await createTestDb())
  vi.doMock('@/lib/db/client', () => ({ getDb: () => db, closePool: async () => {} }))
  await db.insert(movies).values(
    Array.from({ length: 30 }, (_, i) => ({
      id: i + 1,
      title: `Film ${i + 1}`,
      genres: ['Action'],
      keywords: ['braquage'],
    })),
  )
})

async function salonDeDeux() {
  const { POST: creer } = await import('@/app/api/rooms/route')
  const r = await creer(
    new Request('http://x/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Djo', expectedMembers: 2, matchThreshold: 2 }),
    }),
  )
  const { room, member } = await r.json()
  const { POST: rejoindre } = await import('@/app/api/rooms/[code]/join/route')
  const r2 = await rejoindre(
    new Request(`http://x/api/rooms/${room.code}/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Alice' }),
    }),
    { params: Promise.resolve({ code: room.code }) },
  )
  const { member: alice } = await r2.json()
  const cookie = (id: string) => `sp_session=${signSession({ memberId: id, roomCode: room.code })}`
  return { room, djo: cookie(member.id), alice: cookie(alice.id) }
}

describe('GET /api/deck', () => {
  it('refuse sans session', async () => {
    const { GET } = await import('@/app/api/deck/route')
    const r = await GET(new Request('http://x/api/deck'))
    expect(r.status).toBe(401)
    expect((await r.json()).erreur).toMatch(/Rejoignez un salon/)
  })

  it('rend des cartes complètes', async () => {
    const { djo } = await salonDeDeux()
    const { GET } = await import('@/app/api/deck/route')
    const r = await GET(new Request('http://x/api/deck?limit=5', { headers: { cookie: djo } }))
    const { cards } = await r.json()
    expect(cards).toHaveLength(5)
    expect(cards[0]).toHaveProperty('tags')
    expect(cards[0]).toHaveProperty('posterPath')
  })

  it('donne le même ordre aux deux membres', async () => {
    const { djo, alice } = await salonDeDeux()
    const { GET } = await import('@/app/api/deck/route')
    const a = await (await GET(new Request('http://x/api/deck?limit=10', { headers: { cookie: djo } }))).json()
    const b = await (await GET(new Request('http://x/api/deck?limit=10', { headers: { cookie: alice } }))).json()
    expect(a.cards.map((c: { id: number }) => c.id)).toEqual(b.cards.map((c: { id: number }) => c.id))
  })
})

describe('POST /api/swipes puis GET /api/events', () => {
  it('crée un match visible par l’autre membre', async () => {
    const { djo, alice } = await salonDeDeux()
    const { POST } = await import('@/app/api/swipes/route')
    const { GET: evenements } = await import('@/app/api/events/route')

    const corps = (id: number) =>
      JSON.stringify({ movieId: id, liked: true })

    await POST(new Request('http://x/api/swipes', { method: 'POST', headers: { cookie: djo, 'content-type': 'application/json' }, body: corps(1) }))
    const r = await POST(new Request('http://x/api/swipes', { method: 'POST', headers: { cookie: alice, 'content-type': 'application/json' }, body: corps(1) }))
    expect((await r.json()).match.movieId).toBe(1)

    const e = await evenements(new Request('http://x/api/events?since=0', { headers: { cookie: djo } }))
    const { matches, room } = await e.json()
    expect(matches).toHaveLength(1)
    expect(matches[0].movie.id).toBe(1)
    expect(room.complete).toBe(true)
  })

  it('refuse un identifiant de film qui n’existe pas', async () => {
    const { djo } = await salonDeDeux()
    const { POST } = await import('@/app/api/swipes/route')
    const r = await POST(
      new Request('http://x/api/swipes', {
        method: 'POST',
        headers: { cookie: djo, 'content-type': 'application/json' },
        body: JSON.stringify({ movieId: 99999, liked: true }),
      }),
    )
    expect(r.status).toBe(404)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm vitest run tests/integration/api-deck.test.ts
```

Attendu : ÉCHEC — les modules de routes n'existent pas.

- [ ] **Step 3: Écrire les routes**

`app/api/deck/route.ts` :

```ts
import { erreur, ok } from '@/lib/api/respond'
import { exigerMembre } from '@/lib/api/guard'
import { getDb } from '@/lib/db/client'
import { fetchDeck } from '@/lib/db/queries/deck'
import { getFilters } from '@/lib/db/queries/filters'

const LIMITE_PAR_DEFAUT = 20
const LIMITE_MAX = 50

export async function GET(request: Request): Promise<Response> {
  const session = exigerMembre(request)
  if (session instanceof Response) return session

  const brut = new URL(request.url).searchParams.get('limit')
  const limite = Math.min(LIMITE_MAX, Math.max(1, Number(brut) || LIMITE_PAR_DEFAUT))

  const db = getDb()
  const filtres = await getFilters(db, session.memberId)
  const cards = await fetchDeck(db, session.roomCode, session.memberId, filtres, limite)
  if (cards.length === 0) return ok({ cards, message: 'Plus aucun film ne correspond à vos filtres.' })
  return ok({ cards })
}
```

`app/api/deck/count/route.ts` :

```ts
import { ok } from '@/lib/api/respond'
import { exigerMembre } from '@/lib/api/guard'
import { getDb } from '@/lib/db/client'
import { countDeck, type DeckFilters } from '@/lib/db/queries/deck'
import { FILTRES_PAR_DEFAUT, getFilters } from '@/lib/db/queries/filters'

/** Lit des filtres depuis l'URL pour l'aperçu en direct de la feuille de filtres. */
function depuisUrl(url: URL, defaut: DeckFilters): DeckFilters {
  const p = url.searchParams
  if ([...p.keys()].length === 0) return defaut
  const nombre = (cle: string) => (p.get(cle) === null ? null : Number(p.get(cle)))
  return {
    genres: p.get('genres') ? p.get('genres')!.split(',').filter(Boolean) : [],
    yearFrom: nombre('yearFrom'),
    yearTo: nombre('yearTo'),
    minRating: Number(p.get('minRating') ?? 0),
    maxRuntime: nombre('maxRuntime'),
    providers: p.get('providers') ? p.get('providers')!.split(',').filter(Boolean) : [],
    includeTop200: p.get('includeTop200') !== 'false',
  }
}

export async function GET(request: Request): Promise<Response> {
  const session = exigerMembre(request)
  if (session instanceof Response) return session
  const db = getDb()
  const enregistres = await getFilters(db, session.memberId)
  const filtres = depuisUrl(new URL(request.url), enregistres ?? FILTRES_PAR_DEFAUT)
  return ok({ count: await countDeck(db, session.memberId, filtres) })
}
```

`app/api/swipes/route.ts` :

```ts
import { sql } from 'drizzle-orm'
import { erreur, ok } from '@/lib/api/respond'
import { exigerMembre } from '@/lib/api/guard'
import { getDb } from '@/lib/db/client'
import { recordSwipe } from '@/lib/db/queries/swipes'

export async function POST(request: Request): Promise<Response> {
  const session = exigerMembre(request)
  if (session instanceof Response) return session

  let corps: unknown
  try {
    corps = await request.json()
  } catch {
    return erreur(400, 'Requête illisible.')
  }
  const { movieId, liked } = corps as Record<string, unknown>
  if (typeof movieId !== 'number' || !Number.isInteger(movieId)) {
    return erreur(400, 'Identifiant de film manquant.')
  }
  if (typeof liked !== 'boolean') return erreur(400, 'Sens du balayage manquant.')

  const db = getDb()
  const existe = await db.execute<{ id: number }>(
    sql`SELECT id FROM movies WHERE id = ${movieId}`,
  )
  if (existe.rows.length === 0) return erreur(404, 'Ce film n’est pas au catalogue.')

  return ok(await recordSwipe(db, session.roomCode, session.memberId, movieId, liked))
}
```

`app/api/swipes/last/route.ts` :

```ts
import { erreur, ok } from '@/lib/api/respond'
import { exigerMembre } from '@/lib/api/guard'
import { getDb } from '@/lib/db/client'
import { undoLastSwipe } from '@/lib/db/queries/swipes'

export async function DELETE(request: Request): Promise<Response> {
  const session = exigerMembre(request)
  if (session instanceof Response) return session

  const resultat = await undoLastSwipe(getDb(), session.memberId)
  if ('error' in resultat) {
    if (resultat.error === 'aucun') return erreur(404, 'Il n’y a rien à annuler.')
    return erreur(409, 'Ce film a déjà fait un match, il est trop tard pour revenir en arrière.')
  }
  return ok(resultat)
}
```

`app/api/events/route.ts` :

```ts
import { erreur, ok } from '@/lib/api/respond'
import { exigerMembre } from '@/lib/api/guard'
import { getDb } from '@/lib/db/client'
import { matchesSince } from '@/lib/db/queries/matches'
import { getRoom, listMembers } from '@/lib/db/queries/rooms'

export async function GET(request: Request): Promise<Response> {
  const session = exigerMembre(request)
  if (session instanceof Response) return session

  const since = Number(new URL(request.url).searchParams.get('since') ?? 0) || 0
  const db = getDb()
  const room = await getRoom(db, session.roomCode)
  if (!room) return erreur(404, 'Ce salon n’existe plus.')

  return ok({
    room,
    members: await listMembers(db, session.roomCode),
    matches: await matchesSince(db, session.roomCode, since),
  })
}
```

- [ ] **Step 4: Lancer les tests**

```bash
pnpm vitest run tests/integration/api-deck.test.ts
pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add app/api/deck app/api/swipes app/api/events tests/integration/api-deck.test.ts
git commit -m "Ajoute les routes du paquet, du balayage et des événements"
```

---

## Task 10: Routes des matchs, des filtres et du cron

**Files:**
- Create: `app/api/matches/route.ts`, `app/api/matches/[movieId]/route.ts`, `app/api/matches/random/route.ts`, `app/api/filters/route.ts`, `app/api/cron/ingest/route.ts`
- Test: `tests/integration/api-matches.test.ts`

**Interfaces:**
- Consumes: tâches 7, 8
- Produit : les cinq routes ci-dessus

Sur le cron : le script d'ingestion du plan 1 est un traitement de vingt minutes, incompatible avec la durée maximale d'une fonction Vercel. Cette route ne l'exécute donc pas. Elle vérifie le secret, relance uniquement la **phase 2** sur un lot borné de films dont le détail manque, et renvoie le nombre traité. Une exécution hebdomadaire rattrape ainsi progressivement le catalogue, et le rafraîchissement complet reste une commande lancée à la main.

- [ ] **Step 1: Écrire le test qui échoue**

`tests/integration/api-matches.test.ts` :

```ts
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { matches, movies, rooms } from '@/lib/db/schema'
import { signSession } from '@/lib/session'
import { createTestDb, type TestDb } from '@/tests/helpers/db'

let db: TestDb
let cookie: string

beforeAll(async () => {
  process.env.SESSION_SECRET = 'secret-de-test-suffisamment-long-pour-hmac'
  process.env.CRON_SECRET = 'secret-cron-de-test'
  ;({ db } = await createTestDb())
  vi.doMock('@/lib/db/client', () => ({ getDb: () => db, closePool: async () => {} }))

  await db.insert(rooms).values({ code: 'K4P2M9', expectedMembers: 2, matchThreshold: 2 })
  await db.insert(movies).values([
    { id: 1, title: 'Un', genres: ['Action'], keywords: ['braquage'] },
    { id: 2, title: 'Deux', genres: ['Comédie'], keywords: [] },
  ])
  await db.insert(matches).values([
    { roomCode: 'K4P2M9', movieId: 1 },
    { roomCode: 'K4P2M9', movieId: 2 },
  ])
  const { members } = await import('@/lib/db/schema')
  const [m] = await db.insert(members).values({ roomCode: 'K4P2M9', displayName: 'Djo' }).returning()
  cookie = `sp_session=${signSession({ memberId: m.id, roomCode: 'K4P2M9' })}`
})

describe('GET /api/matches', () => {
  it('rend les matchs du salon', async () => {
    const { GET } = await import('@/app/api/matches/route')
    const { matches: liste } = await (
      await GET(new Request('http://x/api/matches', { headers: { cookie } }))
    ).json()
    expect(liste).toHaveLength(2)
  })

  it('refuse sans session', async () => {
    const { GET } = await import('@/app/api/matches/route')
    expect((await GET(new Request('http://x/api/matches'))).status).toBe(401)
  })
})

describe('PATCH /api/matches/[movieId]', () => {
  it('change le statut', async () => {
    const { PATCH } = await import('@/app/api/matches/[movieId]/route')
    const r = await PATCH(
      new Request('http://x/api/matches/1', {
        method: 'PATCH',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'vu' }),
      }),
      { params: Promise.resolve({ movieId: '1' }) },
    )
    expect(r.status).toBe(200)
  })

  it('refuse un statut inconnu', async () => {
    const { PATCH } = await import('@/app/api/matches/[movieId]/route')
    const r = await PATCH(
      new Request('http://x/api/matches/1', {
        method: 'PATCH',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'nawak' }),
      }),
      { params: Promise.resolve({ movieId: '1' }) },
    )
    expect(r.status).toBe(400)
  })
})

describe('GET /api/cron/ingest', () => {
  it('refuse sans le secret', async () => {
    const { GET } = await import('@/app/api/cron/ingest/route')
    expect((await GET(new Request('http://x/api/cron/ingest'))).status).toBe(401)
  })

  it('accepte avec le secret', async () => {
    const { GET } = await import('@/app/api/cron/ingest/route')
    const r = await GET(
      new Request('http://x/api/cron/ingest', {
        headers: { authorization: 'Bearer secret-cron-de-test' },
      }),
    )
    expect(r.status).toBe(200)
    expect(await r.json()).toHaveProperty('traites')
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm vitest run tests/integration/api-matches.test.ts
```

- [ ] **Step 3: Écrire les routes**

`app/api/matches/route.ts` :

```ts
import { ok } from '@/lib/api/respond'
import { exigerMembre } from '@/lib/api/guard'
import { getDb } from '@/lib/db/client'
import { listMatches } from '@/lib/db/queries/matches'
import type { MatchStatus } from '@/lib/db/schema'

const STATUTS: MatchStatus[] = ['a_voir', 'vu', 'abandonne']

export async function GET(request: Request): Promise<Response> {
  const session = exigerMembre(request)
  if (session instanceof Response) return session
  const brut = new URL(request.url).searchParams.get('status')
  const statut = STATUTS.includes(brut as MatchStatus) ? (brut as MatchStatus) : undefined
  return ok({ matches: await listMatches(getDb(), session.roomCode, statut) })
}
```

`app/api/matches/[movieId]/route.ts` :

```ts
import { erreur, ok } from '@/lib/api/respond'
import { exigerMembre } from '@/lib/api/guard'
import { getDb } from '@/lib/db/client'
import { setMatchStatus } from '@/lib/db/queries/matches'
import type { MatchStatus } from '@/lib/db/schema'

const STATUTS: MatchStatus[] = ['a_voir', 'vu', 'abandonne']

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ movieId: string }> },
): Promise<Response> {
  const session = exigerMembre(request)
  if (session instanceof Response) return session

  const { movieId } = await params
  const id = Number(movieId)
  if (!Number.isInteger(id)) return erreur(400, 'Identifiant de film invalide.')

  let corps: unknown
  try {
    corps = await request.json()
  } catch {
    return erreur(400, 'Requête illisible.')
  }
  const { status } = corps as Record<string, unknown>
  if (typeof status !== 'string' || !STATUTS.includes(status as MatchStatus)) {
    return erreur(400, 'Statut inconnu. Attendu : à voir, vu ou abandonné.')
  }

  const modifie = await setMatchStatus(getDb(), session.roomCode, id, status as MatchStatus)
  if (!modifie) return erreur(404, 'Ce film ne fait pas partie de vos matchs.')
  return ok({ movieId: id, status })
}
```

`app/api/matches/random/route.ts` :

```ts
import { erreur, ok } from '@/lib/api/respond'
import { exigerMembre } from '@/lib/api/guard'
import { getDb } from '@/lib/db/client'
import { randomMatch } from '@/lib/db/queries/matches'

export async function GET(request: Request): Promise<Response> {
  const session = exigerMembre(request)
  if (session instanceof Response) return session
  const tire = await randomMatch(getDb(), session.roomCode)
  if (!tire) return erreur(404, 'Aucun film à voir dans vos matchs pour l’instant.')
  return ok({ match: tire })
}
```

`app/api/filters/route.ts` :

```ts
import { erreur, ok } from '@/lib/api/respond'
import { exigerMembre } from '@/lib/api/guard'
import { getDb } from '@/lib/db/client'
import type { DeckFilters } from '@/lib/db/queries/deck'
import { getFilters, setFilters } from '@/lib/db/queries/filters'

export async function GET(request: Request): Promise<Response> {
  const session = exigerMembre(request)
  if (session instanceof Response) return session
  return ok({ filters: await getFilters(getDb(), session.memberId) })
}

export async function PUT(request: Request): Promise<Response> {
  const session = exigerMembre(request)
  if (session instanceof Response) return session

  let corps: unknown
  try {
    corps = await request.json()
  } catch {
    return erreur(400, 'Requête illisible.')
  }
  const f = corps as Partial<DeckFilters>

  if (!Array.isArray(f.genres) || !Array.isArray(f.providers)) {
    return erreur(400, 'Genres et plateformes doivent être des listes.')
  }
  if (typeof f.minRating !== 'number' || f.minRating < 0 || f.minRating > 10) {
    return erreur(400, 'La note minimale doit être comprise entre 0 et 10.')
  }
  if (f.yearFrom != null && f.yearTo != null && f.yearFrom > f.yearTo) {
    return erreur(400, 'La première année doit précéder la seconde.')
  }
  if (f.maxRuntime != null && (typeof f.maxRuntime !== 'number' || f.maxRuntime <= 0)) {
    return erreur(400, 'La durée maximale doit être positive.')
  }

  const filtres: DeckFilters = {
    genres: f.genres.map(String),
    yearFrom: f.yearFrom ?? null,
    yearTo: f.yearTo ?? null,
    minRating: f.minRating,
    maxRuntime: f.maxRuntime ?? null,
    providers: f.providers.map(String),
    includeTop200: f.includeTop200 !== false,
  }
  await setFilters(getDb(), session.memberId, filtres)
  return ok({ filters: filtres })
}
```

`app/api/cron/ingest/route.ts` :

```ts
import { erreur, ok } from '@/lib/api/respond'
import { getDb } from '@/lib/db/client'
import { fetchDetails } from '@/scripts/ingest'
import { TmdbClient } from '@/lib/tmdb'

export const maxDuration = 60

/**
 * Rafraîchissement partiel. Le script complet dure une vingtaine de minutes,
 * bien au-delà de la durée maximale d'une fonction Vercel : cette route ne
 * relance donc que la phase 2, sur les films dont le détail manque, et
 * s'interrompt d'elle-même. Une exécution hebdomadaire rattrape le catalogue
 * par petits morceaux ; le rafraîchissement complet reste `pnpm ingest`.
 */
export async function GET(request: Request): Promise<Response> {
  const attendu = process.env.CRON_SECRET
  const recu = request.headers.get('authorization')
  if (!attendu || recu !== `Bearer ${attendu}`) {
    return erreur(401, 'Accès refusé.')
  }

  const messages: string[] = []
  const traites = await fetchDetails(new TmdbClient(), getDb(), (m) => messages.push(m))
  return ok({ traites, journal: messages.slice(-5) })
}
```

- [ ] **Step 4: Lancer les tests**

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add app/api/matches app/api/filters app/api/cron tests/integration/api-matches.test.ts
git commit -m "Ajoute les routes des matchs, des filtres et du rafraîchissement"
```

---

## Task 11: Parcours complet par l'API

Le test qui compte : tout le produit, du salon vide au film tiré au sort, sans une ligne d'interface.

**Files:**
- Test: `tests/integration/parcours.test.ts`

**Interfaces:**
- Consumes: toutes les routes

- [ ] **Step 1: Écrire le test**

`tests/integration/parcours.test.ts` :

```ts
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { movies } from '@/lib/db/schema'
import { signSession } from '@/lib/session'
import { createTestDb, type TestDb } from '@/tests/helpers/db'

let db: TestDb

beforeAll(async () => {
  process.env.SESSION_SECRET = 'secret-de-test-suffisamment-long-pour-hmac'
  ;({ db } = await createTestDb())
  vi.doMock('@/lib/db/client', () => ({ getDb: () => db, closePool: async () => {} }))
  await db.insert(movies).values(
    Array.from({ length: 40 }, (_, i) => ({
      id: i + 1,
      title: `Film ${i + 1}`,
      genres: ['Action'],
      keywords: ['braquage'],
      posterPath: `/p${i + 1}.jpg`,
      releaseYear: 2000,
    })),
  )
})

const json = (body: unknown, cookie?: string) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body),
})

describe('parcours complet à trois', () => {
  it('du salon vide au film tiré au sort', async () => {
    const { POST: creer } = await import('@/app/api/rooms/route')
    const { POST: rejoindre } = await import('@/app/api/rooms/[code]/join/route')
    const { GET: paquet } = await import('@/app/api/deck/route')
    const { POST: balayer } = await import('@/app/api/swipes/route')
    const { GET: evenements } = await import('@/app/api/events/route')
    const { GET: listerMatchs } = await import('@/app/api/matches/route')
    const { PATCH: changerStatut } = await import('@/app/api/matches/[movieId]/route')
    const { GET: tirage } = await import('@/app/api/matches/random/route')

    // 1. Djo crée un salon de trois avec un seuil de deux
    const rCreation = await creer(
      new Request('http://x/api/rooms', json({ displayName: 'Djo', expectedMembers: 3, matchThreshold: 2 })),
    )
    const { room, member: djo } = await rCreation.json()
    expect(room.complete).toBe(false)

    // 2. Alice puis Chloé rejoignent
    const membres = [djo]
    for (const prenom of ['Alice', 'Chloé']) {
      const r = await rejoindre(
        new Request(`http://x/api/rooms/${room.code}/join`, json({ displayName: prenom })),
        { params: Promise.resolve({ code: room.code }) },
      )
      membres.push((await r.json()).member)
    }
    const cookies = membres.map(
      (m: { id: string }) => `sp_session=${signSession({ memberId: m.id, roomCode: room.code })}`,
    )

    // 3. Les trois voient le même paquet
    const paquets = []
    for (const c of cookies) {
      const r = await paquet(new Request('http://x/api/deck?limit=10', { headers: { cookie: c } }))
      paquets.push((await r.json()).cards.map((x: { id: number }) => x.id))
    }
    expect(paquets[0]).toEqual(paquets[1])
    expect(paquets[1]).toEqual(paquets[2])

    const premier = paquets[0][0]

    // 4. Djo aime : pas encore de match, le seuil de deux n'est pas atteint
    const r1 = await balayer(new Request('http://x/api/swipes', json({ movieId: premier, liked: true }, cookies[0])))
    expect((await r1.json()).match).toBeNull()

    // 5. Alice aime : le seuil est atteint, le match naît
    const r2 = await balayer(new Request('http://x/api/swipes', json({ movieId: premier, liked: true }, cookies[1])))
    expect((await r2.json()).match.movieId).toBe(premier)

    // 6. Chloé, qui n'a rien balayé, voit le match arriver par le sondage
    const rEv = await evenements(new Request('http://x/api/events?since=0', { headers: { cookie: cookies[2] } }))
    const ev = await rEv.json()
    expect(ev.matches).toHaveLength(1)
    expect(ev.room.complete).toBe(true)
    expect(ev.members).toHaveLength(3)

    // 7. Un second match, puis un est marqué vu
    const second = paquets[0][1]
    await balayer(new Request('http://x/api/swipes', json({ movieId: second, liked: true }, cookies[0])))
    await balayer(new Request('http://x/api/swipes', json({ movieId: second, liked: true }, cookies[2])))

    const rListe = await listerMatchs(new Request('http://x/api/matches', { headers: { cookie: cookies[0] } }))
    expect((await rListe.json()).matches).toHaveLength(2)

    await changerStatut(
      new Request(`http://x/api/matches/${second}`, {
        method: 'PATCH',
        headers: { cookie: cookies[0], 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'vu' }),
      }),
      { params: Promise.resolve({ movieId: String(second) }) },
    )

    // 8. Le tirage au sort ne propose que ce qu'il reste à voir
    for (let i = 0; i < 5; i++) {
      const r = await tirage(new Request('http://x/api/matches/random', { headers: { cookie: cookies[0] } }))
      expect((await r.json()).match.movie.id).toBe(premier)
    }
  })
})
```

- [ ] **Step 2: Lancer le test**

```bash
pnpm vitest run tests/integration/parcours.test.ts
```

Attendu : `1 passed`. Si une étape échoue, corriger la route concernée — pas le test.

- [ ] **Step 3: Lancer toute la suite**

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add tests/integration/parcours.test.ts
git commit -m "Ajoute le parcours complet par l'API"
```

---

## Fin du plan 2

À ce stade, l'application est fonctionnellement complète côté serveur : un salon de deux à huit personnes peut être créé, rejoint, filtré, balayé et matché, et les matchs peuvent être classés puis tirés au sort — le tout par appels HTTP, sans une ligne d'interface.

Le plan 3 couvrira les deux thèmes et leurs fonds, la pile de cartes et ses gestes, la feuille de détail, la feuille de filtres, la superposition de match, la page des matchs et sa roulette, l'installation sur téléphone, le test Playwright à deux navigateurs et le déploiement sur Vercel.
