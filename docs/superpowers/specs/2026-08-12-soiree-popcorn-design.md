# Soirée Popcorn — spécification de conception

**Date :** 12 août 2026
**Auteur :** Geoffroy (Djo) — conception assistée
**Statut :** validée, prête pour le plan d'implémentation

---

## 1. Intention

Une application web permettant à deux personnes — Djo et Alice — de choisir un film à regarder ensemble en balayant des cartes façon Tinder. Chacun balaye quand il veut ; dès qu'un même film est aimé par les deux, c'est un match.

Le produit répond à une question précise : **« on regarde quoi ce soir ? »**. Tout ce qui ne sert pas cette question est hors périmètre.

### Critères de réussite

1. Créer un salon et le faire rejoindre par une deuxième personne prend moins d'une minute, sans compte ni mot de passe.
2. Balayer est fluide et agréable au pouce sur téléphone, sans temps d'attente perceptible entre deux cartes.
3. Un match apparaît chez les deux personnes en moins de trois secondes lorsque l'application est ouverte des deux côtés.
4. Le catalogue ne propose que des films réellement regardables : abonnement Netflix, MyCanal ou Disney+ en France, plus les 200 plus grands films de l'histoire.
5. Après un mois d'usage, la page « Nos matchs » reste exploitable et permet de trancher en un geste.

---

## 2. Décisions structurantes

| Sujet | Décision |
|---|---|
| Identification | Code de salon partagé. Aucun compte, aucun mot de passe, aucun e-mail. |
| Rythme | Salon permanent. Balayage asynchrone, notification de match en direct si l'application est ouverte. |
| Catalogue | Netflix + MyCanal + Disney+ en abonnement (France), plus le top 200 all-time. |
| Filtres | Optionnels, personnels à chaque membre, modifiables à tout moment. |
| Tags | Genres TMDB en français, enrichis d'un dictionnaire d'environ 200 mots-clés traduits à la main. |
| Thèmes | Deux thèmes livrés — *Vidéo-club* et *Salle obscure* — sélectionnables, avec quatre fonds chacun. |
| Après le match | Page « Nos matchs » avec statuts, plus un tirage au sort « Décide pour nous ». |
| Stockage | Neon Postgres via l'intégration Vercel. Direct assuré par un sondage léger. |
| Catalogue en base | Copie complète locale, rafraîchie chaque semaine. |
| Accès mobile | Site installable (PWA) sans notifications push. |
| Hébergement | Vercel, dépôt privé `Djo1711/soiree-popcorn`. |

---

## 3. Architecture

### 3.1 Pile technique

- **Next.js 15** (App Router) + **TypeScript**, React 19
- **Tailwind CSS v4** pour la mise en forme, thèmes portés par des variables CSS
- **Motion** (ex-Framer Motion) pour les gestes de balayage, la pile de cartes et les transitions de match — une seule bibliothèque couvre l'ensemble
- **Neon Postgres**, accès via **Drizzle ORM** (typé, migrations lisibles, adapté au serverless)
- **Vitest** pour les tests unitaires et d'intégration, **Playwright** pour le bout en bout
- Déploiement **Vercel**, tâche planifiée **Vercel Cron** pour le rafraîchissement du catalogue

### 3.2 Découpage en unités

Chaque module a une responsabilité unique et une interface explicite. Aucun composant d'interface n'accède directement à la base ni à TMDB.

| Unité | Rôle | Dépend de |
|---|---|---|
| `lib/db/schema.ts` | Définition des tables Drizzle | — |
| `lib/db/queries.ts` | Toutes les requêtes SQL, une fonction par intention | schema |
| `lib/deck.ts` | Calcul de la clé de tri pondérée du paquet | — (pure) |
| `lib/match.ts` | Règle de détection de match à N membres | — (pure) |
| `lib/session.ts` | Signature, pose et lecture du cookie de session | — |
| `lib/roomcode.ts` | Génération et validation des codes de salon | — (pure) |
| `lib/tmdb.ts` | Client TMDB : pagination, backoff, typage des réponses | — |
| `lib/keywords.ts` | Traduction des mots-clés via le dictionnaire | `data/keywords-fr.json` (pure) |
| `themes/` | Variables CSS des deux thèmes et des fonds | — |
| `components/swipe/` | Pile, carte, contrôles, superposition de match | props uniquement |
| `components/matches/` | Grille, statuts, roulette | props uniquement |
| `app/api/` | Routes HTTP, validation d'entrée, appel des unités ci-dessus | lib/* |
| `scripts/ingest.ts` | Remplissage et rafraîchissement du catalogue | lib/tmdb, lib/db, lib/keywords |

Les fonctions pures (`deck`, `match`, `roomcode`, `keywords`) concentrent la logique qui doit être juste ; ce sont elles qui portent les tests unitaires. Les composants d'interface ne reçoivent que des props et ne savent rien du réseau.

---

## 4. Modèle de données

Huit tables, volontairement plates. Les listes (genres, mots-clés, plateformes) sont des tableaux Postgres indexés en GIN plutôt que des tables de jointure : le filtrage reste une seule requête et le modèle reste lisible.

```
rooms
  code             text        PK          -- 6 caractères
  created_at       timestamptz NOT NULL DEFAULT now()
  last_active_at   timestamptz NOT NULL DEFAULT now()

members
  id               uuid        PK DEFAULT gen_random_uuid()
  room_code        text        NOT NULL REFERENCES rooms(code) ON DELETE CASCADE
  display_name     text        NOT NULL
  created_at       timestamptz NOT NULL DEFAULT now()
  last_seen_at     timestamptz NOT NULL DEFAULT now()
  UNIQUE (room_code, display_name)

movies
  id                     integer     PK          -- identifiant TMDB
  title                  text        NOT NULL
  original_title         text
  overview               text                    -- synopsis français
  poster_path            text
  backdrop_path          text
  release_date           date
  release_year           integer
  runtime                integer                 -- minutes
  vote_average           real
  vote_count             integer
  popularity_percentile  double precision NOT NULL DEFAULT 0   -- 0 = obscur, 1 = très populaire
  genres                 text[]      NOT NULL DEFAULT '{}'     -- en français
  keywords               text[]      NOT NULL DEFAULT '{}'     -- en français, via dictionnaire
  providers              text[]      NOT NULL DEFAULT '{}'     -- 'netflix' | 'canal' | 'disney'
  in_top200              boolean     NOT NULL DEFAULT false
  director               text
  dominant_colors        text[]      NOT NULL DEFAULT '{}'     -- 2 couleurs hex, pour le fond « teinté »
  updated_at             timestamptz NOT NULL DEFAULT now()
  INDEX GIN (genres), GIN (keywords), GIN (providers)
  INDEX (release_year), (vote_average), (in_top200)

member_filters
  member_id        uuid        PK REFERENCES members(id) ON DELETE CASCADE
  genres           text[]      NOT NULL DEFAULT '{}'
  year_from        integer
  year_to          integer
  min_rating       real        NOT NULL DEFAULT 0
  max_runtime      integer
  providers        text[]      NOT NULL DEFAULT '{}'
  include_top200   boolean     NOT NULL DEFAULT true
  updated_at       timestamptz NOT NULL DEFAULT now()

swipes
  member_id        uuid        NOT NULL REFERENCES members(id) ON DELETE CASCADE
  movie_id         integer     NOT NULL REFERENCES movies(id) ON DELETE CASCADE
  liked            boolean     NOT NULL
  created_at       timestamptz NOT NULL DEFAULT now()
  PRIMARY KEY (member_id, movie_id)
  INDEX (member_id, created_at DESC)

matches
  id               bigserial   PK
  room_code        text        NOT NULL REFERENCES rooms(code) ON DELETE CASCADE
  movie_id         integer     NOT NULL REFERENCES movies(id) ON DELETE CASCADE
  status           text        NOT NULL DEFAULT 'a_voir'   -- a_voir | vu | abandonne
  created_at       timestamptz NOT NULL DEFAULT now()
  updated_at       timestamptz NOT NULL DEFAULT now()
  UNIQUE (room_code, movie_id)
  INDEX (room_code, id)

ingest_state
  key              text        PK
  value            jsonb       NOT NULL
  updated_at       timestamptz NOT NULL DEFAULT now()

rate_limits
  key              text        PK          -- 'join:<ip>'
  count            integer     NOT NULL DEFAULT 0
  window_start     timestamptz NOT NULL DEFAULT now()
```

Les deux clés primaires composites font le gros du travail de robustesse : `swipes(member_id, movie_id)` rend impossible le double comptage d'un balayage, et `matches(room_code, movie_id)` garantit qu'un like simultané des deux côtés ne crée qu'un seul match.

---

## 5. Ordre du paquet

L'ordre ne se stocke pas, il se calcule. Chaque film reçoit une clé de tri dérivée du code du salon et de son identifiant, pondérée par la popularité :

```
u        = md5(code_salon || ':' || id_film), 8 premiers caractères hexadécimaux
           convertis en entier, divisés par 0xFFFFFFFF          → u ∈ [0, 1)
cle_tri  = u × (1.30 − 0.60 × popularity_percentile)
```

Tri croissant sur `cle_tri`.

Un film très populaire voit sa clé multipliée par 0,70 et remonte donc dans le paquet ; un film obscur est multiplié par 1,30 et descend, sans jamais devenir inatteignable. Le résultat est un mélange pondéré : les premières cartes d'une session sont engageantes, la découverte reste présente.

Trois propriétés importantes en découlent :

- **Même salon, même ordre.** Djo et Alice parcourent le paquet dans la même suite et convergent vite vers des matchs.
- **Salon différent, ordre différent.** Un nouveau salon rebat les cartes.
- **Aucune persistance nécessaire.** L'ordre survit à un redéploiement et ne coûte aucune écriture.

### Requête du paquet

```sql
SELECT m.*
FROM movies m
WHERE (cardinality(:genres) = 0 OR m.genres && :genres)
  AND (:year_from   IS NULL OR m.release_year >= :year_from)
  AND (:year_to     IS NULL OR m.release_year <= :year_to)
  AND (:max_runtime IS NULL OR m.runtime <= :max_runtime)
  AND COALESCE(m.vote_average, 0) >= :min_rating
  AND (
        cardinality(:providers) = 0
        OR m.providers && :providers
        OR (:include_top200 AND m.in_top200)
      )
  AND NOT EXISTS (
        SELECT 1 FROM swipes s
        WHERE s.member_id = :me AND s.movie_id = m.id
      )
ORDER BY (('x' || substr(md5(:room || ':' || m.id::text), 1, 8))::bit(32)::bigint::double precision
          / 4294967295.0)
         * (1.30 - 0.60 * m.popularity_percentile)
LIMIT 20;
```

Le client précharge 20 cartes et recharge dès qu'il en reste 5. Les affiches des 3 cartes suivantes sont préchargées par le navigateur.

---

## 6. Règle de match

À l'enregistrement d'un balayage positif, dans une seule transaction :

```sql
INSERT INTO swipes (member_id, movie_id, liked)
VALUES (:me, :movie, true)
ON CONFLICT DO NOTHING;

INSERT INTO matches (room_code, movie_id)
SELECT :room, :movie
WHERE (SELECT count(*) FROM members WHERE room_code = :room) >= 2
  AND NOT EXISTS (
    SELECT 1 FROM members mem
    WHERE mem.room_code = :room
      AND NOT EXISTS (
        SELECT 1 FROM swipes s
        WHERE s.member_id = mem.id AND s.movie_id = :movie AND s.liked
      )
  )
ON CONFLICT (room_code, movie_id) DO NOTHING
RETURNING id;
```

La règle est écrite pour **N membres** : le match naît quand *tous* les membres du salon ont aimé le film. Le garde-fou `count(*) >= 2` empêche un membre seul de matcher avec lui-même. Généraliser à N ne coûte rien aujourd'hui et permettra d'inviter des amis sans réécriture.

Si la requête renvoie une ligne, la réponse HTTP contient le film et l'interface déclenche la superposition de match immédiatement.

### Sondage

`GET /api/events?since=<dernier_id_match>` renvoie les matchs d'identifiant supérieur, ainsi que la liste des membres du salon. Appelé toutes les 2 secondes **uniquement lorsque l'onglet est visible** (`document.visibilityState`), et immédiatement au retour au premier plan. La requête est indexée sur `(room_code, id)` et ne renvoie presque toujours aucune ligne : son coût est négligeable.

### Annulation (« rembobiner »)

Le bouton retour supprime le dernier balayage du membre et la carte revient en tête de pile.

**Un balayage ayant créé un match n'est pas annulable** : le bouton devient inactif après un match. Cela évite qu'un match déjà affiché chez l'autre personne disparaisse sans explication. L'annulation reste possible sur le balayage suivant.

---

## 7. Écrans et parcours

### 7.1 Entrée — `/`

Deux actions : *Créer un salon* et *Rejoindre*.

- **Créer** génère un code, demande un prénom, crée le membre, pose le cookie et affiche le lien à partager (`/j/<CODE>`) avec un bouton de copie.
- **Rejoindre** demande le code puis le prénom.
- `/j/<CODE>` court-circuite la saisie du code.

Un visiteur déjà porteur d'un cookie valide est redirigé vers le balayage.

### 7.2 Balayage — `/salon`

L'écran principal. Pile de trois cartes visibles (échelles 1 / 0,95 / 0,90, décalage vertical 0 / 10 / 20 px).

**Carte :** affiche en fond, titre, année, durée, note, jusqu'à quatre tags, et les deux premières lignes du synopsis avec un lien *lire*.

**Geste :** la carte suit le doigt, l'inclinaison vaut `deltaX / 18` degrés plafonnée à 15°. Un voile coloré (accent pour le like, rouge pour le rejet) apparaît proportionnellement à la distance. Le balayage est validé au-delà de 33 % de la largeur de l'écran ou d'une vélocité supérieure à 500 px/s ; en deçà, la carte revient en place avec un ressort.

**Sortie :** translation horizontale de 120 % avec rotation, 280 ms. La carte suivante passe de 0,95 à 1 en 200 ms.

**Contrôles sous la pile :** rembobiner, rejeter, aimer, détails. Tous les gestes sont doublés par un bouton — l'application est entièrement utilisable sans balayer.

**Barre supérieure :** code du salon, compteur de matchs (qui mène à la page matchs), accès aux filtres et aux réglages.

**Fin de paquet :** message explicite indiquant le nombre de films restants à zéro, avec un bouton pour desserrer les filtres et un rappel de ceux qui sont actifs.

### 7.3 Détail du film

Panneau qui monte depuis le bas : affiche, titre, titre original, date de sortie complète, durée, note et nombre de votes, réalisateur, tous les tags, plateformes de disponibilité, synopsis intégral. Fermeture par balayage vers le bas ou bouton. La position dans la pile est conservée.

### 7.4 Filtres — feuille modale

Genres (sélection multiple), période (deux curseurs d'année), note minimum, durée maximum, plateformes (Netflix / MyCanal / Disney+ / Top 200). Bouton de réinitialisation. Le nombre de films correspondants s'affiche en direct.

Les filtres sont **personnels**. Ils sont enregistrés côté serveur dans `member_filters` afin de survivre à un rechargement.

### 7.5 Nos matchs — `/salon/matchs`

Grille d'affiches avec pastille de statut. Filtrage par statut. Un appui ouvre le détail avec deux actions : **Vu** et **Abandonné**, plus un retour à **À voir**.

Un match ne se supprime jamais : les trois statuts suffisent. La vue par défaut n'affiche que les *à voir*, ce qui garde la page utilisable dans la durée sans perdre l'historique — et sans qu'un film écarté puisse resurgir après un rebalayage.

**Décide pour nous** tire un film au hasard parmi les matchs *à voir* : les affiches défilent verticalement en ralentissant pendant 2,2 secondes, puis la carte gagnante se pose. Bouton *relancer*.

### 7.6 Réglages — feuille modale

Thème (*Vidéo-club* / *Salle obscure*), fond (quatre par thème, aperçus en vignettes), prénom, code et lien du salon, quitter le salon.

*Quitter le salon* efface uniquement le cookie de cet appareil. Le membre, ses balayages et les matchs sont conservés : revenir avec le code et reprendre son prénom restitue tout l'historique. Rien ne se supprime jamais depuis l'interface.

Thème et fond sont **locaux à l'appareil** (`localStorage`) : ils n'affectent ni les balayages ni les matchs, donc rien ne justifie de les partager.

### 7.7 Superposition de match

L'écran s'assombrit, l'affiche arrive avec le titre, les deux prénoms et deux boutons : *Voir nos matchs* et *Continuer*. L'animation dépend du thème (§ 8.3).

Un rejet n'est **jamais** communiqué à l'autre personne.

---

## 8. Thèmes

### 8.1 Principe

Un seul jeu de variables CSS, redéfini par thème. Les composants ne connaissent que les variables ; ils ne contiennent aucune couleur en dur. Ajouter un troisième thème coûtera un fichier.

```
--sp-bg              fond principal
--sp-bg-2            fond secondaire (bandeaux, feuilles modales)
--sp-surface         surface de la carte
--sp-ink             texte principal
--sp-ink-soft        texte secondaire
--sp-accent          couleur d'action (bouton aimer, tag mis en avant)
--sp-accent-ink      texte posé sur l'accent
--sp-danger          couleur de rejet
--sp-radius-card     rayon de la carte
--sp-radius-pill     rayon des pastilles
--sp-font-display    police des titres
--sp-font-meta       police des métadonnées
--sp-grain-opacity   intensité du grain
--sp-shadow-card     ombre de la carte
```

### 8.2 Les deux thèmes

**Vidéo-club** — fond vert sapin `#0E2E2A`, carte carton crème `#F3E9D2`, accent tomate `#E4572E`, secondaire ambre `#F2A03D`. Titres en sans-serif grasse, métadonnées en police à chasse fixe. La carte est une jaquette de location : bandeau supérieur à typographie machine, tags en étiquettes légèrement pivotées.

**Salle obscure** — fond brun charbon `#14110E`, affiche plein cadre, accent laiton `#C9A227`, texte os `#EDE6DA`. Titres en serif de générique, métadonnées en petites capitales espacées. Grain de pellicule et léger vignettage.

### 8.3 Fonds

Quatre par thème, choisis dans les réglages :

| | Vidéo-club | Salle obscure |
|---|---|---|
| 1 | Uni | Uni |
| 2 | Grain léger | Grain de pellicule et vignettage |
| 3 | Motif d'étagère discret | Texture velours |
| 4 | Teinté par l'affiche | Teinté par l'affiche |

Le fond « teinté » extrait les couleurs dominantes de l'affiche courante (calculées à l'ingestion et stockées, pas à l'exécution) et les fait transiter à chaque carte.

### 8.4 Animations de match

- **Vidéo-club** : la carte s'éjecte vers le haut comme une cassette, un bandeau vient claquer dessus.
- **Salle obscure** : fondu au noir, puis ouverture d'un rideau sur l'affiche.

### 8.5 Accessibilité

Zones tactiles d'au moins 44 px. Contraste AA vérifié sur les deux thèmes, y compris les tags. Tout geste doublé par un bouton. Focus visible au clavier. Sous `prefers-reduced-motion`, toutes les animations se réduisent à des fondus de 120 ms — y compris le balayage, la roulette et la superposition de match.

---

## 9. API

Toutes les routes valident leur entrée et exigent un cookie de session valide, sauf création et adhésion à un salon.

| Route | Méthode | Rôle |
|---|---|---|
| `/api/rooms` | POST | Crée un salon, renvoie le code |
| `/api/rooms/[code]/join` | POST | `{ displayName }` → crée le membre, pose le cookie |
| `/api/rooms/[code]/members` | GET | Liste des prénoms (écran « qui es-tu ? ») |
| `/api/rooms/[code]/claim` | POST | `{ memberId }` → reprend une identité existante |
| `/api/deck` | GET | 20 cartes selon les filtres du membre |
| `/api/deck/count` | GET | Nombre de films restants pour un jeu de filtres donné (compteur en direct de la feuille de filtres) |
| `/api/swipes` | POST | `{ movieId, liked }` → `{ match? }` |
| `/api/swipes/last` | DELETE | Annule le dernier balayage |
| `/api/events` | GET | `?since=<id>` → nouveaux matchs et membres |
| `/api/matches` | GET | `?status=` → liste |
| `/api/matches/[movieId]` | PATCH | `{ status }` |
| `/api/matches/random` | GET | Un film au hasard parmi les *à voir* |
| `/api/filters` | GET / PUT | Filtres du membre |
| `/api/cron/ingest` | GET | Rafraîchissement hebdomadaire, protégé par `CRON_SECRET` |

### Session

Cookie `sp_session`, `HttpOnly`, `SameSite=Lax`, `Secure`, durée un an. Contenu `{ memberId, roomCode }` signé en HMAC-SHA256 avec `SESSION_SECRET`. Aucune donnée sensible n'y transite puisqu'il n'existe ni mot de passe ni e-mail.

---

## 10. Ingestion du catalogue

Script `scripts/ingest.ts`, exécuté une fois à la main puis chaque semaine par Vercel Cron.

1. **Résolution des plateformes.** Appel de `/watch/providers/movie?watch_region=FR` et sélection des entrées correspondant à Netflix, Disney+ et Canal. **Les identifiants ne sont jamais codés en dur** : ils sont résolus par nom à chaque exécution, car ils changent. Le filtre `with_watch_monetization_types=flatrate` écarte nativement Canal VOD, qui relève de la location.

   Valeurs vérifiées le 12 août 2026 (94 fournisseurs référencés en France) :

   | Identifiant | Nom | Retenu |
   |---|---|---|
   | 8 | Netflix | oui |
   | 1796 | Netflix Standard with Ads | oui |
   | 337 | Disney Plus | oui |
   | 381 | Canal+ | oui — c'est MyCanal |
   | 58 | Canal VOD | **non**, location |

   Les deux entrées Netflix se recoupent très largement ; elles sont collectées toutes les deux et le dédoublonnage par identifiant de film fait le tri, ce qui évite de parier sur une inclusion.

2. **Collecte par plateforme.** `/discover/movie` avec `watch_region=FR`, `with_watch_providers`, `with_watch_monetization_types=flatrate`, `language=fr-FR`.

   **La collecte se fait plateforme par plateforme, jamais en une seule requête combinée.** TMDB plafonne les résultats à 500 pages : une requête `8|1796|337|381` renvoie 9 971 films sur 499 pages, soit à un cheveu du plafond, et perdrait silencieusement des films dès que le catalogue grossit. Prises séparément, toutes les plateformes restent loin du plafond — Netflix 353 pages, Netflix avec pub 348, Disney+ 124, Canal+ 41. Si l'une d'elles venait à s'approcher de 500 pages, sa collecte serait découpée par tranches d'années.
3. **Top 200.** `/movie/top_rated?language=fr-FR`, pages 1 à 10, marqués `in_top200 = true`.
4. **Détail.** Pour chaque identifiant unique, `/movie/{id}?language=fr-FR&append_to_response=keywords,credits,watch/providers` → synopsis français, durée, genres français, mots-clés bruts, réalisateur (`credits.crew`, `job = Director`), plateformes.
5. **Tags.** Les mots-clés bruts passent par `data/keywords-fr.json` ; ceux qui n'y figurent pas sont ignorés plutôt qu'affichés en anglais. Quatre tags au maximum sont retenus, mots-clés d'abord, genres ensuite.
6. **Popularité.** `popularity_percentile` est calculé comme le rang de popularité rapporté à l'effectif total, une fois la collecte terminée.
7. **Couleurs.** Les deux couleurs dominantes de l'affiche sont extraites et stockées pour le fond « teinté ».
8. **Écriture.** Upsert par identifiant. Un film qui disparaît d'une plateforme voit son tableau `providers` mis à jour ; il reste en base s'il appartient au top 200.

**Robustesse.** Huit requêtes en parallèle, repli exponentiel sur les réponses 429, curseur de progression dans `ingest_state`. Le script est idempotent et reprenable : interrompu, il repart où il s'était arrêté.

**Ordre de grandeur, mesuré et non estimé.** Netflix 7 060 films, Netflix avec pub 6 945, Disney+ 2 479, Canal+ 813 ; 9 971 après application du OR par TMDB, auxquels s'ajoute le top 200. Après dédoublonnage, compter **environ 10 000 films** et une cinquantaine de mégaoctets. Le premier passage demande à peu près 870 requêtes de liste et 10 000 requêtes de détail, soit 15 à 30 minutes avec huit requêtes en parallèle.

### Construction du dictionnaire

`scripts/build-keywords.ts` recense les mots-clés bruts de tout le catalogue, les trie par fréquence et écrit les 300 premiers dans un fichier de travail. Les entrées pertinentes sont traduites à la main dans `data/keywords-fr.json` (`medieval` → « moyen-âge », `heist` → « braquage », `time travel` → « voyage dans le temps », `based on novel or book` → « tiré d'un livre ») ; les entrées non pertinentes pour un spectateur (`woman director`, `duringcreditsstinger`) sont écartées. Cible : environ 200 entrées utiles.

---

## 11. Gestion des erreurs

| Situation | Comportement |
|---|---|
| TMDB indisponible | L'application sert la copie locale et ne s'en aperçoit pas. Le script d'ingestion réessaie avec repli exponentiel. |
| Base endormie (Neon) | Premier appel d'environ 500 ms. Cartes squelettes pendant l'attente, jamais d'écran vide. |
| Réseau perdu pendant un balayage | Les balayages s'empilent dans le navigateur et sont rejoués au retour du réseau. L'interface est optimiste et n'attend jamais le serveur. |
| Double balayage (deux onglets) | `PRIMARY KEY (member_id, movie_id)` + `ON CONFLICT DO NOTHING`. |
| Deux likes simultanés | `UNIQUE (room_code, movie_id)` + `ON CONFLICT DO NOTHING` : un seul match. |
| Cookie effacé, nouveau téléphone | Écran « qui es-tu ? » listant les prénoms du salon ; l'identité est reprise avec son historique. |
| Code de salon inexistant | Message explicite, champ conservé. |
| Filtres sans résultat | Écran dédié rappelant les filtres actifs, avec un bouton pour les desserrer. |
| Affiche manquante | Substitut dessiné dans le thème courant, portant le titre. |
| Tentatives de codes en série | Limite par adresse IP via `rate_limits` : 10 tentatives d'adhésion par minute. |

### Limites acceptées

- **N'importe qui connaissant le code peut rejoindre le salon et reprendre une identité existante.** C'est le prix de l'absence de mot de passe, et c'est un choix assumé pour un salon privé à deux. Le code offre environ un milliard de combinaisons et la limitation de débit rend le balayage impraticable.
- **La disponibilité streaming de TMDB pour la France est imparfaite.** Un film peut être annoncé sur une plateforme dont il vient de sortir. Le rafraîchissement hebdomadaire limite la dérive sans l'annuler.

---

## 12. Tests

### Unitaires (Vitest)

- `lib/deck.ts` — déterminisme : deux membres du même salon obtiennent exactement la même suite ; deux salons obtiennent des suites différentes ; la pondération remonte effectivement les films populaires sur un échantillon.
- `lib/match.ts` — match à 2 et à 3 membres ; absence de match si un membre n'a pas liké ; absence de match à un seul membre.
- `lib/roomcode.ts` — aucun caractère ambigu (`O`, `0`, `I`, `1`) produit ; validation rejetant les codes malformés.
- `lib/keywords.ts` — traduction, ignorance des inconnus, plafond de quatre tags, priorité aux mots-clés sur les genres.
- `lib/session.ts` — un cookie altéré est rejeté.

### Intégration (Vitest sur base jetable)

Créer un salon, faire rejoindre deux membres, balayer des deux côtés, vérifier qu'un match naît **une seule fois**. Vérifier l'annulation, son refus après un match, les transitions de statut, et l'exclusion des films déjà balayés par la requête de paquet.

### Bout en bout (Playwright)

Le test qui compte : deux contextes de navigateur, deux membres du même salon, le même film aimé des deux côtés, et la superposition de match qui apparaît **chez les deux**. Ajouter un parcours de bout en bout : créer, rejoindre, filtrer, balayer, matcher, marquer *vu*, tirer au sort.

Les animations ne sont pas testées.

---

## 13. Arborescence

```
app/
  page.tsx                      accueil (créer / rejoindre)
  j/[code]/page.tsx             adhésion par lien
  salon/page.tsx                balayage
  salon/matchs/page.tsx         nos matchs
  api/…                         routes du § 9
components/
  swipe/CardStack.tsx  MovieCard.tsx  SwipeControls.tsx  MatchOverlay.tsx  MovieSheet.tsx
  filters/FilterSheet.tsx
  matches/MatchGrid.tsx  RouletteDialog.tsx
  settings/SettingsSheet.tsx
  ui/…
lib/
  db/schema.ts  db/queries.ts
  deck.ts  match.ts  session.ts  roomcode.ts  tmdb.ts  keywords.ts
themes/
  videoclub.css  salle-obscure.css  backgrounds.ts  tokens.css
scripts/
  ingest.ts  build-keywords.ts
data/
  keywords-fr.json
tests/
  unit/  integration/  e2e/
```

---

## 14. Variables d'environnement

| Variable | Origine |
|---|---|
| `TMDB_API_KEY` | Créée sur themoviedb.org, section API. Serveur uniquement. |
| `DATABASE_URL` | Injectée par l'intégration Neon de Vercel. |
| `SESSION_SECRET` | Générée aléatoirement, 32 octets. |
| `CRON_SECRET` | Protège `/api/cron/ingest`. |

---

## 15. Hors périmètre

Films uniquement, pas de séries. Aucun compte, mot de passe ni e-mail. Aucune notification push. Pas de chat, pas de recommandations personnalisées, pas de notes après visionnage, pas de tournoi d'élimination entre matchs.

---

## 16. Points à confirmer à l'implémentation

1. ~~**Identifiants des plateformes MyCanal.**~~ **Levé le 12 août 2026** par appel réel à l'API : MyCanal correspond à Canal+ (381), Canal VOD (58) est bien une entrée distincte et écartée. Volumes mesurés et plafond de pagination documentés au § 10.
2. **Fréquence du cron sur le plan Vercel gratuit.** Une planification hebdomadaire devrait passer, le plan gratuit limitant à des exécutions quotidiennes ou moins fréquentes. À confirmer au déploiement ; à défaut, le rafraîchissement se fera par une commande lancée à la main, ce qui reste acceptable pour un catalogue qui bouge lentement.
