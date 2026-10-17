# Firelight · часть 9 «Оружие в руке»: что добавить в репозиторий

Меняется только картинка: правила, ходы и сеть не трогаются. Сделано на `main` @ `5e3f27a`, где уже есть часть 8: `dirs.ts` и листы `assets/dirs/`.

## Файлы

**Картинки и данные.** `packages/client/public/assets/weapons/held/`:
- `<оружие>.png` — 19 листов по 136 × 34. Ряд 0 — восемь углов, ряд 1 — след удара сбоку, спереди и со спины. Клетка 17 × 17, рукоять в (8, 8).
- `held.json`:
  - `weapons` — оружие: `kind` предмета, тип удара, лист;
  - `hands` — кисть: класс → вид → ряд брони → 21 кадр;
  - `poses` — позы: тип → вид → `attack` и `hold`, 21 кадр, у каждой угол, слой, сдвиг и след;
  - правила `place`, `layer`, `hidden`, `anims`.

**Код.**
- `packages/client/src/held.ts` — чистые функции без мусора в кадре:
  - `heldOf(data, heroClass, facing, tier, frame, itemKind, attack)` → клетка оружия и следа, место в кадре героя, слой; `null`, если рисовать нечего;
  - `heldOffset(held, 12, 15, flip)` → сдвиг клетки от низа-середины кадра героя.
- `packages/client/test/held.test.ts`:
  - для каждого `weapon.*` и `missile.*` есть картинка;
  - размеры листов, кисть во всех кадрах;
  - оружие убирается в кадрах гибели и действия;
  - взмах меча, бросок камня, отражение.
- Тест проходит под `vitest`, `tsc -p packages/client` и `tsc -p packages/client/test` — без ошибок.

**Скрипты.** `tools/art/firelight/p9/` (`build.sh`):
- `weapons.py` — оружие в руке;
- `held.py` — кисть, позы, следы, `held.json`;
- `compose.py` — сборка кадра для превью;
- лист правил `sheet/`.

**Просмотрщик.** `tools/art/firelight/hd2d-viewer/viewer.js`: режимы `?dirs=held` (ряд — вид, столбец — оружие) и `?dirs=strike` (удар в трёх видах, `window.__frame(ms)`).

**Документы и превью:**
- `docs/design/system/firelight-held.md`;
- `docs/design/previews/firelight/held/` — листы правил EN/RU в 375×812 и 1280×800, `frames/` (3D), `anim/` (GIF удара).

## Как подключить

1. **Данные.**
   - Загрузить `weapons/held/held.json` один раз, рядом с `dirs.json`.
   - Листы оружия грузить лениво, как виды в `dirs.ts` (`picture()`). Пока лист не пришёл, оружие не рисуется.

2. **Что в руке.**
   - Герой: `heroById(world, id)?.weapon?.kind` — то же поле, по которому `view.ts` выбирает звук удара (`BLUNT_WEAPONS`).
   - Нет оружия — пустые руки: `heldOf` вернёт `null`, кулак PD как раньше.
   - Метательное в руке бывает только у охотницы и разбойника — это обычный `missile.*` в слоте оружия.

3. **Кадр** (`r3d/world3d.ts → addPuppet`, после `figureOf`):

   ```ts
   const held = puppet.isHero && puppet.alive
     ? heldOf(HELD, heroClass, fig.facing, puppet.row, frame, weaponKind, puppet.anim === 'attack') : null;
   ```

   - `fig.facing` — вид, который действительно нарисован (части 8).
   - `puppet.row` — ряд брони, `frame` — тот же кадр, что у тела.

4. **Порядок рисования:**
   1. `held.layer === 'back'` — до тела;
   2. тело;
   3. шапка;
   4. `held.layer === 'front'` — после шапки. Здесь тот же `rimLast`, что у шапки: оружие ловит контровой свет, как фигура.

   Квад оружия — тот же `this.sprite(...)`, в режиме `LEANED`, с `fig.flip` героя:

   ```ts
   const { right, up } = heldOffset(held, sheet.w, sheet.h, fig.flip);
   const k = scale / TILE;
   const wx = tx + right * k;
   const wy = by + up * k * LEAN_STRETCH * Math.cos(LEAN);
   const wz = bz - up * k * LEAN_STRETCH * Math.sin(LEAN);
   this.sprite(img, held.sx, held.sy, held.w, held.h, fig.flip, wx, wy, wz, held.w * k * fw, held.h * k * fh, tint, LEANED);
   if (held.trailSx >= 0) this.sprite(img, held.trailSx, held.trailSy, held.w, held.h, fig.flip, wx, wy, wz, held.w * k * fw, held.h * k * fh, tint, LEANED);
   ```

   - `by`, `bz` — уже с поправкой на нижний пустой ряд кадра (`gapRows`) и на приседание при приземлении, поэтому оружие стоит ровно в руке.
   - Квад той же высоты и наклона в той же плоскости — пиксели совпадают с героем.

5. **2D** (`render.ts`): то же самое. Клетка оружия рисуется в `(x + held.left, y + held.top)` от левого верхнего угла кадра героя, при `flip` — зеркально: `x + 12 - held.left - 17`.

6. **Анимации.**
   - `attack` — позы удара: замах, удар со следом, возврат.
   - `idle`, `run`, `pump` — держит в руке.
   - `operate` (кадры 16–17) и `die` (8–12) — оружия нет.
   - **Бросок своего метательного оружия** (`thrown`, у которого `effect.item` совпадает с оружием в руке): сыграть героем `attack` — в кадре 14 предмет уходит из руки. Бумеранг до возвращения не рисовать: например, `puppet.heldAwayUntil` = время полёта из `fx.json`. Камни и сюрикены — стопка: со следующего кадра в руке снова есть.
   - Зап жезла и бросок другого предмета не меняют позу: оружие держится в руке.

7. **Где не рисовать.**
   - Отражения героя: их лист — героя, оружие можно дать, когда понадобится.
   - Карточка героя части 7, Привал и фото-режим — как были. Им оружие можно добавить тем же `heldOf` (кадр 0, вид `side`).
   - Монстры: у них оружие уже нарисовано в листе PD.

## Проверка

- `sh tools/art/firelight/p9/build.sh` пересобирает листы и `held.json` без расхождений (проверено на чистой копии `main`).
- `npx vitest run packages/client/test/held.test.ts`.
- В игре: надеть каждое оружие и пройти вверх, вниз и вбок, ударить в каждую сторону:
  - сбоку оружие в передней руке, при шаге влево отражается;
  - спереди и со спины — в руке, которая бьёт;
  - копьё бьёт в камеру, со спины уходит за голову.
- Сравнить с `docs/design/previews/firelight/held/frames/` и `anim/`.
