# The weapon in the hand (design part 9)

Screenshots from headless Chromium (software GL) at 375 x 812; hero views are set directly (the direction rule is tested in `dirs.test.ts`),
everything else is the game's own drawing:

- `<class>-held.png`: three or four weapons of each class in the side, front and back views, standing and mid-swing (frame 14; thrown weapons
  with the arm raised, frame 13).
- `armour-rows.png`: a sword in each of the six armour rows (side and front).
- `boomerang-throw.png`: the huntress throws her boomerang: the arm goes up, the hand is empty for the flight there and back.
- Cards: `boards-day.png`, `boards-week-warriors.png`, `my-runs.png`, `league.png`, `circle.png`, `profile.png`, `story-picture.png`,
  `chat-picture.png` (the competitions' dev page with a made-up server, `dev/compete.html`), `death-<class>.png` (the end window of a real run
  that ended holding a battle axe, a boomerang, a staff), `camp-<class>.png` (the home screen: the hero holds his last run's weapon, or his class's own).

Code: `src/held.ts` (the designer's pure rules), `src/heldart.ts` (loading, what a puppet or a card holds), the two hooks in
`r3d/world3d.ts` (`addPuppet`, `heldQuad`), `render.ts` (2D), `herocard.ts` and `camp.ts` (cards and the camp).
Server: `worn.ts` (`weaponKindOf`, `wp` on the board snapshot), `runs.ts` (the run summary).

## `?perf=1`, before and after (same seed, the warrior walking 18 s with his sword; median of the frames)

| run | cpu ms before | cpu ms after | draw calls median / max |
|---|---|---|---|
| 1 | 0.93 | 0.98 | 10 / 55 both |
| 2 | 0.95 | 0.92 | 10 / 55 both |
| 3 | 0.94 | 0.83 | 10 / 55 both |

The weapon is a quad (two with a trail) in the sprite batch: no new draw call, no per-frame allocation.
