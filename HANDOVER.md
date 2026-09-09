# Soirée Popcorn — état des lieux et reprise

**Dernière mise à jour :** 9 septembre 2026
**Dépôt :** https://github.com/Djo1711/soiree-popcorn (privé)
**Auteur du projet :** Geoffroy (Djo)

Ce document existe pour qu'on puisse reprendre le projet sur une autre machine, ou après plusieurs mois, sans rien reconstituer de mémoire.

---

## 1. Ce que le produit est censé faire

Une application web où **2 à 8 personnes** choisissent un film ensemble en balayant des cartes façon Tinder. Chacun balaye quand il veut. Dès qu'assez de personnes ont aimé le même film, c'est un match.

Les décisions structurantes, toutes déjà prises et justifiées dans la spec :

| Sujet | Décision |
|---|---|
| Identification | Code de salon à 6 caractères. Aucun compte, aucun mot de passe, aucun e-mail. |
| Taille du salon | 2 à 8 personnes, effectif annoncé à la création. Aucun match tant que tout le monde n'a pas rejoint. |
| Seuil de match | Réglable de 2 à l'effectif, unanimité par défaut. L'unanimité à huit ne survient que dans 0,07 % des cas, d'où le réglage. |
| Catalogue | Netflix + MyCanal + Disney+ en abonnement (France), plus le top 200 all-time. |
| Filtres | Personnels à chaque membre, pas partagés. |
| Thèmes | Deux au choix — *Vidéo-club* et *Salle obscure* — avec quatre fonds chacun. |
| Après le match | Page « Nos matchs » à trois statuts, plus un tirage au sort. |
| Hébergement | Vercel, base Neon Postgres. |

**Documents de référence, à lire dans cet ordre :**

1. `docs/superpowers/specs/2026-08-12-soiree-popcorn-design.md` — la spec, l'intention et les arbitrages
2. `docs/superpowers/plans/2026-08-12-soiree-popcorn-1-fondations-catalogue.md` — plan 1, **terminé**
3. `docs/superpowers/plans/2026-08-14-soiree-popcorn-2-session-et-api.md` — plan 2, **terminé**
4. `docs/superpowers/plans/2026-08-17-soiree-popcorn-3-interface-et-deploiement.md` — plan 3, **terminé**

---

## 2. Où en est le travail

### Terminé — plan 1 : fondations et catalogue

Dix tâches, toutes relues, plus une revue finale de branche. Fusionné dans `main`.

- **Quatre modules de logique pure**, chacun testé isolément : `lib/roomcode.ts` (codes de salon), `lib/deck.ts` (ordre du paquet), `lib/match.ts` (règle de match), `lib/keywords.ts` (traduction des tags).
- **Sept tables Postgres** avec migrations Drizzle, contraintes `CHECK` et index GIN. Les tests d'intégration tournent sur **PGlite**, un Postgres compilé en WebAssembly, en mémoire — ni Docker ni base distante.
- **Client TMDB** avec repli exponentiel plafonné, reprise sur coupure réseau, délai par tentative, et résolution des plateformes par nom à l'exécution.
- **Ingestion en trois phases reprenables**, dont la progression est portée par la base et non par un fichier d'état.

**La base Neon est remplie** : 10 131 films, avec affiche (99,3 %), synopsis français (84,4 %), année (100 %), durée (98,7 %), genres (98,7 %) et tags français.

### Terminé — plan 2 : session et API

Onze tâches, toutes relues, plus une revue finale de branche (bug critique trouvé et corrigé : atomicité de `joinRoom`, voir §5). Fusionné dans `main` via PR.

- Cookie de session signé en HMAC, limitation de débit atomique.
- Toutes les requêtes de salon, paquet, balayage/match/annulation, matchs/événements/filtres.
- Les 15 routes API (`app/api/**/route.ts`) et le parcours complet vérifié côté API (`tests/integration/parcours.test.ts`).

### Terminé — plan 3 : interface et déploiement

Dix-sept tâches, toutes relues, plus une revue finale de branche et deux rounds de correction (voir §6 pour les deux points laissés volontairement ouverts). Sur la branche `plan-3-interface-et-deploiement`, prête à être fusionnée dans `main` (ou déjà fusionnée — voir l'historique git si ce document n'a pas été mis à jour depuis).

- Deux thèmes (*Vidéo-club*, *Salle obscure*) sur 16 variables CSS `--sp-*`, quatre fonds chacun.
- Écrans : accueil (création/adhésion), salle d'attente, balayage de cartes (geste + boutons), feuille de détail, feuille de filtres, superposition de match, page « Nos matchs » à trois statuts, roulette « Décide pour nous », réglages (thème, fond, code, lien, quitter le salon).
- PWA installable (manifeste, icône), cron de déploiement Vercel.
- Test Playwright à deux navigateurs (`tests/e2e/`), contre une vraie base Postgres — c'est la seule partie de la suite qui a besoin d'un `DATABASE_URL` réel plutôt que PGlite.

**Tests :** 227, tous verts (unitaires + intégration sur PGlite) + 2 tests e2e (Playwright, contre une vraie base).

### À faire — rien de planifié

Les trois plans prévus sont terminés. Le §6 liste deux trous du plan 3 découverts en revue finale (prénom absent des réglages, écran de récupération d'identité) qui n'ont jamais été assignés à une tâche — candidats naturels pour un éventuel « plan 4 » si le besoin s'en fait sentir, mais rien n'est bloquant pour un usage normal.

---

## 3. Ce qu'il faut pour redémarrer sur une autre machine

```bash
git clone git@github.com:Djo1711/soiree-popcorn.git
cd soiree-popcorn
pnpm install
cp .env.example .env.local   # puis remplir, voir ci-dessous
pnpm test                    # doit afficher 227 passed
```

### Les secrets, qui ne sont pas dans le dépôt

`.env.local` est ignoré par git — **il disparaît avec la machine**. Aucun secret n'a jamais été commité, ni dans les fichiers suivis ni dans l'historique (vérifié à plusieurs reprises, y compris en revue finale de branche). Il faudra le reconstituer sur toute nouvelle machine :

| Variable | Où la retrouver |
|---|---|
| `TMDB_READ_TOKEN` | themoviedb.org → Paramètres → API → « jeton d'accès en lecture » (auth v4). C'est le seul identifiant TMDB utilisé. Compte personnel de Geoffroy, pas lié à un employeur. |
| `DATABASE_URL` | Tableau de bord Neon (console.neon.tech, compte personnel « Geoffroy », projet **SoireePopcorn**, région Frankfurt) → bouton « Connect » → copier la chaîne (de préférence la version *pooled*). La base et ses 10 131 films sont intacts, **indépendants de la machine utilisée** — confirmé le 9 septembre 2026 après un changement de machine (Mac professionnel quitté → Windows personnel) : reconnexion immédiate, aucune perte. |
| `SESSION_SECRET` | À régénérer : `openssl rand -hex 32`. La changer déconnecte les sessions existantes, sans autre conséquence. |
| `CRON_SECRET` | À régénérer de la même façon. |

**Note pour Vercel :** au déploiement, ces quatre variables devront être déclarées dans les réglages du projet. Le projet n'est **pas encore lié à Vercel** à ce jour (9 septembre 2026) — `vercel.json` existe (cron hebdomadaire d'ingestion) mais aucun déploiement n'a été fait. L'intégration Neon peut injecter `DATABASE_URL` toute seule une fois le projet importé sur Vercel.

---

## 4. Commandes utiles

```bash
pnpm dev                # serveur de développement
pnpm test               # toute la suite (unitaire + intégration sur PGlite)
pnpm exec tsc --noEmit  # vérification de types
pnpm build              # compilation Next.js
pnpm db:generate        # génère une migration après modification du schéma
pnpm db:migrate         # applique les migrations à Neon
pnpm ingest             # ré-ingère le catalogue TMDB — 15 à 20 minutes
pnpm keywords           # recense les mots-clés à traduire
```

---

## 5. Choses à savoir avant de toucher au code

Ce sont les pièges qui ont réellement coûté du temps, ou que les relectures ont attrapés de justesse.

**La formule de tri du paquet existe en TypeScript et en SQL.** Elle est écrite **une seule fois** en SQL, dans `lib/deck-sql.ts`, et le test d'intégration importe ce fragment plutôt que de le recopier. Ne jamais réécrire la formule dans une requête : c'est ce qui garantit que deux personnes d'un même salon voient les films dans le même ordre. Un test compare les deux implémentations sur 300 films.

**Le hash prend 7 caractères hexadécimaux, pas 8.** 28 bits n'activent jamais le bit de signe d'un entier Postgres. Sur 32 bits, la conversion produirait des valeurs négatives pour la moitié des films et inverserait leur ordre.

**Le match naît d'une seule instruction SQL.** L'atomicité de « deux personnes aiment au même instant → exactement un match » tient entièrement dans cette instruction et dans la contrainte d'unicité. Ne pas la découper en lecture puis écriture.

**Les scripts chargent `.env.local` via l'option native `--env-file` de Node.** Ne pas revenir à `dotenv/config` : il lit `.env` et non `.env.local`, et son effet de bord s'exécute après les imports qu'il est censé servir.

**TMDB code « inconnu » par un zéro** sur la durée et la note. Un filtre « moins de 90 minutes » ne doit pas faire remonter les films de durée inconnue.

**La collecte TMDB se fait plateforme par plateforme.** Une requête combinée renvoie 499 pages pour un plafond de 500 : elle perdrait des films en silence dès que le catalogue grossit.

**Les identifiants de plateformes ne sont jamais codés en dur.** Ils sont résolus par nom à chaque exécution. Valeurs constatées le 12 août 2026 : Netflix 8 et 1796, Disney+ 337, Canal+ 381 (c'est MyCanal), et Canal VOD 58 qui est **exclu** car c'est de la location.

---

## 6. Points laissés ouverts

| Sujet | État |
|---|---|
| Garde de portabilité de `roomcode.ts` | C'est aujourd'hui une expression régulière sur le texte du fichier. Elle ne verrait pas une dépendance Node arrivant indirectement. Un vrai contrôle demanderait `esbuild` en dépendance de développement explicite — il n'est présent qu'en transitif. **Décision à prendre.** |
| Sort de `lib/match.ts` | La règle de production est le SQL (`shouldCreateMatch`) ; `lib/match.ts` reste la version TypeScript, vérifiée d'accord avec le SQL par une table de cas croisés en test. |
| Couverture des tags | 41,5 % sur tout le catalogue, 89,4 % sur les 2 000 films les plus populaires. La cible initiale de 60 % était inatteignable : une partie de la longue traîne n'a aucun mot-clé chez TMDB. |
| Forme du cron | Le script d'ingestion dure vingt minutes, bien au-delà de la durée maximale d'une fonction Vercel. La route de cron ne relance qu'un lot borné. |
| **Prénom absent des réglages** (trou du plan 3, trouvé en revue finale) | La §7.6 de la spec et le plan lui-même demandent d'afficher le prénom dans `SettingsSheet`, mais aucune tâche n'exposait « qui suis-je » côté client : `/api/events` ne renvoie pas l'identité du membre courant, `MemberSummary` ne porte que `id`/`displayName` sans distinction. Pas bloquant (le prénom sert surtout à se relire soi-même), mais à corriger si un « plan 4 » voit le jour : il faudrait une nouvelle donnée serveur avant de pouvoir l'afficher. |
| **Écran de récupération d'identité absent** (trou du plan 3, trouvé en revue finale) | La §11 de la spec prévoit qu'un membre qui a perdu son cookie (nouveau téléphone) puisse choisir son prénom dans une liste et reprendre son historique. Les routes serveur existent et sont testées (`membresDuSalon()`, `reprendreIdentite()` dans `lib/api-client.ts`), mais **aucun écran ne les appelle** — ce sont deux exports morts. Conséquence concrète : si le salon est déjà complet (cas normal, 2/2), la personne qui a perdu son cookie ne peut plus rejoindre son propre salon depuis l'interface. Aucune tâche du plan 3 ne couvrait cet écran ; candidat naturel pour un « plan 4 ». |
| File d'attente de balayages hors-ligne absente (§11, trou du plan 3) | La spec prévoit que les balayages faits sans réseau s'empilent et soient rejoués au retour. L'implémentation actuelle est optimiste (la carte part avant la réponse serveur) mais un balayage perdu en cours de route est perdu — la gestion d'erreur ajoutée en revue finale évite au moins de casser l'état local (§5), sans rejouer la file. |

---

## 7. Comment reprendre — méthode et extensions

Le projet a été mené avec le plugin **superpowers**, et la méthode a réellement payé : les relectures ont attrapé un bug qui aurait pourri le catalogue en quelques mois, un test qui passait même en supprimant le code qu'il testait, et une preuve de discrimination qui ne prouvait rien.

### Enchaînement des compétences

| Étape | Compétence | Quand |
|---|---|---|
| Cadrage | `superpowers:brainstorming` | Avant toute création. C'est elle qui a produit la spec. |
| Rédaction du plan | `superpowers:writing-plans` | Utilisée pour écrire les plans 2 et 3, avec relecture obligatoire avant sauvegarde. |
| Exécution | `superpowers:subagent-driven-development` | Un sous-agent neuf par tâche, relecture entre chaque. C'est la méthode utilisée pour les trois plans. |
| Revue de fin de branche | `superpowers:requesting-code-review` | Sur le modèle le plus capable. C'est elle qui a trouvé le bug des plateformes (plan 1), l'atomicité de `joinRoom` (plan 2), et le contraste illisible + l'historique de match rejoué (plan 3) — trois bugs qu'aucune revue tâche par tâche ne pouvait voir. |
| Clôture | `superpowers:finishing-a-development-branch` | Fusion, nettoyage. |
| Débogage | `superpowers:systematic-debugging` | Devant tout comportement inattendu, avant de proposer un correctif. |

### Compétences utiles pour un éventuel plan 4 (interface)

| Compétence | Ce qu'elle apporte |
|---|---|
| `ui-ux-pro-max` | Base de styles, palettes, appariements de polices et piles techniques. |
| `ui-styling` | Composants shadcn/ui, Tailwind, accessibilité, thèmes clair/sombre. |
| `design-system` | Architecture des jetons de design — pertinent, puisque les deux thèmes reposent sur un seul jeu de variables CSS (16 jetons `--sp-*` au terme du plan 3). |

### Commandes ponctuelles

- `/code-review` — relit le diff courant, à n'importe quel moment
- `/security-review` — revue de sécurité des changements de la branche
- `/simplify` — nettoyage qualité sans chasse aux bugs
- `/run` — lance l'application pour voir un changement en vrai

### Reprise concrète

Les trois plans écrits sont terminés. Pour repartir, deux pistes naturelles : déployer sur Vercel (rien n'est encore lié, voir §3), ou écrire un plan 4 pour les deux trous du plan 3 listés au §6 (prénom dans les réglages, écran de récupération d'identité). Dans les deux cas, ouvrir le projet et dire, en substance : *« Regarde le HANDOVER, qu'est-ce qu'on fait ensuite ? »* Le fichier `.superpowers/sdd/<plan>/progress.md` de chaque plan contient le journal détaillé de tout ce qui a été fait, tâche par tâche, avec les constats de relecture — mais **il est ignoré par git**, donc il disparaît avec la machine. Le présent document et l'historique des commits en sont la trace durable.

---

## 8. Chiffres

| | |
|---|---|
| Commits | ~74 (main + les trois branches de plan) |
| Tests | 227 (unitaires + intégration sur PGlite) + 2 e2e (Playwright, vraie base) |
| Films en base | 10 131 |
| Tables | 7 |
| Tâches faites | 38 sur 38 planifiées (plans 1, 2 et 3, tous terminés) |
