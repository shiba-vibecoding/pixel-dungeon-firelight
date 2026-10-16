# Renderer performance pass for phones

Method (the harness is in `tools/perf-harness/`, Playwright with Python; run the dev server and `python busy.py high 6 12`, `python firsts.py out.json`,
`python mem.py out.json`; `PD_PORT` picks the server): headless Chromium on the development PC (Radeon 780M, D3D11), a phone's viewport at device
pixel ratio 2, the game's own loop. The world is seeded the same way for both builds. "Before" is firelight/main db4ae86b, run from a second worktree.
The machine was shared with other work while this ran (a stray `find /` of another session took a core for hours), so every wall-clock number is
noisy; the stalls below are hundreds of ms and do not depend on that, the distributions are best of three.

## 1. First use (one frame, ms; the slowest of 40 frames after the trigger)

| trigger | before | after |
|---|---|---|
| first bolt (lightning and fire) | 15 | 6 |
| first bloom-bright effect (flash, glowing sparks) | 12 | 6 |
| first kill (gore, a body baked, the dead batch) | 675 | 46 |
| first new monster (a bat and a gnoll appear) | 878 | 54 |
| first water mirror (water comes into view) | 1149 | 12 |
| the governor steps down to mid | 1738 | 13 |
| the governor steps down to low | 1048 | 6 |
| to min | 7 | 1 |

What the stalls were (the script profile shows `getProgramInfoLog`, the wait for the card to finish linking a program, for all of it): a program is
compiled the first time a batch with something in it is drawn (the dead batch, the blended batch, the mirror's variant of the terrain), and the first
blood on a door gave the door's mesh an instance colour, which is another program. What was changed (all in `r3d/`):

- `World3D.warmUp`, at the end of the first `setLevel`: every monster, hero, item and plant sheet goes on the atlas (and is read once for its soft pixels
  and feet), every texture is sent (`initTexture`), every program of the scene is compiled in parallel with `compileAsync` (KHR_parallel_shader_compile where the
  device has it) in the state it is drawn in (into the bloom's target with no tone map, or the canvas), with the bloom's passes (`Post.compile`), and when
  they are ready one frame is drawn into the targets with every batch made non-empty (`hiddenFrame`: the shadows' programs, the targets, the buffers, the
  mirror's pass). The first floor's picture is held back for at most 4.5 s meanwhile (the frames draw nothing; the governor is not judging them); later floors
  only compile what their region adds, in the background.
- The programs of the tiers below the present one are compiled the same way (`compileLowerTiers`: the rig and the renderer are set as each tier has them and put
  back), so a demotion, which only happens on a device that is already late, does not stop to compile. They are taken again for each new floor's materials.
- The door leaves are made with their instance colour (blood tints them later: a mesh that takes a colour afterwards is another program).
- The mirror's clipping plane (a program variant that `compile` cannot make, since the renderer sets clipping only in `render`) is gone: the terrain, water and
  decal shaders discard what is under the water in the mirror's pass (`uBelow` in `withFog`).
- The sprite atlas sends each newly placed sheet (a monster, a body, a look) as its own rectangle, not the 16 MB of its two canvases (`Atlas.flush`), and the gore
  canvases and the atlas send rectangles with `texSubImage2D` directly (`texsub.ts`): three's `copyTextureToTexture` asks the card for four settings first, four
  round trips each.

## 2. A throttled phone (6x CPU), a fight with four mobs hunting the hero, kills and gore, a bolt and a flash every 380 ms, toxic gas, bloom, mirror, grass

Frame gaps are the page's own animation frames (ms; 16.7 is a held 60 Hz), the renderer's frame is the time `World3D.frame` took. Best of three 8 s runs per tier (the "after" high row is from a second set of two runs on a calmer machine; the first set read 50 / 116 / 150 and 16.4 / 25.5 / 34.6):

| tier | gap median / p95 / p99, before | after | renderer frame median / p95 / p99, before | after |
|---|---|---|---|---|
| high | 50 / 100 / 150 | 33 / 67 / 83 | 13.7 / 28.8 / 39.2 | 9.3 / 15.4 / 18.9 |
| mid | 33 / 83 / 117 | 50 / 117 / 133 (a busier machine) | 10.2 / 19.9 / 36.3 | 12.9 / 21.7 / 26.9 |
| low | 50 / 117 / 183 | 33 / 83 / 100 | 11.9 / 21.2 / 54 | 7.8 / 14.4 / 19.2 |
| min | 50 / 150 / 183 | 33 / 50 / 83 | 13.2 / 30.6 / 59.6 | 6.6 / 11.0 / 15.4 |

(`throttled-6x-*.jsonl` has every run; a later set of the "after" runs came under a much heavier load and reads worse for the same code, 11 ms median in the renderer
at high, p99 18 ms, but gaps of 180 ms: the renderer's own time was steady, the rest of the page and the machine were not.)

The governor, which only goes down and holds: it demoted high to mid to low to min in 11 to 14 s before (a 1.5 s window and a 1.5 s hold after each step); and on a
device drawing four frames a second it never demoted at all, because a gap over 250 ms was ignored as a hidden tab (a run of the fight stayed on mid for 17 s at a
300 ms median). Now a long frame counts as 250 ms (only a gap over 1.5 s is a tab), the window is 1 s, the hold after a step 1 s, and frames that average over 45 ms for
0.4 s decide at once. The same fight steps down in about 4 s (427 ms, 2.4 s, 3.9 s), with no step back up and no oscillation (`governor-*.jsonl`; the tests are in
`r3d-perf.test.ts`).

Hot spots found in the profile and fixed: the water's blood cloud was sampled over every cell near a bleed on every frame (`waterRed`: now 15 times a second); the HUD
measured the free band of the screen with `getBoundingClientRect` on every frame, which forces a layout (now measured when the HUD changes, and at least twice a second);
the gore canvases' and atlas's `getParameter` round trips (see above); the static meshes (level, grass, the batches) are out of the scene's matrix walk for good
(`matrixWorldAutoUpdate`). Left alone (not the renderer): the 2D overlay's `fillText` for damage numbers (`cards.ts floatNumber`, about 5 percent of the frame at 6x), the log's
DOM updates (`hud.ts updateLog`) and the first synthesis of each sound (`sfx-synth.ts renderVoice`, which `audio.ts` already does in the quiet after the first tap).

## 3. Memory (high tier, 750 x 1624, 40 floor changes: depths 1 to 20 twice, a forced garbage collection before each reading)

Counted from the WebGL calls (`mem.py`; mip levels not counted):

| | before | after |
|---|---|---|
| textures | 22 (49.2 MB) | 24 (55.1 MB) |
| renderbuffers (the bloom's and mirror's depth) | 22.2 MB | 22.2 MB |
| geometries | 10 to 11 | 12 to 13 |
| programs held | 15 to 17 | 42 (the lower tiers' variants) |
| growth over 40 floor changes: textures, geometries | none | none |
| JS heap, floor 1 to floor 20 (second time round) | 33.2 to 34.8 MB | 34.2 to 35.9 MB |

The textures are the sprite atlas (2 x 8 MB), the gore canvases (5.9 MB; sent at the start now, before at the first blood: the +6 MB), the effects atlas (3 MB), the terrain
atlases (about 1 MB), the fog and blood textures, the shadow maps (2 x 512 squared depth); the bloom's targets (half float: 9.7 MB for the scene, 1.6 MB for the three small
ones), the mirror's (1.1 MB) and the depth renderbuffers are the rest. Everything is the same after a floor change as before it; a region's terrain textures are replaced when the
region changes, the others are kept. The extra 6 MB is the price of having the gore canvases on the card before the first kill.
