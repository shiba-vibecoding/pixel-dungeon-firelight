# Firelight · часть 11 «Кайф от прогресса и предметов»: что добавить в репозиторий

Правила PD 1.9.2a, ядро и сеть не меняются. В ядре не тронута ни одна строка: всё читается из того, что уже есть в `@pd/core`, и из эффектов, которые сервер уже присылает. Сделано на `main` @ `1387e60`.

Варианты A/B/C каждого пункта — в `docs/design/system/firelight-growth.md` и на листах `docs/design/previews/firelight/growth/sheets/`. После выбора оставить классы и ветки выбранного варианта, остальные удалить.

## Файлы

- `packages/client/src/growth.ts` — чистые функции, без DOM:
  - `levelGain`, `expPips`;
  - `strengthWanted`, `heft`, `strengthEffects`, `nowLight`, `gear`;
  - `slotMarks`, `MARK_ORDER`;
  - `compare`;
  - `shineTier`, `auraOf`;
  - `catalog`, `stillPossible`;
  - `chronicleOf`, `descent`;
  - `knownHero`, `passport`;
  - `segments`.
- `packages/client/test/growth.test.ts` — 15 проверок; цифры сверяются с самим миром ядра (выпито зелье опыта, зелье силы).
- `packages/client/src/fl-grow.css` — все новые классы `fl-*`, только токены `ui.css`, анимации ≤ 400 мс и блок `prefers-reduced-motion`. Подключить в `main.ts` после `photo.css`.
- `packages/client/public/assets/ui/growth/`: `growth-icons.png`, `growth-fx.png`, `growth.json`.
- `tools/art/firelight/p11/`:
  - `build.sh` (`c11.py`, `icons.py`, `fx.py`, `data.py`) — значки, эффекты, json;
  - `gifs.py`, `sheets.py` — превью;
  - `mock/` — макеты экранов на коде игры, их запуск описан в `mock/README.md`.
- `tools/art/firelight/hd2d-viewer/viewer.js` — режим `dirs=grow` (`gv=A|B|C`, `set=tiers|magic|cls|one`, `&labels`, `&nopart`): блеск улучшений в 3D.
- `docs/design/system/firelight-growth.md`, `docs/design/previews/firelight/growth/`.

Проверки:
- `npx vitest run packages/client/test/growth.test.ts` проходит;
- `tsc -p packages/client` и `tsc -p packages/client/test` проходят без ошибок;
- `sh tools/art/firelight/p11/build.sh` на чистой копии `main` пересобирает три файла `assets/ui/growth/` байт в байт.

## Что клиенту хранить самому

Это не правила, а память клиента о забеге. Хранить по ключу `seed + id героя` в том же месте, где сейчас лежат настройки (localStorage), чистить при новом забеге.

| Что | Откуда | Где нужно |
|---|---|---|
| старт героя `{ht, str}` | `HERO_CLASSES[class]` при входе в забег | паспорт «было → стало», итоги |
| новизна предметов | эффект `pickedUp` → вещь «новая»; снимается при первом взгляде (рюкзак открыт и ячейка видна или карточка открыта) | метка «новое», фильтр «Новое» |
| заметки | ввод игрока: для скрытых видов — по `kind` (обличье этого забега), для вещей — по самой вещи (индекс в рюкзаке + вид) | ячейка, карточка, коллекция |
| встреченные обличья, счёт использований | `pickedUp`, кучи в поле зрения, витрина лавки; `used` | коллекция B |
| пометки ✓ / × | ввод игрока | коллекция C |
| бестиарий | первая глубина, где монстр виден; убийства (`died` с `by` = я); самый сильный удар по мне (`attack`/`hurt`) | бестиарий |
| летопись | `chronicleOf(effect, me, {depth, turn}, log)` на каждый эффект, `descent` при смене глубины | летопись, итоги |
| снимок по глубинам `{lvl, ht, str}` | при каждом `descent` | паспорт C |

## Экраны и данные

### 1. Рост героя

**Уровень (HUD).**
- Опыт: `expPips(hero)` (`pips`, `full`, `part`, `share`).
- Момент: эффект `levelUp`.
  - Карточка: `levelGain(hero)` — +5 здоровья, +1 точности, +1 уклонения, внимательность до 9-го уровня.
  - A — тост `.pd-toast.fl-lvl-toast` с `.fl-lvlcard`, `.pd-bar.xp.fl-pips` + `.fl-flash`, `.pd-hero-lvl.fl-pop`;
  - B — `.fl-xp-hearth` на `.pd-hud`, `.pd-hero-lvl.fl-coal` (`--v` = `share`), `.fl-coal-sparks`, `.fl-lvl-bubble`;
  - C — `.fl-xp-pips` вместо тонкой полосы, `.fl-collapse`, строка журнала `.pd-log-line.fl-lvl`.
- Звук `levelup` уже играет.

**Сила.**
- Момент: эффект `strength`.
- A: `nowLight(hero)` — вещи, у которых `.pd-tag` получает `.light` (перо) и `.fl-str-flip` (`--k` — порядок, шаг 40 мс). Тост `.fl-str-toast`.
- B: окно силы с `.fl-ladder`. Для каждой вещи из `gear(hero)` — `strengthWanted`, сила героя — `heroStr`.
- C: строки `.fl-cost` в карточке — `strengthEffects(hero, item)`.
- Звуки `thump` → `sparkle`.

**Паспорт** — по тапу на портрет, вместо нынешнего окна героя или вкладкой в нём.
- `passport(hero, start)`;
- точность и уклонение «с надетым» — `heroAttackSkill(knownHero(world, hero))` и `heroDefenseSkill(...)`;
- надетое — `weaponStats`, `armorStats`;
- `hero.subclass`, глубина, ход;
- вариант C — снимок по глубинам и летопись.

**Мастерство и классовая броня.**
- Эффекты `mastered` (`subclass`) и `classArmor` (`item`).
- Название — `t.subclasses`, суть — первая фраза `t.subclassInfo`.
- Варианты:
  - A — окно `.fl-seal`;
  - B — `.fl-banner` над картой и кадры `growth-fx` `sigil` над героем;
  - C — `.fl-chapter` в летописи.
- После этого знак `sigil` (16 px ×1,5) стоит у уровня в HUD (`.fl-sigil-badge`), в паспорте и итогах.
- Классовая броня — уже ряд 6 листа героя (`armorTier`).
- Звуки: мастерство — `badge`, броня — `equip` → `badge`.

**3D-блеск** (`r3d`, к фигуре героя, как `held` из части 9).
- `auraOf(hero)` для каждого видимого героя: `weapon` и `armor` (0…4), `enchant`, `glyph`, `cursed`, `ring`.
- Кадры и ступени — `growth.json → fx`, `shine`.
- Вариант A:
  - искры `spark` — аддитивные спрайты у руки с оружием (точка руки — `held.json hands`), орбита r 0,22–0,34;
  - период — `motion.moments.shine.period`;
  - руна `rune` — тон `enchant` из `growth.json` (тот же, что `ENCHANT_COLORS` в `view.ts`);
  - дымка `wisp` — обычное смешивание, 180 мс на кадр.
- Вариант B: отблеск рисуется в canvas фигуры (`source-atop`) раз в `shine.B.glintEvery`, 240 мс.
- Вариант C: кольцо — плоскость 1,3 клетки у ног, текстура 32 × 32 px; деления оружия идут по западной половине с юга, деления брони — по восточной.
- Как это рисует просмотрщик — `hd2d-viewer/viewer.js`, блок «part 11».

### 2. Рюкзак

**Ячейка** — `screens.ts → slot()`: вызвать `slotMarks(world, hero, item, {fresh, noted, light})`.
- A:
  - `level` → `.pd-lvl.up|down|unknown` («?» — новое, раньше там было пусто);
  - `strength` → `.pd-tag` (`.bad`, `.light`);
  - `mark` → `.fl-gi.fl-mark` снизу слева: имя значка = `mark`, у `enchant` и `glyph` маска с `--tint`.
- B: на `.pd-bagrow` или сетке — класс `.fl-slots-b`, на ячейке — `.fl-new`, `.fl-ench` (`--ench`), `.fl-glyph`, `.fl-heavy`, `.fl-unknown`.
- C: `.fl-slots-c` и `.fl-tagrow` внутри ячейки.

**Фильтры** — над сеткой рюкзака (`bagflow.ts`).
- Группы — по `itemDef(kind).category`:
  - оружие = `weapon` + `missile`;
  - квест = `quest`, `ankh`, `key`, `tome`, `kit`.
- «Неопознанное»: `!kindKnown || !levelKnown`; «Новое» — новизна.
- A — `.fl-chips` / `.fl-chip[aria-pressed]`, B — `.fl-rail` (на телефоне `.row`), C — `.fl-lenses` + `.fl-lensed` у сетки и `.fl-lit` у подходящих.
- Сортировка «по типу» — нынешний порядок PD; «новое вперёд» — только порядок показа, рюкзак ядра не трогается.

**Карточка предмета** — `screens.ts → describedItem`.
- `compare(hero, item)` → `.fl-cmp` с `.fl-range` (`--lo`, `--hi` — доли от общего максимума; `.unknown` — пунктир).
- Опознание — нынешний `familiarity()` → `segments(done, of)` → `.fl-segs`.
- Заметка — `.fl-note`.
- B — `.fl-pair`; C — `.fl-verdict` с чипами.

**Момент правды** — по эффектам (длительности и звуки в `growth.json → motion.moments`):

| Эффект | Анимация |
|---|---|
| `upgraded` | `.fl-flashcell`, `.fl-tickup` на `.pd-lvl`, `.fl-sparks` |
| `revealed` / `identified` / `familiar` | `.fl-reveal` + `.fl-faces` (`.fl-face-was` / `.fl-face-is`) |
| `imbued` | `.fl-runedraw` на метке |
| `scroll` (`removeCurse`, `count > 0`) | `.fl-shatter` |
| `pickedUp` | метка `new` |

### 3. Знания

**Коллекция** — новая кнопка в журнале (`JournalScreen`).
- `catalog(world, category, Object.keys(ITEMS))` → `entries` (`kind`, `label`, `known`), подписи обличий — `t.colors`, `SCROLL_RUNES`, `t.gems`, `t.woods`.
- C — `stillPossible`.
- Клетки — `.fl-shelf` / `.fl-booklist` / `.fl-elim`.

**Бестиарий.**
- Опыт и `maxLvl` — `MOBS[kind]`, описание — `mobDescription`, имя — `t.mobs`; остальное — из памяти клиента.
- `.fl-beast-grid`, `.fl-facts`.

**Летопись.**
- Журнал клиента (`chronicleOf`, `descent`).
- `.fl-ribbon` / `.fl-descent` (`--reg` — цвет региона) / `.fl-page`.
- Та же лента идёт в итоги забега.

### 4. Как это работает

Окно «Памятка» — 9 карточек по образцу карточки голода (`infoui.ts`).
- Есть уже: `hungerReport`, `brewOdds`, `awareness`, `buyPrice` / `itemPrice`.
- Числа ловушек, отдыха и поиска — формулы ядра, записанные в `firelight-growth.md`, с файлами ядра. Для них нужен модуль `mechinfo.ts` по образцу `hungerinfo.ts` (функции, которые повторяют формулы ядра, и тест, сверяющий их с миром). В эту часть он не вошёл: в макете числа посчитаны теми же формулами.
- Классы: `.fl-mech-head`, `.fl-mech-pic` (картинка из тайлов региона `tiles<n>.png`), `.fl-steps`, `.fl-table`, `.fl-swatch`, `.fl-tip`.

### 5. Итоги забега

`showRunEnd` (`screens.ts`), внутри — `.fl-endcard`, `.fl-scroll` или `.fl-spread`.

| Блок | Откуда |
|---|---|
| рост «было → стало» | старт и герой в конце |
| лучшее | надетое в конце (или лучший `weaponStats` / `armorStats` за забег — из летописи) |
| находки | летопись: первое улучшение, анкх, мастерство, чары и т. д. |
| причина | `causeName` (`deathcopy.ts`) |
| ход, золото, убийства | `runOutcome` |

Картинка для шеринга — тот же блок, отрисованный в `sharecards.ts` (420 × 560 @2, см. `share/`).

## Превью

`docs/design/previews/firelight/growth/`:
- `en|ru-375x812/`, `en|ru-1280x800/` — по 51 экрану:
  - `<экран>-<A|B|C>.png` — levelup, strength, passport, ceremony, ceremony-armor, bag, item, catalog, bestiary, chronicle, mechanic, mechanics, end;
  - `truth-<upgrade|identify|enchant|uncurse>-<A|B|C>.png`;
- `3d/` — блеск A/B/C: ступени, чары и проклятие, классовая броня; EN/RU, телефон и ПК;
- `share/` — карточки итогов;
- `reduced/` — при «уменьшить движение»;
- `anim/` — 16 GIF:
  - уровень A/B/C, сила, улучшение, опознание, чары, снятие проклятия, новое, мастерство A/B, классовая броня;
  - 3D-блеск A (ступени, чары), B, C;
- `sheets/` — сводные листы по пунктам, EN/RU.
