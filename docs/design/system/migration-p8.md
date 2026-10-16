# Firelight · часть 8 «Направления персонажей», этап 1 — герои: что добавить в репозиторий

Только вид: правила, ходы и сеть не меняются. Сделано поверх `main` @ `bdf0f0b`, где уже лежат пакет части 5 (`assets/mart/fl`) и его скрипты (`tools/art/firelight/p5`).

## Файлы

**Герои.** `packages/client/public/assets/dirs/`:
- `<класс>-front.png`, `<класс>-back.png` — виды спереди и со спины для `warrior`, `mage`, `rogue`, `ranger` (охотница). Раскладка и номера кадров как у листа класса: 256 × 128, 21 кадр × 7 рядов брони, 12 × 15;
- `dirs.json` — направления, правило выбора, раскладка и анимации, пути листов, шапки, питомцы, план этапов 2 и 3.

**Пиксель-Март** (новые файлы рядом со старыми; старые не меняются), `packages/client/public/assets/mart/fl/`:
- `looks/<класс>-<облик>-front|back.png` — 20 обликов;
- `legendary/<класс>-<id>-front|back.png` и `-glow-front|back.png` — 4 легендарных облика (аура общая, прежний файл);
- `hats/<класс>-<шапка>-front|back.png` и для `crown`, `halo` ещё `-glow-front|back.png` — 12 шапок;
- `pets/rat-front.png`, `rat-back.png`, `slime|bat|skull|ember-back.png` — питомцы. Светлячок симметричен.

**Документы и превью:**
- `docs/design/system/firelight-dirs.md` — описание;
- `docs/design/previews/firelight/dirs/`:
  - `en|ru-375x812/`, `en|ru-1280x800/` — листы правил;
  - `frames/` — 3D-кадры при камере 70°;
  - `anim/` — GIF ходьбы по кругу.

**Скрипты.** `tools/art/firelight/p8/` (`build.sh`):
- `heroes.py`, `looks.py`, `hats.py`, `pets.py`, `data.py`;
- просмотрщик `viewer/` — патч `hd2d-viewer` с `?dirs=four|walk`;
- лист правил `sheet/`.

## Как игре выбирать кадр

1. **Направление куклы** (`view.ts`). Рядом с `puppet.flip` завести `puppet.facing: 'side' | 'front' | 'back'` и `facingAt`. На каждом шаге из клетки `shown` в `pos`:

   ```ts
   const dx = cellX(pos) - cellX(shown), dy = cellY(pos) - cellY(shown);
   const next: Facing = dx !== 0 ? 'side' : dy > 0 ? 'front' : dy < 0 ? 'back' : puppet.facing;
   if (dx !== 0) puppet.flip = dx < 0;                        // как сейчас: влево — отражение бока
   if (next !== puppet.facing && now - puppet.facingAt >= 120) { puppet.facing = next; puppet.facingAt = now; }
   ```

   - Диагональ даёт бок.
   - Новая кукла героя смотрит `front`; монстры — `side`, пока у них нет своих листов (этап 2).
   - Удар, зап и бросок поворачивают куклу по тому же правилу, к клетке цели.
   - Направление держится не меньше 120 мс, поэтому зигзаг одиночных шагов не мерцает.

2. **Листы** (`sprites.ts`). Для героя загружать три листа: `<класс>.png`, `dirs/<класс>-front.png`, `dirs/<класс>-back.png`. Например, `CharSprite.sheets = { side, front, back }`, у всех тот же `sheet(image, 12, 15)` и те же `HERO_ANIMS`.
   - Облики (`looks`): так же — `mart/fl/looks/<класс>-<облик>-<facing>.png`; у легендарных — `-glow-<facing>.png`.
   - Нет листа направления — берётся бок.

3. **Рисование** (`r3d/world3d.ts → this.sprite(...)`, `render.ts` для 2D):
   - лист `sheet = sprite.sheets[puppet.facing] ?? sprite.sheets.side`;
   - отражение только сбоку: `flip = puppet.facing === 'side' && puppet.flip`. То же для `rimLast` — у видов спереди и сзади нет зеркала;
   - кадр и ряд брони не меняются (`frame % cols`, `row + puppet.row`).

4. **Шапка** — тот же кадр и ряд из листа своего направления: `mart/fl/hats/<класс>-<шапка>-<facing>.png`, свечение — `-glow-<facing>.png`. Клетка прежняя: 16 × 22, герой в (2, 7).

5. **Аура легендарного облика** одна для всех направлений, без отражения.

6. **Питомец** берёт направление по своему шагу за героем, по тому же правилу; пути — в `dirs.json → pets.facings`.
   - У слизня, летучей мыши, черепа и огонька картинка части 5 уже смотрит в камеру: вид спереди = бок, отдельный лист только со спины.
   - У светлячка один лист.

7. **Гибель** (кадры 8–12) — череп, одинаковый со всех сторон. Мёртвое тело не поворачивается.

8. **Где не трогать.** Карточка героя части 7, Привал и фото-режим остаются боком, как в оригинале: там герой стоит у костра в профиль.

## Проверка
- `sh tools/art/firelight/p8/build.sh` пересобирает всё без расхождений (проверено на чистой копии `main`).
- В игре пройти героем вверх, вниз, вбок и по диагонали — для каждого класса, в обликах и шапках:
  - вверх — вид со спины, вниз — спереди, вбок и по диагонали — бок;
  - стоя направление сохраняется, удар поворачивает к цели.
- Сравнить с `docs/design/previews/firelight/dirs/frames/` и `anim/`.

## Этапы 2 и 3
Список — в `dirs.json → mobs`:

| Этап | Кто |
|---|---|
| 2 | rat, albino, fetidRat, gnoll, shaman, skeleton, thief, bandit, bee, sheep |
| 3 | brute, shielded, monk, senior, warlock, golem, succubus, scorpio, acidic, undead, statue, ratKing, imp, shopkeeper, wandmaker, blacksmith; затем боссы tengu, dm300, king |
| новые виды не нужны (симметричные) | eye, goo, yog, swarm, elemental, piranha, larva, rottingFist, burningFist, wraith, ghost, crab, spinner, mimic |

Летучая мышь уже смотрит в камеру: вид со спины без красных глаз — одна перекраска, если он нужен. То же у паука.
