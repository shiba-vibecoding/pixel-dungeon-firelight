# Firelight · part 8: facings, stage 1 (the heroes)

Front and back views of the four heroes in the layout of the class sheets, and the Pixel-Mart looks, hats and pets for them.
Described in `docs/design/system/firelight-dirs.md`; the game's side in `migration-p8.md`. Needs the part 5 pack
(`packages/client/public/assets/mart/fl`) and its scripts (`tools/art/firelight/p5`): looks and hats are made by part 5's own code.

```sh
sh tools/art/firelight/p8/build.sh     # Python 3 + Pillow
```

| Script | Writes (under `packages/client/public/assets/`) |
|---|---|
| `heroes.py` | `dirs/<class>-front.png`, `dirs/<class>-back.png` (256 x 128: 21 frames x 7 armour rows of 12 x 15) |
| `looks.py` | `mart/fl/looks/<class>-<look>-front|back.png`, `mart/fl/legendary/<class>-<id>-front|back.png` and `-glow-front|back.png` (part 5's recolour) |
| `hats.py` | `mart/fl/hats/<class>-<hat>-front|back.png` (+ `-glow-` for the crown and the halo; part 5's hats.py fitting) |
| `pets.py` | `mart/fl/pets/rat-front|back.png`, `<pet>-back.png` for slime, bat, skull, ember |
| `data.py` | `dirs/dirs.json`: the facing rule, the layout, the sheets of every facing, the plan of stages 2 and 3 (runs pets.py) |

Environment overrides: `PD_ASSETS` (source assets), `P5_DIR` (part 5's scripts), `P8_OUT` (where to write).

`sheet/`: `rules.html?p=rule|heroes|looks|hats|pets|mobs&lang=en|ru` is the rules sheet (`sh sheet/serve.sh`, then `node sheet/shot.cjs`).
The 3D frames and the walk come from `../hd2d-viewer` with `?dirs=four|walk` (see its README).
