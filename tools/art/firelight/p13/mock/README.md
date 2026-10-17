# Part 13 mock screens

The dialog with its portrait, the quest card, the boss bar, the places' card, built on the game's own classes (`ui.css`, `game.css`,
`info.css`, `fl-fx.css`) and the new `fl-quest.css`, with the part's art from `packages/client/public/assets`.

```sh
ln -sfn ../../../../../packages/client/public/assets assets
ln -sfn ../../../../../packages/client/public/fonts fonts
mkdir -p css && for f in ui game info fl-fx; do ln -sfn ../../../../../../packages/client/src/$f.css css/$f.css; done
ln -sfn ../../../../../packages/client/src/fl-quest.css fl-quest.css
python3 -m http.server 8811 --bind 127.0.0.1
```

- **Screens:** `index.html?s=dialog&who=ghost|wandmaker|blacksmith|imp[&mood=calm|pleased|annoyed]`, `s=quest`, `s=boss&b=goo|tengu|dm300|king|yog`, `s=place[&p=<place>]`, `s=places`.
- **Language:** add `&lang=en|ru`.
- **Pictures:** `node shot.cjs <out> "<query>|w|h|dpr|name"`.
- **Backgrounds `bg/`:** frames from `../../hd2d-viewer`. The quest-givers' backdrops are `fx=npc&who=<npc>`, the arenas are `boss=1`.
