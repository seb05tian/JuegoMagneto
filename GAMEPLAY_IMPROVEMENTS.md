# Gameplay improvement pass

The official Poki engagement guidance emphasizes a quick, satisfying repeat loop, clear goals, visible rewards, and gradual mastery. Its easy access guidance favors short visual onboarding and recommends portrait as a strong mobile option. Those principles informed these design choices; the exact features below are original to Magnet Madness, not requirements prescribed by Poki.

## New run decisions

- **Overdrive:** charge 30 points from coins (1), crystals (3), and valid target hits (8). It lasts 6 seconds, increases magnetic acceleration by 35%, raises the induced speed cap by 12%, halves repulsion drain, doubles coin and crystal points, and restores 25 energy. It grants no health or invulnerability.
- **Three sequential goals:** collect 12 coins, deflect two distinct bombs, then hit one target. Completion awards fixed 100, 200, and 300 points and 15 energy, with a 1.6-second reveal gap. Progress exists only for the current run.
- **Golden target:** starts at 30 seconds, changes position every 20 seconds using the run seed, and pays 100 fixed points plus 8 Overdrive charge. Its gold artwork and arrival cue distinguish it from the standard 50-point target.
- **Magnetic lines:** animated curved links show the direction of pull or push around nearby objects. The Overdrive field changes to violet; the repulsion pulse remains orange when Overdrive is inactive.

## Responsive playfield

Landscape retains the original 960 × 540 logical arena. Portrait uses a tall, aspect-matched arena, moves targets and status HUD into safe zones, and places the movement joystick and repulsion button at opposite lower corners. The arena background has a portrait composition. Changing orientation remaps entities and pauses an active run so control cannot be lost mid-turn. Phaser Arcade still owns the single fixed 1/60-second physics step.

## Design references

- [Poki engagement](https://developers.poki.com/guide/engagement)
- [Poki easy access](https://developers.poki.com/guide/easy-access)
- [Poki quality requirements](https://developers.poki.com/guide/requirements-quality)
