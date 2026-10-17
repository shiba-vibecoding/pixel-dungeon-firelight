# Firelight · part 13: quests, places, minor magic, bosses

The sheets (nearest, frames in multiples of 16 px), the effects' data added to `fx/fx.json` (format of part 6), `ui/quest/quest.json`
and `ui/places/places.json`. Described in `docs/design/system/firelight-quests.md`, wiring in `migration-p13.md`.

```sh
sh tools/art/firelight/p13/build.sh            # Python 3 + Pillow; rewrites the part's files under packages/client/public/assets
```

| Script | Writes |
|---|---|
| `portraits.py` (`bust.py`) | `ui/quest/portraits.png`: 4 quest-givers × 3 moods, 48 × 48 |
| `quest.py` | `ui/quest/{dialog-frame,portrait-frame,icons,progress}.png`, `fx/quest/{ore-hit,nugget,forge,anvil,reward}.png` |
| `places.py` | `fx/places/*.png`, `ui/places/icons.png` |
| `minor.py` | `fx/minor/*.png` (flock, thorns, sleep, mirror, purity, levitation, status, 11 glyphs, alarm) |
| `bosses.py` | `ui/boss/{bar,bar-frame,icons}.png`, `fx/boss/*.png` (DM-300, Tengu, the King, Goo, Yog) |
| `data13.py` | `fx/fx.json` (part 6 kept; the part's ids replaced on every run), `ui/quest/quest.json`, `ui/places/places.json` |
| `gifs13.py`, `gifs3d.py` | the preview GIFs (sheets by group; the 3D scenes from frames) |

The 3D frames: `../hd2d-viewer` with `fx=<scene>` — smith, rewards, wells, pot, garden, statue, library, minor, status, glyphs (`&g=2`),
dm300 (`&st=1..3`), dm300x, tengu, king, kingx, goo, goox, yog, yogx, npc (`&who=`); `&fo=<n>` moves every frame on by n (for GIFs).
The mock of the dialog, quest card, boss bar and places' card: `mock/` (`index.html?s=dialog&who=ghost|quest|boss&b=dm300|place|places&lang=ru`).
