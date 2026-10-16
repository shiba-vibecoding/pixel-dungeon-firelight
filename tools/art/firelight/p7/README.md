# Firelight · part 7: competitions and the hero card

The art and data of the boards, leagues, circles and the season (`packages/client/public/assets/compete/`), and a mock of the screens.
Described in `docs/design/system/firelight-compete.md`; wiring in `migration-p7.md`. Needs the part 5 pack (`assets/mart/fl`,
`tools/art/firelight/p5`): the hero card is built from its sheets, and `anchors.py` uses part 5's `hats.py` to find the heads.

```sh
sh tools/art/firelight/p7/build.sh     # Python 3 + Pillow
```

| Script | Writes (under `assets/compete/`) |
|---|---|
| `beacon.py` | `fires/beacon-flame|logs|sparks.png`, `fires/icons/beacon.png`, `fires/beacon.json` (the Beacon campfire, by the scheme of part 5's fires) |
| `league.py` | `league/frame-<tier>.png` (14 x 14, slice 4), `frame-beacon-anim.png` (4 frames), `badge-<tier>.png` (16 x 16), `mini-<tier>.png` (9 x 9), `tiers.json` |
| `season.py` | `season/cup-template.png`, `frame-template.png` (four key greys), `cup|frame-s1..s4.png`, `seasons.json` |
| `titles.py` | `titles/title-plate-honour.png`, `title-<key>.png` (9 x 9), `titles.json` |
| `anchors.py` | `anchors.json`: hero, hat, aura, pet and fire anchors, the layouts of every size of the card |
| `data.py` | `compete.json`: boards, leagues, circles, season, titles, share cards, notifications, EN/RU strings (run last) |

Environment overrides: `PD_ASSETS` (the client's assets), `P5_DIR` (part 5's scripts), `P5_MART` (the part 5 pack), `P7_OUT`.
`c7.py` holds the paths and borrows part 5's pixel helpers.

The mock (`mock/`): `herocard.js` puts the card together (the reference for `hero-card.ts`), `compete.js` builds the screens.

```sh
sh tools/art/firelight/p7/mock/serve.sh &     # http://127.0.0.1:8793/compete.html?s=boards&lang=ru
node tools/art/firelight/p7/mock/shot.cjs docs/design/previews/firelight/compete "compete.html?s=league&lang=ru&t=1200,375,812,2,0,ru-375x812/league"
sh tools/art/firelight/p7/mock/gifs.sh        # the GIFs in previews/.../compete/anim
```

`compete.html`: `s` = boards | league | week | circle | invite | season | hall | profile | cards | art | notify | img; `lang` = en | ru;
boards: `tab` = day | week | all | season, `metric` = score | speed | depth, `cls` = all | warrior | mage | rogue | huntress;
week: `res` = up | stay | down; circle: `kind` = group | friends; img: `k` = story | chat | circle | overtaken | league | streak
(the canvas alone at its size); `t` = a frozen clock in ms (screenshots), `still=1` stops the clock (frames for GIFs, `window.__setTime(ms)`).
`shot.cjs` and `capture.cjs` need `playwright` (or `PLAYWRIGHT=<path>`).
