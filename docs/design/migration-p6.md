# Firelight · часть 6 «Эффекты» — что добавить в репозиторий

Только вид: ядро, правила и сеть не меняются. Старые эффекты (`fx.wave`, `fx.burst`, `BOLT_GLOW`, canvas-карточка босса) работают, пока их не заменят по шагам ниже. Сделано поверх `main` @ `ec07b27`.

## Файлы
- `packages/client/public/assets/fx/` — листы:
  - `bolts/` — болты 14 палочек: полёт и удар; луч распада — начало, тело, конец; молния — дуга и удар;
  - `thrown/` — бумеранг, сюрикен, томагавк; дротик и стрела в 8 направлениях;
  - `waves/` — кольца и искры 4 свитков;
  - `potions/splash.png` — брызги 12 цветов;
  - `gas/` — 7 облаков по 3 ряда густоты;
  - `traps/traps.png` — 8 семейств;
  - `combat/` — уровень, анкх, амулет, исцеление, удар, крит, промах;
  - `boss/` — плашка и 5 портретов.
- `packages/client/public/assets/fx/fx.json` — все данные. Формат описан в `docs/design/system/firelight-fx.md`.
- `packages/client/src/fl-fx.css` — карточка появления босса (`.fl-boss-card`).
- `docs/design/system/firelight-fx.md` — описание пакета.
- `docs/design/previews/firelight/fx/`:
  - листы и карточки — EN/RU, 375 × 812 и 1280 × 800;
  - `frames/` — эффекты в 3D;
  - `arenas/` — арены боссов;
  - `anim/` — 60 GIF.
- `tools/art/firelight/p6/` — скрипты (`build.sh`) и `preview/`: `sheets.html`, `boss.html`, `shot.cjs`.
- `tools/art/firelight/hd2d-viewer/`:
  - `viewer.js` — параметр `fx=<сцена>` ставит эффекты из `fx.json` в комнату. Сюда же вошли правила спрайтов из пакета firelight-sprites: если в ките нет блока `sprites`, берутся те же значения;
  - `maps.js` — крупные комнаты `close=1`;
  - `render.js` — имя файла по сцене;
  - `package.json` — ссылка `fx`.

## Подключение

1. **Стили.** `import './fl-fx.css';` в `main.ts`, после `game.css`.

2. **Данные.** Новый модуль `fxdata.ts`:
   - один раз загружает `assets/fx/fx.json` (как каталог Марта);
   - даёт `fxOf(id)` и `fxFor(effect)`; пути `sheet` отсчитываются от `assets/`.

   Ключ события собирается так:

   | Событие | Ключ |
   |---|---|
   | `zapped` | `zapped.<bolt>` |
   | `thrown` | `thrown.<item>` (missile.boomerang и т. д.) |
   | `missile` | `missile` |
   | `scroll` | `scroll.<kind>` |
   | `shattered` | `shattered.<цвет зелья из run.labels>` |
   | `trap` | `trap.<kind>` |
   | `burst` | `burst.<kind>` |
   | `special` | `special.<ability>` |
   | `yell` (`line: 'notice'`) | `yell.notice.<boss>` → `bossCards.bosses.<boss>` |
   | `attack` | `attack.hit`, `attack.crit` или `attack.miss` |

   Остальные события берутся по типу: `levelUp`, `resurrected`, `amulet`, `healed`. Газ на полу — `gas.<GasKind>`. Нет записи — работает старый код.

3. **Проигрыватель листа, 2D** (`fx.ts`). Новый вызов `fx.sheet(id, x, y, now, { rot, row, scale })`:
   - кадр = `floor((now − start) · fps / 1000)`;
   - `drawImage` с `imageSmoothingEnabled = false`, масштаб `px` целый;
   - для `blend: 'add'` — `globalCompositeOperation = 'lighter'`;
   - `splat` оставляет `stay.frame` на `stay.ms` и гасит его;
   - `hang` держится `hold` мс.

   Свет в 2D: добавить запись в `lightsFor()` с `color`, `radius` и альфой `intensity / 8` по кривой. Тряска и вспышка — существующие `fx.shake(px, ms)` и `fx.flash(rgb, alpha, ms)`, значения из `shake` и `tint`.

4. **Снаряды** (`view.shoot`, `render.ts`, `r3d/effects3d.ts → bolts()`):
   - **полёт** — кадр `bolt.<k>` вместо `UV_DOT`; голова в (10, 8), лист смотрит вправо. Поворот по пути: в 2D `rotate`, в 3D billboard вокруг оси взгляда. Скорость `speed` кл./с задаёт `p.duration = длина / speed`;
   - **свет** — `light.curve: 'follow'` двигает `dynamic` вместе с головой; при прилёте играет `hit`;
   - **`beam`** — сразу `start`, тело по клеткам, `end`, 420 мс. **`arc`** — то же, но кадр клетки случайный каждые 1000 / fps мс, затем `strike`;
   - **`drop`** — на `avalanche`: `bolt.rocks` падает с высоты 3 клеток на каждую клетку, затем `bolt.rocks.hit`;
   - **метательное** — у `thrown` по `item` брать `thrown.boomerang | shuriken | tomahawk | javelin`, для `missile` (стрелы и дротики монстров) — `thrown.arrow`. Для `directions` кадр выбирается по курсу: `round(atan2(−dy, dx) / 45°) mod 8`, порядок E NE N NW W SW S SE, без поворота. Бумеранг (`returns`) летит обратно тем же путём;
   - старые `BOLT_GLOW` и `fx.burst` в `zapped` убрать, когда листы заработают.

5. **3D-атлас** (`effects3d.ts → fxTexture()`). Листы `fx/*` докладываются в атлас эффектов при загрузке (они маленькие, всё вместе меньше 512 × 512). UV кадра = `(col · w, row · h, w, h)`.
   - Стоячие эффекты — `billboard` с наклоном спрайта (`LEAN_DEG`, `LEAN_STRETCH` из `project.ts`).
   - Лежачие — плоский квад на `lift`.
   - `add` идёт в `this.glow`, `normal` — в `this.soft`.
   - Свет: одна лампа `dynamic`. Её получает эффект с наибольшим `intensity × остаток`.

6. **Волны свитков** (`fx-events.ts → case 'scroll'`). Вместо `fx.wave(...)`:
   - кольцо `wave.<k>` на полу у героя, в целом масштабе из `scaleSteps`, который дотягивается до `radius`;
   - `rings` колец через `stagger` мс;
   - `specks.count` искр `wave.<k>.specks`;
   - свет, тряска (`shake`), вспышка экрана (`tint`) — только у читающего, если `tintOnlyForReader`.

   Звуки остаются.

7. **Зелья и газ.**
   - `shattered` — `potion.splash.<цвет>` на клетке; лужа остаётся пятном среди `STAINS`.
   - Газ (`FxContext.gas`) — вместо пухов `GAS_PUFFS` одна клетка `gas.<kind>` на каждую клетку с газом. Ряд по `volume`: 1–5, 6–15, 16+. Кадр `(floor(now · fps / 1000) + x + y) mod 4`.
   - `burst` кладёт `gas.fire`, `gas.frost`, `gas.purity` на клетки взрыва на время его жизни.
   - Дымовая бомба (`special.smokeBomb`) — `gas.smoke` на 3 × 3 клетки, 2 с.

8. **Ловушки** (`case 'trap'`):
   - `trap.<kind>` на плите, его свет и тряска;
   - `then` — облако после вспышки;
   - если ловушку задел монстр (`effect.mob`) — без тряски и вспышки экрана (`fx.json → mobTrap`).

9. **Карточка босса** (`render.ts`, `cards.ts`). Вместо `bossCard(ctx, …)` при `view.bossIntro` один раз вставить в `#ui`:

   ```html
   <div class="fl-boss-card"><div class="fl-boss-plate">
     <img class="fl-boss-face" src="assets/fx/boss/portrait-goo.png" alt="">
     <div class="fl-boss-text">
       <span class="fl-boss-depth">Глубина 5<span class="fl-boss-region"> · Канализация</span></span>
       <span class="fl-boss-name">Жижа</span><span class="fl-boss-sub">владыка сточных вод</span>
     </div></div></div>
   ```

   - Имя и эпитет берутся из `t.mobs[kind]` и `t.bossEpithets[kind]`, регион — из `t.regionNames`.
   - Через `bossCards.timeline.out[0]` (2200 мс) добавить класс-выход (opacity 0 за 400 мс) и удалить элемент на 2600 мс.
   - В `case 'yell'` тряску взять из `bossCards.shake`; свет босса — из `bossCards.light`, цвет `accent`.
   - Canvas-карточку `bossCard()` оставить для режима без DOM (повтор и `share`).

10. **Моменты героя.** На `levelUp` — `hero.levelup` у ног (вспышка экрана только у самого героя), на `resurrected` — `hero.ankh`, на `amulet` с `first` — `hero.amulet` над героем на 2,4 с, на `healed` — `hero.heal`. Частицы `GOLD` из `fx.burst` можно оставить поверх.

11. **Удары.** В `case 'attack'`:
    - `attack.hit` — `hit` у цели;
    - промах — `hit.miss`;
    - крит — `hit.crit`, пока ядро не даёт флага: `damage ≥ 0,3 · HT` цели (из `world`).

    Если в ядро добавят `crit: true`, условие заменить флагом. Так написано в `fx.json → hit.crit.when`.

12. **Облегчённый режим.** При `quality.reducedMotion` тряски нет, вспышки экрана — с половинной альфой, у карточки босса нет анимации (`prefers-reduced-motion` в CSS).

## Проверка
- `sh tools/art/firelight/p6/build.sh` пересобирает листы, GIF и `fx.json` без расхождений (проверено на чистой копии).
- Пройти по разу:
  - каждая палочка;
  - бумеранг, метательное и стрелы;
  - 4 свитка;
  - бросок зелья;
  - ловушки;
  - 5 боссов на телефоне и мониторе, EN и RU;
  - уровень, анкх, амулет;
  - удар, крит, промах.
- Сравнить с `docs/design/previews/firelight/fx/frames/` и `anim/`.
