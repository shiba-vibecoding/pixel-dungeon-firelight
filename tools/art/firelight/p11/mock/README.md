# Part 11 mock screens

Screens of part 11, built from the game's own pieces: the core and the client's texts (`core.js`, bundled from the repository), the classes of `ui.css`, `game.css`, `info.css` and the new `fl-grow.css`. Every number on them is computed by the game's code.

## Setup, once (from this folder)

```sh
sh build-core.sh                                   # core.js
ln -sfn ../../../../../packages/client/public/assets assets
ln -sfn ../../../../../packages/client/public/fonts fonts
mkdir -p css
for f in ui game info; do ln -sfn ../../../../../../packages/client/src/$f.css css/$f.css; done
ln -sfn ../../../../../packages/client/src/fl-grow.css fl-grow.css
python3 -m http.server 8811 --bind 127.0.0.1
```

## Opening a screen

`http://127.0.0.1:8811/index.html?s=<screen>&v=A|B|C&lang=en|ru`

- **Phone:** any viewport narrower than 700 px.
- **Screens:** `levelup`, `strength`, `passport`, `ceremony` (`&k=armor` for the class armour), `bag`, `item` (`&i=<item>` picks the item), `truth` (`&k=upgrade|identify|enchant|uncurse|newitem`), `catalog` (`&c=potion|scroll|ring|wand`), `bestiary`, `chronicle`, `mechanic`, `mechanics`, `end` (`&share=1` for the card to share).
- **Frozen moment:** `&t=<ms>` stops every animation at that moment. Without it, the screen shows the end state.
- **Reduced motion:** `&rm=1`, used together with `shot.cjs`.

## Pictures and GIFs

- **One picture:** `node shot.cjs <out> "<query>|w|h|dpr|name"`.
- **Frames for a GIF:** `node shot.cjs <out> --frames "<query>|w|h|dpr|name" 0 600 33`.
- **Building the GIFs:** `python3 ../gifs.py <frames> <out>`.
- **Backgrounds `bg/`:** 3D frames from `../../hd2d-viewer` (`dirs=grow&set=one`).
