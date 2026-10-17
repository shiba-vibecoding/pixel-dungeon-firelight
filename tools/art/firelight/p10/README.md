# Firelight · part 10: doors you can read from any side

The doors' 3D pieces for each region (threshold, frame, leaf, lock, light, the barricade's boards, a secret door's cracks, the grate of a
boss floor's exit) as pixel art at 16 px a cell in the palette of the region's own PD 1.9.2a tiles, and `doors.json` with their sizes in
cells and the pictures on their faces. Described in `docs/design/system/firelight-doors.md`; the game's side in `migration-p10.md` and
`packages/client/src/r3d/doorkit.ts`.

```sh
sh tools/art/firelight/p10/build.sh     # Python 3 + Pillow
```

| Script | Writes (under `packages/client/public/assets/`) |
|---|---|
| `doors.py` | `doors/doors-<region>.png` and `-glow.png` (256 x 96, the layout in `LAYOUT`), `doors/doors-fx.png` (sparks, dust, the key, flames) |
| `data.py` | `doors/doors.json` (runs doors.py): heights, the pieces' sizes, the atlas, the effects, the states |

Environment overrides: `PD_ASSETS` (source assets), `P10_OUT` (where to write).

`sheet/`: `sheet.html?p=rule|region|anim&r=0..4&lang=en|ru` is the rules sheet; it shows the 3D frames of
`docs/design/previews/firelight/doors/` (`sh sheet/serve.sh`, then `node sheet/shot.cjs`). The frames come from
`../hd2d-viewer/doors.html` (see its README).
