# Soirée Popcorn — état des lieux et reprise

**Dernière mise à jour :** 14 août 2026
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
3. `docs/superpowers/plans/2026-08-14-soiree-popcorn-2-session-et-api.md` — plan 2, **en cours**

---

## 2. Où en est le travail

### Terminé — plan 1 : fondations et catalogue

Dix tâches, toutes relues, plus une revue finale de branche. Fusionné dans `main`.

- **Quatre modules de logique pure**, chacun testé isolément : `lib/roomcode.ts` (codes de salon), `lib/deck.ts` (ordre du paquet), `lib/match.ts` (règle de match), `lib/keywords.ts` (traduction des tags).
- **Sept tables Postgres** avec migrations Drizzle, contraintes `CHECK` et index GIN. Les tests d'intégration tournent sur **PGlite**, un Postgres compilé en WebAssembly, en mémoire — ni Docker ni base distante.
- **Client TMDB** avec repli exponentiel plafonné, reprise sur coupure réseau, délai par tentative, et résolution des plateformes par nom à l'exécution.
- **Ingestion en trois phases reprenables**, dont la progression est portée par la base et non par un fichier d'état.

**La base Neon est remplie** : 10 131 films, avec affiche (99,3 %), synopsis français (84,4 %), année (100 %), durée (98,7 %), genres (98,7 %) et tags français.

### En cours — plan 2 : session et API

Onze tâches. **La tâche 1 est faite et relue.** Elle soldait trois dettes que la revue du plan 1 avait reportées : une connexion qui levait à l'import et aurait cassé `next build`, un garde dépendant de la version de Node, et `roomcode.ts` qui embarquait `node:crypto` dans un module dont le navigateur aura besoin.

**Branche courante :** `plan-2-session-et-api`, à jour sur GitHub.
**Tests :** 89, tous verts.

### À faire

**Plan 2, tâches 2 à 11** — tout est écrit, avec le code dans le document :

2. Cookie de session signé en HMAC
3. Limitation de débit atomique
4. Requêtes de salon
5. Requêtes du paquet de cartes
6. Balayage, création de match, annulation
7. Matchs, événements et filtres
8. Socle des routes et routes de salon
9. Routes du paquet, du balayage et des événements
10. Routes des matchs, des filtres et du cron
11. Parcours complet par l'API

**Plan 3 — pas encore écrit.** Il couvrira : les deux thèmes et leurs variables CSS, la pile de cartes et ses gestes, la feuille de détail, la feuille de filtres, la superposition de match, la page des matchs et sa roulette, l'installation sur téléphone, le test Playwright à deux navigateurs, et le déploiement Vercel.

---

## 3. Ce qu'il faut pour redémarrer sur une autre machine

```bash
git clone git@github.com:Djo1711/soiree-popcorn.git
cd soiree-popcorn
pnpm install
cp .env.example .env.local   # puis remplir, voir ci-dessous
pnpm test                    # doit afficher 89 passed
```

### Les secrets, qui ne sont pas dans le dépôt

`.env.local` est ignoré par git — **il disparaît avec la machine**. Aucun secret n'a jamais été commité, ni dans les fichiers suivis ni dans l'historique (vérifié). Il faudra le reconstituer :

| Variable | Où la retrouver |
|---|---|
| `TMDB_READ_TOKEN` | themoviedb.org → Paramètres → API → « jeton d'accès en lecture » (auth v4). C'est le seul identifiant TMDB utilisé. |
| `DATABASE_URL` | Tableau de bord Neon → projet `soiree-popcorn` → chaîne de connexion. La base et ses 10 131 films sont intacts, ils ne dépendent pas de la machine. |
| `SESSION_SECRET` | À régénérer : `openssl rand -hex 32`. La changer déconnecte les sessions existantes, sans autre conséquence à ce stade. |
| `CRON_SECRET` | À régénérer de la même façon. |

**Note pour Vercel :** au déploiement, ces quatre variables devront être déclarées dans les réglages du projet. L'intégration Neon peut injecter `DATABASE_URL` toute seule.

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
| `pnpm build` comme preuve | Ne prouve rien tant qu'aucune route n'importe `lib/db/client.ts`. Devient une vraie garantie à la tâche 8. |
| Sort de `lib/match.ts` | La règle de production sera le SQL. Le plan 2 prévoit une table de huit cas vérifiant que les deux sont d'accord, faute de quoi la fonction deviendrait décorative. |
| Couverture des tags | 41,5 % sur tout le catalogue, 89,4 % sur les 2 000 films les plus populaires. La cible initiale de 60 % était inatteignable : une partie de la longue traîne n'a aucun mot-clé chez TMDB. |
| Forme du cron | Le script d'ingestion dure vingt minutes, bien au-delà de la durée maximale d'une fonction Vercel. La route de cron ne relance qu'un lot borné. |

---

## 7. Comment reprendre — méthode et extensions

Le projet a été mené avec le plugin **superpowers**, et la méthode a réellement payé : les relectures ont attrapé un bug qui aurait pourri le catalogue en quelques mois, un test qui passait même en supprimant le code qu'il testait, et une preuve de discrimination qui ne prouvait rien.

### Enchaînement des compétences

| Étape | Compétence | Quand |
|---|---|---|
| Cadrage | `superpowers:brainstorming` | Avant toute création. C'est elle qui a produit la spec. |
| Rédaction du plan | `superpowers:writing-plans` | Pour écrire le plan 3, qui n'existe pas encore. |
| Exécution | `superpowers:subagent-driven-development` | Un sous-agent neuf par tâche, relecture entre chaque. C'est la méthode utilisée pour les plans 1 et 2. |
| Revue de fin de branche | `superpowers:requesting-code-review` | Sur le modèle le plus capable. C'est elle qui a trouvé le bug des plateformes. |
| Clôture | `superpowers:finishing-a-development-branch` | Fusion, nettoyage. |
| Débogage | `superpowers:systematic-debugging` | Devant tout comportement inattendu, avant de proposer un correctif. |

### Pour le plan 3, qui est de l'interface

| Compétence | Ce qu'elle apporte |
|---|---|
| `ui-ux-pro-max` | Base de styles, palettes, appariements de polices et piles techniques. Utile pour concrétiser les thèmes *Vidéo-club* et *Salle obscure*. |
| `ui-styling` | Composants shadcn/ui, Tailwind, accessibilité, thèmes clair/sombre. |
| `design-system` | Architecture des jetons de design — pertinent, puisque les deux thèmes reposent sur un seul jeu de variables CSS. |

### Commandes ponctuelles

- `/code-review` — relit le diff courant, à n'importe quel moment
- `/security-review` — revue de sécurité des changements de la branche
- `/simplify` — nettoyage qualité sans chasse aux bugs
- `/run` — lance l'application pour voir un changement en vrai

### Reprise concrète

Ouvrir le projet et dire, en substance : *« Reprends l'exécution du plan 2 à la tâche 2, avec subagent-driven-development. »* Le fichier `.superpowers/sdd/progress.md` contient le journal détaillé de tout ce qui a été fait, tâche par tâche, avec les constats de relecture — mais **il est ignoré par git**, donc il disparaît avec la machine. Le présent document et l'historique des commits en sont la trace durable.

---

## 8. Chiffres

| | |
|---|---|
| Commits | 28 |
| Tests | 89, tous verts |
| Films en base | 10 131 |
| Tables | 7 |
| Tâches faites | 11 sur 22 planifiées (plans 1 et 2), plan 3 à écrire |
