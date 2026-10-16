# Firelight · part 6: effects

Pixel art for the effects (wand bolts, thrown weapons, scroll waves, potion splashes, gas clouds, traps, boss cards,
hero moments and blows) and `fx.json`, the one file with every effect's frames, fps, behaviour, blend, light and shake.
Described in `docs/design/system/firelight-fx.md`; wiring in `migration-p6.md`.

```sh
sh tools/art/firelight/p6/build.sh     # Python 3 + Pillow; reads packages/client/public/assets (items.png, the boss sprites)
```

| Script | Writes (under `packages/client/public/assets/fx/`) |
|---|---|
| `bolts.py` | `bolts/<kind>-fly.png`, `-hit.png`, beam and lightning parts, `thrown/*.png` |
| `waves.py` | `waves/<scroll>-ring.png`, `-specks.png` |
| `potions.py` | `potions/splash.png` (12 rows, POTION_COLORS order), `gas/<kind>.png` (3 rows: thin, mid, thick) |
| `traps.py` | `traps/traps.png` (8 rows) |
| `combat.py` | `combat/levelup|ankh|amulet|heal|hit|crit|miss.png` |
| `boss.py` | `boss/plate.png`, `boss/portrait-<boss>.png` |
| `fxdata.py` | `fx.json` (run last: it counts the frames of the sheets) |

The GIFs go to `docs/design/previews/firelight/fx/anim/`. Environment overrides: `PD_ASSETS` (source assets),
`P6_OUT` (where `fx/` goes), `P6_PREVIEW` (where the GIFs go). `px.py` holds the pixel helpers: hard steps, no smoothing.

`preview/`: `sheets.html?p=bolts|thrown|waves|potions|gas|traps|combat&lang=en|ru` lays out the sheets with their data;
`boss.html?b=goo|tengu|dm300|king|yog&lang=en|ru[&t=ms]` shows the boss card (`fl-fx.css`) over the arena.

```sh
cd tools/art/firelight/p6/preview && npm i && npm run link && npm run serve &
node shot.cjs ../../../../../docs/design/previews/firelight/fx "boss.html?b=yog&lang=ru,375,812,2,0,ru-375x812/boss-yog"
```

The in-world frames come from `../hd2d-viewer` with `fx=<scene>` (bolts, rays, waves, terror, lullaby, psionic, gas, traps,
hero, ankh, amulet), e.g. `node render.js <out> "0,0,1280,800,1,close=1;fx=bolts" "4,0,375,812,2,close=1;cells=5;fx=amulet"`.
