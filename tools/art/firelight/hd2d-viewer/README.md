# HD-2D kit viewer (Firelight, part 3)

A small Three.js r169 page that builds a sample room of a region from the PD 1.9 tiles and the kit in
`packages/client/public/assets/hd2d/`, lights it from `hd2d-kit.json` and renders a mood frame.
It is a reference for the renderer, not the game: statues, high grass and fungi stand as one card, doors as a plane.

```sh
cd tools/art/firelight/hd2d-viewer
npm i && npm run link          # three, playwright; links assets, hd2d, fonts, frames
npm run serve &                # http://127.0.0.1:8765/index.html?r=2&boss=1
node render.js ../../../../docs/design/previews/firelight/world/frames 0,0,1280,800,1 0,0,375,812,2   # r,boss,w,h,dpr[,extra]
node sheet-shot.js ../../../../docs/design/previews/firelight/world "lighting-sheet.html?r=0&lang=ru,1280,800,1,0,ru-1280x800/lighting-sewers"
```

`index.html` parameters: `r` region 0-4, `boss=1` the boss arena, `t` frozen time (flicker, scroll), `cells` width that fits,
`dx`/`dz` camera offset in cells, `nomist`, `notorch`, `pitch` (70 = the game's camera), `close=1` the close rooms with three monsters,
`rules=0` sprites as before the sprite rules, `norim`. `sprite-rules.html?lang=ru` is the sprite rules sheet. Rooms are in `maps.js`.
Headless Chromium needs WebGL: `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` (set in render.js).

The art scripts: `python3 tools/art/firelight/p3_kit.py` writes `hd2d-kit.json`, then `python3 tools/art/firelight/p3_art.py` draws the maps.

Part 6 (effects): `fx=<scene>` puts effects from `assets/fx/fx.json` into the room: flat on the floor or standing like a sprite,
added or blended, each with its PointLight; screen tints as an overlay. Scenes: `bolts`, `rays`, `waves`, `terror`, `lullaby`,
`psionic`, `gas`, `traps`, `hero`, `ankh`, `amulet` (see `S` in `viewer.js`). `close=1` uses the close-up rooms of the sprite rules
(`CLOSE` in `maps.js`); a kit without the `sprites` block falls back to the same values (firelight-sprites.md).

Part 8 (facings): `dirs=four` stands the hero four ways (left, front, back, right; two by two on a tall screen), `dirs=walk` walks
him round a loop (right: side, down: front, left: the side mirrored, up: back) and `window.__frame(ms)` poses that moment.
Parameters: `cls` = warrior | mage | rogue | ranger, `tier` 0-6, `look` (a part 5 look), `hat`, `pet`, `f` (the frame for `four`).
`node dirs-render.cjs shot <out> "r,w,h,dpr,query,name"` takes pictures; `node dirs-render.cjs walk <prefix> "r,w,h,dpr,query" 0 3850 50`
the frames of the walk (the viewer served on 8765, `PORT` to change it).
Stage 2: `kind` = rat | albino | fetidRat | gnoll | shaman | skeleton | thief | bandit | bee | sheep | spinner | bat stands or walks that monster
instead of the hero (its sheets from `assets/dirs/`, its PD run frames; `MOBF` in `viewer.js`), e.g. `?r=0&close=1&dirs=walk&kind=gnoll`.

Part 9 (the weapon in the hand): `dirs=held&cls=<class>&w=<weapon>.<weapon>...` stands the hero with each weapon in the three views
(a row a view: side, front, back; a column a weapon), `dirs=strike&cls=<class>&w=<weapon>` makes him strike in the three views at once
(idle, then PD's attack frames 13-15 at 15 fps; `window.__frame(ms)`, 900 ms a loop). `tier`, `look`, `hat`, `f` (the frame for `held`),
`anim=attack|hold`, `ox`/`oz` (the group moved off the hero's cell). The weapon is drawn from `assets/weapons/held/held.json` as the game
draws it: behind the body, the body, the hat, in front. Weapons are named as in held.json (`sword`, `warHammer`, `boomerang`, ...).
