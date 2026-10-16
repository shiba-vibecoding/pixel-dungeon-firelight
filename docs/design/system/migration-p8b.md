# Firelight · часть 8 «Направления персонажей», этап 2 — монстры: что добавить в репозиторий

Только вид: правила, ходы и сеть не меняются. Пакет кладётся поверх этапа 1 (`firelight-p8.zip`): тот же код выбора направления, теперь и для монстров. Сделано на `main` @ `201e86d`.

## Файлы

**Листы.** `packages/client/public/assets/dirs/`, каждый размером с лист PD:

| Файл | Кто |
|---|---|
| `rat-front.png`, `rat-back.png` | крыса (ряд 0), альбинос (ряд 1, кадры 16–30); зловонная крыса берёт эти же листы |
| `gnoll-`, `shaman-`, `skeleton-front|back.png` | гнолл, гнолл-шаман, скелет |
| `thief-front.png`, `thief-back.png` | вор (кадры 0–12), бандит (кадры 21–33) |
| `bee-`, `sheep-front|back.png` | пчела, овца |
| `spinner-back.png`, `bat-back.png` | паук, летучая мышь: только со спины, спереди = бок |

`dirs.json` заменяет файл этапа 1 (`version: 2`): всё прежнее на месте, раздел `mobs` теперь описывает монстров:
- `mobs.kinds.<вид>` — `sheet`, `cell`, `off` (первый кадр варианта), `anims`, `sheets.side|front|back`, `fly`, `same` (какое направление совпадает с боком);
- `mobs.rule`, `mobs.fallback` — правило и запасной вид;
- `mobs.stage3`, `mobs.symmetric` — кто остался и кому новые виды не нужны.

**Скрипты.** `tools/art/firelight/p8/`:
- новый `monsters.py`;
- обновлены `data.py` (раздел `mobs`), `build.sh`, `README.md`;
- лист правил `sheet/rules.js`: страницы `monsters`, `mframes`, обновлена `mobs`.

**Просмотрщик.** `tools/art/firelight/hd2d-viewer/`: `viewer.js` и `README.md` — параметр `&kind=<монстр>` для `dirs=four|walk`.

**Документы и превью:**
- `docs/design/system/firelight-dirs.md` — добавлен раздел «Этап 2: монстры»;
- `docs/design/previews/firelight/dirs/`:
  - `en|ru-375x812/`, `en|ru-1280x800/`: `sheet-monsters.png`, `sheet-monster-frames.png`, `sheet-mobs.png` (заменяет файл этапа 1);
  - `frames/mobs/<монстр>-<размер>.png` — 3D при камере 70°, четыре направления;
  - `anim/mobs/walk-<монстр>.gif` — ходьба по кругу.

## Как игре выбирать кадр

1. **Направление.** Код этапа 1 из `view.ts` (`puppet.facing`, `facingAt`, правило шага, 120 мс) работает для кукол монстров без изменений. Отличие одно: новая кукла монстра стоит `side`, как её рисует PD, а не `front`, как герой. Удар и зап поворачивают к клетке цели.

2. **Листы** (`sprites.ts`, функция `mob(kind)`). Рядом с `sheet` завести `sheets`:

   ```ts
   const DIRS: Partial<Record<MobKind, { front?: string; back: string }>> = {
     rat: { front: 'dirs/rat-front', back: 'dirs/rat-back' }, albino: { front: 'dirs/rat-front', back: 'dirs/rat-back' },
     fetidRat: { front: 'dirs/rat-front', back: 'dirs/rat-back' },
     gnoll: { front: 'dirs/gnoll-front', back: 'dirs/gnoll-back' }, shaman: { front: 'dirs/shaman-front', back: 'dirs/shaman-back' },
     skeleton: { front: 'dirs/skeleton-front', back: 'dirs/skeleton-back' },
     thief: { front: 'dirs/thief-front', back: 'dirs/thief-back' }, bandit: { front: 'dirs/thief-front', back: 'dirs/thief-back' },
     bee: { front: 'dirs/bee-front', back: 'dirs/bee-back' }, sheep: { front: 'dirs/sheep-front', back: 'dirs/sheep-back' },
     spinner: { back: 'dirs/spinner-back' }, bat: { back: 'dirs/bat-back' },          // спереди = бок
   };
   // sheets = { side, front: front ? sheet(images[front], w, h) : side, back: sheet(images[back], w, h) }
   ```

   - Пути добавить в список загрузки `names`.
   - `spec.w`, `spec.h` и `anims` не меняются: альбинос и бандит берут те же номера кадров (16+, 21+) из листов направлений.
   - Видам без записи в `DIRS` (этап 3 и симметричные) — `sheets = { side, front: side, back: side }`.

3. **Рисование** (`r3d/world3d.ts`, `render.ts`) — как у героя:
   - `sheet = sprite.sheets?.[puppet.facing] ?? sprite.sheet`;
   - `flip = puppet.facing === 'side' && puppet.flip`, то же для `rimLast`.

4. **Гибель.** Кадры гибели одинаковы на всех листах (это кадры PD), так что умирающий монстр может доиграть на своём листе.

5. **Не трогать.** Портреты в окне «Осмотр» (`examine.ts`), бестиарий и иконки остаются боком, как в PD.

## Проверка

- `sh tools/art/firelight/p8/build.sh` пересобирает всё без расхождений: проверено на чистой копии `main` вместе с этапом 1.
- В игре на глубинах 1–4 пройти рядом с крысами и гноллами: монстр, идущий к герою снизу вверх, показывает спину, сверху вниз — морду, вбок — бок.
- Укус, удар и зап — к цели. Пчела и летучая мышь машут крыльями во всех видах.
- Альбинос, зловонная крыса и бандит берут листы своих основных видов.
- Сравнить с `docs/design/previews/firelight/dirs/frames/mobs/` и `anim/mobs/`.

## Этап 3

Следующим пакетом:
- громила, громила со щитом, монах, старший монах, чернокнижник, голем, суккуб, скорпион, кислотный скорпион, мертвец, статуя, крысиный король, бес, торговец, жезломастер, кузнец;
- затем Тенгу, DM-300, Король гномов.
