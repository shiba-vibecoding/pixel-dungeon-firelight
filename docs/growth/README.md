# Part 11, «the joy of growing», in the game

Shots from the running game: headless Chromium, 375 x 812 at dpr 2, Russian, from `tools/growth-shots/shots.py` (a dev server on port 5199,
`python tools/growth-shots/shots.py [scene ...]`; `reduced` runs it with «reduce motion»). The scenes set up a hero by hand and send the
core's own effects, so every figure is what the game computes.

| File | What it shows |
|---|---|
| `01-level-toast` | the card of a new level (HUD coal popped, bar notched in fives), a tap opens the passport |
| `02-strength-toast`, `03-backpack` | a point of strength: the toast, and the feathers on what became light (red digit turned plain) |
| `04-passport` | the hero's passport: was → is since the start, «with what you wear» (unidentified ring left out), the worn things |
| `05-mastery` | the banner of the way chosen (the sigil by the level on the HUD, and over the hero in 3D) |
| `06-backpack-new`, `06b-…-unknown-filter` | the slot corners (level or «?», strength, one mark), new things, the chips and their counts |
| `07-item-card-unknown-axe`, `08-item-card-plate` | the item card: was / will be (dashed and «?» while the level is hidden), the identifying segments |
| `09-moment-upgrade`, `16-…enchant`, `17-…uncurse`, `18-identify-*` | the moments of truth in the slot (≤ 400 ms) |
| `10`–`14b` | the journal: collection (showcase, potions and scrolls), bestiary, chronicle, the guide with the nine «how it works» cards and the traps card |
| `19-end` | the end of the run: the growth card (was → is, the best worn, the finds) |
| `reduced/` | the same under reduced motion: the end state at once, the highlight held |
| `3d/` | the gleam on the hero in the 3D scene: +1, +4 with fire, +7 armour with a glyph, +10, a known curse, both orbits |

`?perf=1`, plain hero on the sewers, headless (swiftshader), cpu ms per frame, two runs each, alternated:
before (firelight/main at 4ebaa167) 1.18, 1.36; with part 11 1.21, 1.28. Draw calls the same; the 3D gleam adds none (its own numbers are in
the commit of `r3d/growth3d.ts`).

Not taken from the designer's package: the viewer's «part 11» block (`tools/art/firelight/hd2d-viewer/viewer.js`), whose file is older than
the one in the repository; the previews other than `sheets/` and `anim/` (44 MB).
