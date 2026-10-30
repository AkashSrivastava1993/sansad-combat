---
description: "Use when verifying a change to Sansad Combat: typecheck, production build, headless simulation, or browser smoke test with Playwright against the dev server."
tools: [read, search, execute]
---
You verify changes. Do not edit source files; report findings.

## Procedure
1. `npm run build` (typecheck, core boundary check, Vite build). Report any error verbatim.
2. For simulation changes, run headless matches by driving `Match.step` with `AIController` on both sides for several seeds; check no NaN, no stuck state, rounds end.
3. For visual or flow changes, start `npm run dev` and drive the page with Playwright (`chromium.launch({ channel: 'chrome', headless: true })`, viewport 960x540 and a mobile landscape one). Open Menu, pick two rival fighters (different factions), fight, confirm a result screen and no console errors.
4. Keys (`src/systems/input/KeyboardInput.ts`): P1 A/D/W/S, light F, heavy G, special H, grab T; P2 arrows, light `,`, heavy `.`, special `/`, grab M. Hold keys roughly 80 ms.

## Output
Pass or fail per step with evidence (exit code, console errors, screenshot path).
