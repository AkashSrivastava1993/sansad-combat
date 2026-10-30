---
description: "Use when editing the game simulation in src/core: combat, AI, input, match state, fighter data validation. Keeps core framework-free and deterministic."
applyTo: "src/core/**"
---
# src/core rules

- No imports from `phaser`, `three`, `../ui`, `../render3d`, `../scenes` or any DOM API (`window`, `document`, `AudioContext`).
- Time only advances through `Match.step(rawMs)`; no `Date.now()` or `performance.now()` inside core.
- Avoid new sources of nondeterminism; the only `Math.random` today is in `ai/AIController.ts` (AI reaction jitter).
- Expose results as snapshots (`FighterSnapshot`, `ProjectileSnapshot`, events) in `match/state.ts`; consumers must not hold references to live `Fighter` objects.
- Gameplay constants go in `core/config.ts`.
- Verify with `./node_modules/.bin/tsc -p src/core --noEmit`.
