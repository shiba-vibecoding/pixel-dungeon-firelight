# Character directions (design part 8, stages 1-2)

Screenshots from headless Chromium (software GL) at a 70 degree camera, `?reveal=1`:

- `<class>-walk.png`: the four classes walking in eight directions; the label says which view the rule chose (side, mirrored when `flip`, front, back).
- `<class>-dressed.png`: a look (the legendary ones with their glow), a hat and a pet following, in the same eight directions.
- `monsters-stage2.png`: the stage 2 monsters (rat, albino, fetid rat, gnoll, shaman, skeleton, thief, bandit, bee, sheep, spinner, bat) walking east, south, west and north.

Code: `packages/client/src/dirs.ts` (the rule, lazy loading of the other views, `SPRITE_VIEWS` keyed by sheet name),
`packages/client/src/r3d/packer.ts` (the atlas packer). Stage 3 only adds entries to `SPRITE_VIEWS`.

## `?perf=1`, before and after (same seed, hero walking 18 s, median of the frames)

Software GL, so only the CPU side and the draw calls mean anything:

| run | cpu ms before | cpu ms after | draw calls median / max |
|---|---|---|---|
| 1 | 1.00 | 0.92 | 16 / 55 both |
| 2 | 0.88 | 0.96 | 16 / 55 both |
| 3 | 0.89 | 1.44 (noisy run) | 16 / 55 both |

Standing still in the first room: 0.80 to 1.06 ms before, 0.97 to 1.15 ms after, 16 calls both (one extra texture upload when a view is first drawn).
