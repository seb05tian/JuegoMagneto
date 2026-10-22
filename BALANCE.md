# Balance and simulation notes

All tunable values live in [`src/config/gameConfig.ts`](src/config/gameConfig.ts). The approved GDD remains the baseline; the feel adjustments are listed at the end with their reason.

## World and player

- Logical arena: **960 × 540**, 16:9.
- Playable physics bounds start at **y = 77**, below the HUD; the player and hazards cannot hide under the score panel.
- Arcade Physics: fixed **1/60 s** step at 60 physics updates per second.
- `World.update` accepts milliseconds, so render delta is capped at **66.67 ms**. Phaser Arcade keeps the one fractional accumulator; that cap allows no more than five fixed steps per rendered frame. `GameScene` is the only caller of `World.update`; there is no second physics accumulator.
- Player: radius **18**, speed **230**, acceleration **2100**, braking **2600**, health **3**, post-hit invulnerability **1.5 s**. Acceleration/braking were raised from 1800/2200 for tighter starts, reversals, and stops without increasing top speed.
- Movement steers toward the requested velocity instead of only accelerating along the input. Turning now brakes the old axis; joystick magnitude controls speed and an **8% dead zone** filters drift. Diagonals remain normalized.

## Magnetic response

For distance `d` inside radius `R`, acceleration magnitude is `aMax × (1 − d/R)²`. The vector points toward the player during attraction and away during repulsion. At zero distance the force is zero to avoid undefined direction.

| Parameter | Attraction | Repulsion |
| --- | ---: | ---: |
| Radius | 175 | 155 |
| Maximum acceleration | 1400 | 2400 |
| Maximum object speed | 290 | 410 |
| Energy per second | +15 | −32 |

Energy starts and caps at **100**. A fresh press can use any positive charge for an emergency burst. Only actual exhaustion requires recovery to **20**, release, and another press. Holding through exhaustion never reactivates automatically. HUD states are PULL, PUSH, CHARGE and RELEASE. Object response: coin **1.0**, crystal **0.85**, battery **0.85**, shield **0.75**, bomb **0.7**. Crystals restore **10**, batteries **25**.

## Objects, rewards, and limits

| Object | Radius | Lifetime | Reward |
| --- | ---: | ---: | --- |
| Coin | 13 | 18 s | 10 base points and 1 progress coin |
| Crystal | 14 | 20 s | 30 base points and 10 energy |
| Battery | 15 | 20 s | 25 energy |
| Shield | 15 | 20 s | Absorbs one hit; one equipped |
| Bomb | 16 | 16 s | 1 health damage |
| Target | 25 | Static | 50 fixed points for a recently repelled bomb |

Bombs launch at **28–35** speed along a fixed heading toward the player's position at warning time, with ±0.22 radian variation. The warning arrow announces that heading for **0.8 s**; it never homes after launch. Spawns use a **230–310-unit** ring and keep the minimum 230-unit safety distance. Bombs remain eligible for a target for **2 s** after effective repulsion. Regular bombs remain disabled during the first **10 s**. Difficulty rates now target **6/min** to 30 s, **10/min** to 60 s, **14/min** to 120 s, **18/min** to 180 s, **22/min** to 300 s, then a stable **26/min**. This replaces 4/7/10/13/16/18: the old randomly directed, heavily damped bombs let an idle player survive 90 seconds unharmed in all three benchmark seeds.

Active caps are **28 coins**, **6 crystals**, **10 bombs**, **2 batteries**, **1 shield**, and **4 static targets**. Spawned objects maintain a radius-based separation and avoid target zones; an unsafe spawn is skipped.

During the first **8 seconds**, coins and crystals use a seeded spawn ring **82–148 units** from the player, inside the **175-unit** attraction radius. After that lesson, rewards appear **140–225 units** away and favor a 120-degree cone ahead of movement. Remaining placement attempts spread around the player to recover near walls. This turns rewards into short routes worth chasing instead of making standing still the best strategy. Batteries, shields, and bombs retain their safe arena placement rules. The upper target row is positioned **115 units** from the top so its 76-unit artwork clears the 69-unit HUD panel with 8 units of air.

Coins are placed in curved trails of up to **3**, separated by **44 units**. The first trail appears at **0.35 s**, with later trails every **1.8–2.3 s** instead of one isolated coin every 0.7–1.3 s. Every member independently respects caps, wall/HUD clearance, target exclusion and object separation; a blocked trail ends safely. The spawn ring defines the first coin; later members lead outward along the route. Crystals remain individual.

## Pickups and progression

- Combo window: **2.2 s**. Each five valid coin/crystal pickups raises the multiplier, with the fifth pickup receiving the new value. Multipliers cap at **×5**.
- Batteries and shields do not extend combos. Real health damage breaks a combo; shield absorption does not.
- Target points bypass the combo multiplier.
- Progress coins are counted independently of score.
- Electric magnet: **100** coins; gold: **180 s** in a run; star trail: **×5**; nova pulse: **20** target hits. Cosmetics alter presentation only.

## Run variety and responsive arena

- Overdrive needs **30 charge**; coins grant **1**, crystals **3**, and valid target hits **8**. It lasts **6 s**, increases magnetic acceleration by **1.35×**, raises the induced speed cap by **1.12×**, halves repulsion cost, doubles coin/crystal base score, and restores **25 energy**. Charge pauses while active; Overdrive grants no health or invulnerability.
- Three sequential, per-run goals ask for **12 coins**, **2 distinct bomb deflections**, and **1 target hit**. They award fixed **100/200/300 points** plus **15 energy** each, with **1.6 s** between completions. Goal and target rewards bypass the combo multiplier.
- A seeded gold target begins at **30 s**, rotates every **20 s**, and pays **100 fixed points**. Its 8 charge is the same target charge used by Overdrive; standard targets remain **50 points**.
- Landscape remains **960 × 540**. Portrait uses an aspect-matched tall arena, a **108-unit** HUD, and a bottom safe strip for multitouch controls. The portrait playfield ends above both control zones; targets relocate inside the safe arena. On orientation change, active objects remap proportionally and a live run pauses.

## Explicit implementation and feel choices

- Pickup drag is **1.2/s**, applied exponentially by elapsed simulation time. Bomb drift uses **0.1/s** so slow hazards actually enter the field. For the two-second valid shot window, repelled bombs use **0.22/s** to tame the higher shot speed and retain the **410-unit/s** cap after releasing repulsion. Aimed shots carry to the perimeter without an extra impulse; bomb drift drag resumes when the shot window ends.
- The training bomb is static while idle, does not collide for damage, and is placed ahead of the player's first movement. If the player crowds it, it moves to a nearby **100-unit** offset. It is removed after reaching **20 units/s** of outward motion. Browser testing showed the initial 30-unit/s threshold could become unreachable as the magnetic force falls with distance; 20 keeps the lesson brief while requiring a visible push. It does not count toward bomb caps or difficulty.
- A collision callback happens before Phaser's fixed-step event, so the internal invulnerability timer is seeded with one extra fixed tick and ends at exactly the specified **1.5 s** after accounting for the same collision step.
- The avatar is a presentation-only sprite with a **62-unit** display box, reduced from 72 (about 14% smaller); its Arcade collision body remains the authored **18-unit radius**. Expression, bob, tilt, and squash do not move the hitbox. Dynamic collision offsets now use the real doubled Canvas texture dimensions; static target circles use world pixels. All circles are centered on their artwork, with pickups retaining their specified world radii after reuse.
- Up to **six** curved magnetic links use traveling arrowheads: cyan inward for rewards, coral inward for dangerous bombs, orange outward during repulsion. Faint radial flow lines communicate the default direction between pickups, and a short orange tracer identifies a valid bomb shot.
- Attraction acceleration changed from the GDD's **1100** to **1400** and repulsion from **1750** to **2400**. Browser review showed that the old forces were hard to read because the GDD's quadratic falloff is weak near the edge of the field. The stronger acceleration makes trajectories and bomb pushes visible sooner while retaining the same falloff, radii, velocity caps, response coefficients, and energy rates.
- The pickup ring is limited to coins/crystals; it does not place hazards closer, alter their first-10-second protection, or bypass object separation. Four static targets remain in perimeter zones; only the upper pair moved down to clear the HUD. Scoring remains fixed at **50**.
- The menu theme uses a local 16-step pentatonic melody with rests and low accents rather than a single-note metronomic loop. SFX remain procedural Web Audio and need no remote asset requests.
