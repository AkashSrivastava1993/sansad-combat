---
name: add-arena
description: "Use when adding a new 3D fight arena (scenery, lights, crowd, placards) to Sansad Combat. Triggers: new stage, new arena, new background."
---
# Add an arena

1. Add the id to `ARENA_IDS` in `src/content/arenas.ts`.
2. Add its name, banners, placards and ticker lines under `arenas.<id>` in `src/content/texts.json`.
3. Write `src/render3d/arenas/<id>.ts` exporting a builder that returns an `Arena` (`root`, `background`, `fog`, `update`, `cheer`, `dealPlacards`). Use `arenas/kit.ts` and the crowd, colonnade and texture helpers in `src/render3d`.
4. Register the builder in `BUILDERS` in `src/render3d/arenas/index.ts`. `Stage3D` builds arenas lazily and toggles `root.visible`.
5. Arenas are 3D only. World scale: 1 world unit is 100 game px.
6. Verify with `npm run build`, then pick the arena on the Menu (ARENA button) and check the intro, crowd and a special.
