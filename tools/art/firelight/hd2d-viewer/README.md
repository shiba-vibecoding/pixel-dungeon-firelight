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
