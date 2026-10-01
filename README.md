# 🍿 Soirée Popcorn

Choisir un film à plusieurs sans y passer la soirée : chacun balaye des cartes façon Tinder, et dès qu'assez de monde aime le même film, c'est un match.

**🌐 [soiree-popcorn.vercel.app](https://soiree-popcorn.vercel.app)**

## Fonctionnement

1. **Créer un salon** pour 2 à 8 personnes : aucun compte, juste un code à 6 caractères à partager
2. **Chacun balaye** de son côté, avec ses propres filtres (genres, durée, année, plateformes…)
3. **Match !** quand le seuil choisi est atteint (unanimité par défaut, réglable)
4. **« Nos matchs »** : la liste des films retenus, avec un tirage au sort pour départager

Catalogue : environ 10 000 films disponibles en France sur Netflix, MyCanal et Disney+, plus le top 200 de tous les temps, avec synopsis et tags en français. Deux thèmes visuels : *Vidéo-club* et *Salle obscure*.

## Stack

- **Next.js 15** (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Motion
- **Neon Postgres** + Drizzle ORM (migrations versionnées)
- **TMDB** pour le catalogue, ingéré par un script reprenable
- **Tests** : Vitest (unitaires + intégration sur PGlite, un Postgres en mémoire) et Playwright (parcours de bout en bout)
- Déployé sur **Vercel**

## Lancer en local

```bash
pnpm install
cp .env.example .env.local   # renseigner DATABASE_URL, TMDB, etc.
pnpm db:migrate
pnpm ingest                  # remplit le catalogue depuis TMDB
pnpm dev
```

```bash
pnpm test       # tests unitaires et d'intégration
pnpm test:e2e   # tests Playwright
```

La conception détaillée se trouve dans [`docs/superpowers/specs`](docs/superpowers/specs) et l'état du projet dans [`HANDOVER.md`](HANDOVER.md).
