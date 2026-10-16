# Pixel-Mart mock (design part 5)

Static pages that build the shop's screens and the art sheets from `packages/client/public/assets/mart/fl/catalog.json` with the
game's CSS (`ui.css`, `game.css`) and `fl-mart.css`. They are the reference for `martui.ts`, not the game.

```sh
sh tools/art/firelight/p5/mock/serve.sh            # http://127.0.0.1:8790/mart.html?s=home&lang=ru
node tools/art/firelight/p5/mock/shot.cjs docs/design/previews/firelight/mart "mart.html?s=tryon&lang=ru,375,812,2,0,ru-375x812/tryon"
```

`mart.html`: `s` = home | cat | tryon | bundle | gift | season | profile | photo, `cat` = looks | fires | hats | pets | effects | quips | camp |
profile | photo, `class`, `skin`, `hat`, `pet`, `fire`, `trail` (what the hero wears), `b` (bundle 0-2), `lang` = en | ru.
`sheets.html`: `p` = looks | legendary | fires | hats | pets | effects | small. `shot.cjs` needs `playwright`.
