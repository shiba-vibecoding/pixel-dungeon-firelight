# Firelight · часть 2 (интерфейс) — перенос

Ветка `design-p2` от main ac8a21d. Все изменения — в `firelight-part2.patch` (`git apply`); файлы лежат и по путям.

Изменены:
- `docs/design/system/components/bundle.css` — в конце добавлен блок «Firelight»: окна, кнопки, вкладки, ячейки, HUD, toast, конец забега и новые классы фото-режима `fl-*`.
- `docs/design/system/tokens.json` — восемь токенов: `stone-warm-hi`, `lit-hi/mid/lo/dark`, `glow-1/2/3`.
- `packages/client/src/ui.css` — пересобран (`node packages/client/scripts/build-ui-css.mjs`).
- `packages/client/src/game.css` — в конце добавлен блок «Firelight»: Привал (логотип, карточки, значки, подземелье дня), облачко героя (обычное и громкое), кадры рюкзака.
- `packages/client/src/quipsys.ts` — одна правка кода: облачко получает класс `loud` для моментов из `LOUD` (боссы, ловушки, на волоске, Амулет, смерть).
- `packages/client/public/assets/ui-window.png`, `ui-toast.png` — рамки, освещённые снизу.
- `packages/client/public/assets/camp/icon-mail.png`, `icon-mart.png` — новые значки.

Новые:
- `packages/client/public/assets/camp/icon-prefs.png`, `icon-ranks.png` — подключены в game.css вместо data-URI.
- `packages/client/public/assets/ui/fl-*.png`, 20 файлов: облачка и хвосты, кольцо удержания, блеск, место для броска, искры, погасший и горящий костёр, значки фото-режима, рамка фото.
- `docs/design/system/firelight-ui.md` — правила.
- `docs/design/previews/firelight/ui/`:
  - `ru|en-375x812`, `ru|en-1280x800` — все экраны;
  - `srv-*` — с локальным сервером: конец забега дня, доска, почта, Привал после забега;
  - `ru-360x780` — облачка на узком экране;
  - `before-after-ru-375x812.png` и `art-sheet-x4.png`.
- `tools/art/firelight/p2_art.py`, `p2_icons.py` — арт; `p2-shots.js`, `p2-daily.js` — снимки.

Проверено: `tsc -p packages/client` без ошибок, `vitest run packages/client` — 226 из 226.

Фото-режима в коде пока нет. В бандле лежат его вид и разметка (`firelight-ui.md`), а снимки собраны вставкой этой разметки в живую игру.
