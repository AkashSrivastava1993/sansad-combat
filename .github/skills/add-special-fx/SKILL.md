---
name: add-special-fx
description: "Use when adding or changing a fighter's special-move visual effect (projectile fx) in Sansad Combat. Triggers: new special, cinematic effect, projectile animation."
---
# Add a special-move effect

1. In the fighter JSON, set `special.type` to `projectile` and `special.fx` to a new id, e.g. `"fx": "lathi"`.
2. Create `src/ui/specials/<Name>Fx.ts` implementing `SpecialFx` from `src/ui/specials/kit.ts`. Reuse the helpers in `kit.ts`.
3. Track projectiles by `id`. A projectile is pruned the frame it dies, so read its last state through `finalState(p, state)` for impact and cleanup.
4. Register the id in the `switch` in `src/ui/specials/index.ts`.
5. Read only `MatchState`; never change simulation state. Hit-stop and slow-motion are handled in `core/match/Match.ts`.
6. Verify with `npm run build`, then fire the special in the browser; wait at least 7 seconds to confirm burn or ember effects are cleaned up.
