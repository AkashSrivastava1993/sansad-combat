---
name: add-fighter
description: "Use when adding a new playable fighter to Sansad Combat: JSON data, SVG art, manifest entry, faction, figure, voice. Triggers: new character, new fighter, add roster member."
---
# Add a fighter

1. Copy the closest existing file in `src/characters/data/` to `<id>.json`; keep `"$schema": "../fighter.schema.json"`. The id equals the filename.
2. Set `name`, `faction` (`NDA` or `INDI Alliance`), `color`, `stats`, `body`, `moves.light`, `moves.heavy`, `special`, `taunts`, `winQuote`.
3. Add the 3D look under `figure` (skin, bulk, top, bottom, shoes, optional beard, stole, earring).
4. Art: add `public/assets/characters/<art_id>.svg` with the standard skeleton pivots (shoulders 102,178 / 156,180; hips 108,300 / 148,300). Register it in `public/assets/characters/manifest.json` and point `svg.id` at it. Never edit a deployed SVG in place; use a new file name because assets are cached immutable.
5. Voice lines, if any, go in `public/voices/<id>.mp3` (and `<id>-win.mp3`).
6. If the special needs a bespoke effect, follow the `add-special-fx` skill.
7. Verify: `npm run build`, then open the select screen and fight the new fighter against a rival-faction one. Cards follow JSON filename order.
