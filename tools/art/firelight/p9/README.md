# Firelight · part 9: the weapon in the hand

The weapons of PD 1.9.2a as a 12 x 15 hero holds them, in the palette of their item pictures, and where each is in every frame of every
class, view (part 8's side, front and back) and armour tier. Described in `docs/design/system/firelight-held.md`; the game's side in
`migration-p9.md` and `packages/client/src/held.ts`.

```sh
sh tools/art/firelight/p9/build.sh     # Python 3 + Pillow
```

| Script | Writes (under `packages/client/public/assets/`) |
|---|---|
| `weapons.py` | `weapons/held/<weapon>.png`: 136 x 34, cells of 17 x 17, grip at (8, 8); row 0 the weapon at 0, 45 ... 315 degrees (two drawn, six exact quarter turns) |
| `held.py` | row 1 of each sheet (the trail of the blow: side, front, back) and `weapons/held/held.json`: the hand, angle, layer and shift of every frame |
| `compose.py` | nothing: a hero frame with its weapon, as the game draws it, for previews |

Environment overrides: `PD_ASSETS` (source assets, with part 8's `dirs/`), `P9_OUT` (where to write).

`sheet/`: `held.html?p=rule|weapons|classes|looks&lang=en|ru` is the rules sheet (`sh sheet/serve.sh`, then `node sheet/shot.cjs`).
The 3D frames and the blows come from `../hd2d-viewer` with `?dirs=held|strike` (see its README).
