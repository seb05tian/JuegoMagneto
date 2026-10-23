# Magnet Madness

Magnet Madness is a 2D arcade survival game about steering a lively magnet through a compact arena. Follow short coin trails, pull in energy, push approaching bombs away, and redirect those bombs into perimeter targets. Bombs announce a slow fixed path before moving; they do not home in on the player.

## Run locally

The project uses Phaser 3.90, TypeScript, and Vite 8. Node 22.12+ or 24.21+ is recommended.

```powershell
npm.cmd install
npm.cmd run dev
```

Open the local URL printed by Vite. For a production build and preview:

```powershell
npm.cmd run build
npm.cmd run preview
```

## Controls

- **Desktop:** WASD or arrow keys to move, hold Space to repel, Escape or P to pause.
- **Phones and tablets:** left virtual joystick to move, hold the orange pulse to repel, pause in the upper-right corner. Multitouch is enabled.
- Landscape keeps the authored 16:9 arena. Portrait builds a tall arena with controls clear of the playfield; rotating during a run pauses safely.

Attraction is always active unless repulsion is being held with enough energy. Collect rewards as they move toward the magnet, avoid bombs, and position yourself so a repelled bomb travels toward a target. Targets pay 50 points; a gold target appears after 30 seconds, rotates every 20 seconds, and pays 100.

Coins, crystals, and successful target hits charge a six-second Overdrive. It makes magnetic forces stronger, reduces repulsion drain, doubles pickup points, and restores 25 energy. Three run-only goals reward coin routes, distinct bomb deflections, and target hits with fixed score and energy.

## Project map

- `src/config/gameConfig.ts` holds the logical resolution, timing limits, colors, balance values, and object caps.
- `src/game/RunSimulation.ts` owns pooled entities, Arcade overlaps, spawning, tutorial state, survival, and run scoring.
- `src/game/` contains deterministic random, magnet force, energy, damage, scoring, spawn, and target rules with unit tests.
- `src/game/runFeatures.ts` owns Overdrive charge and the three sequential run goals; `src/game/layout.ts` keeps the arena, targets, and multitouch controls inside the current orientation.
- `src/scenes/` owns loading, the arena, HUD, menus, results, and game lifecycle.
- `src/input/TouchControls.ts` handles keyboard, joystick, repulsion, and pause input.
- `src/storage/profile.ts` stores local records, coins, statistics, and cosmetic progress with a versioned, guarded `localStorage` adapter.
- `src/platform/poki.ts` guards SDK event order and advertising interruptions.
- `src/audio/audioManager.ts` synthesizes local sound effects and a short looping theme with Web Audio; no audio files or remote assets are required.

All artwork is generated locally as original Canvas textures. The production build does not load gameplay assets from third-party hosts.

## Checks

```powershell
npm.cmd run typecheck
npm.cmd test
npx.cmd playwright install chromium
npm.cmd run test:e2e
npm.cmd run test:e2e:poki
```

`test:e2e` checks menu and play controls, energy use, pause timing, touchscreen multitouch in both orientations, an actual bomb-to-target shot, Overdrive and golden-target rewards, and 100 full start/result/retry cycles. It checks that Arcade bodies, pooled entities, scene objects, world listeners, and timers stay bounded. A separate seeded balance scenario compares camping with active collection/defense over 90 simulated seconds and attaches its measurements as JSON. `test:e2e:poki` builds production, serves it, and uses an intercepted SDK stub to verify Poki loading events and that gameplay cannot resume while a commercial-break promise is pending.

`npm.cmd run validate` runs the typecheck, unit tests, development browser suite, production build, and production Poki lifecycle suite.

The in-browser `window.__MAGNET_TEST__` diagnostics are compiled into development mode only; they are not exposed in production.

## Poki integration

The official `@poki/phaser-3` plugin is registered in production only. It detects the `LoadingScene` to report `gameLoadingStart` and `gameLoadingFinished`. `autoCommercialBreak` is disabled and no `gameplaySceneKey` is configured, so the `PokiBridge` is the only owner of `gameplayStart`, `gameplayStop`, and commercial-break requests. The bridge suppresses duplicate transitions and awaits the ad promise before re-enabling input, audio, and the Arcade world. Rewarded ads are not included.

The build is ready for Poki Inspector, but the Inspector itself and a live Poki-hosted SDK session were not available locally. Follow Poki's current [requirements and quality guide](https://developers.poki.com/guide/requirements-quality), [SDK overview](https://developers.poki.com/guide/sdk-overview), [Phaser SDK guide](https://developers.poki.com/guide/sdk-phaser), and [Inspector guide](https://developers.poki.com/guide/inspector) before submission.

## Remaining external checks

Chromium desktop and mobile emulation are covered by browser tests. Physical phones/tablets, human playtesting for the 30–60 second first-run and 2–4 minute repeat-run targets, and the Poki Inspector remain external release checks. See [QA.md](QA.md) for the observed results and limits.
