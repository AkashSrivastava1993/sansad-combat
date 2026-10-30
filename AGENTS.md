# Sansad Combat: agent instructions

Browser fighting game (Phaser 3 + three.js + TypeScript, Vite, deployed on Vercel). 9 data-driven fighters, 3 arenas, CPU and local 2P, desktop and mobile touch.

## Commands
- `npm run dev`: Vite dev server on :5173
- `npm run typecheck`: `tsc --noEmit` and `tsc -p src/core --noEmit` (the second one enforces the core boundary)
- `npm run build`: typecheck plus `vite build`; must pass before any commit
- Use `./node_modules/.bin/tsc`, not `npx tsc` (npx installs the wrong package)

## Architecture rules
1. `src/core` is the game simulation. No DOM, Phaser or three imports; `tsc -p src/core` fails otherwise. `Match.step(rawMs)` returns an immutable `MatchState`.
2. Everything outside core only reads `MatchState` (renderers, HUD, FX, audio). Never mutate sim state from a renderer.
3. Gameplay numbers live in `src/core/config.ts`; presentation constants live in `src/config.ts`.
4. Fighters are JSON in `src/characters/data/*.json`, validated by `core/characters/validate.ts` against `fighter.schema.json`. Adding a fighter is a data change plus art, not a code change.
5. Renderers implement `FightRenderer` (`src/renderers/FightRenderer.ts`): `Stage3D` (three, default) and `PhaserRenderer` (2D fallback, used without WebGL or with `?renderer=phaser`).
6. Fighter visual priority in Stage3D: GLB `model` > procedural `figure` > SVG `CutoutFighter`.
7. Special-move effects are `projectile` specials with an `fx` id, mapped in `src/ui/specials/index.ts`. Effects track projectiles by `id` and read the last state via `finalState`.
8. All user-visible strings and palettes for arenas live in `src/content/texts.json`.
9. Hashed or immutable-cached assets (`/assets/*`, 1 year in `vercel.json`): rename a changed file instead of editing it in place and update `manifest.json`.

## Conventions
- Comments only for what the code cannot show; one short line.
- Faction keys: `NDA` and `INDI Alliance`. A fight needs rivals from different factions.
- Do not add dependencies without a reason; the bundle is split into `phaser` and `three` chunks.

## Workflows
Specialised agents are in `.github/agents`, repeatable procedures in `.github/skills`:
- `architect-reviewer` for boundary and design review
- `fighter-designer` for balance and fighter data
- `qa-playtester` for headless and browser verification
- skills: `add-fighter`, `add-special-fx`, `add-arena`
