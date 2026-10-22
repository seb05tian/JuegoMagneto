# QA record

## Automated checks

Run the full suite with `npm.cmd run validate` in PowerShell.

- TypeScript strict typecheck and production Vite build.
- Unit tests cover magnetic forces, movement, energy, damage, scoring, seeded placement, persistence, Poki lifecycle, responsive layout, Overdrive, timed goals, and golden-target rotation.
- Development Chromium checks keyboard movement, pause timing, a real Arcade bomb-to-target shot, Overdrive and target rewards, touch multitasking in landscape and portrait, orientation pause, three seeded 90-second balance scenarios, and 100 full start/result/retry cycles. The cycle test compares physics bodies, pooled entities, scene objects, world-step listeners, and audio timers.
- Production Chromium uses an intercepted SDK stub to check Poki loading events, one gameplay start/stop around pause, a commercial break, and the rule that gameplay waits until the ad promise resolves.
- Browser console and page errors are checked during desktop play.

## Manual review

Reviewed Chromium captures at 1280 × 720 and 390 × 844. The player and targets remain distinct at phone size, the curved arrows show attraction and repulsion direction, and the challenge and Overdrive readouts stay clear of the central playfield. Portrait places both touch controls below the physics bounds; rotating during play pauses and remaps the arena. The tutorial bomb is separately marked, harmless, and excluded from regular bomb counts.

The feature rules and interactions are verified in automated tests. Human comprehension, fairness, repeat-session length, and motivation to retry still need player sessions; they are not claimed as validated.

## Release checks pending

- Physical phone and tablet checks; current touch checks use Chromium device emulation.
- Poki Inspector and a live Poki-hosted SDK/ad session.
- Human playtesting for the short onboarding, first-run duration, repeat-session duration, perceived fairness, and replay motivation.
- The production JavaScript is about 1.33 MB raw / 357 KB gzip and still triggers Vite's 500 KB chunk advisory. Phaser is the main contributor.

The development and production browser tests are local checks. They do not substitute for the external Poki Inspector run or playtesting with people.
