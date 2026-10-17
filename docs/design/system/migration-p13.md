# Firelight · часть 13 «Живые квесты, места и боссы»: что добавить в репозиторий

Правила PD 1.9.2a, ядро и сеть не меняются. Это арт и данные для кода, который уже есть: живые диалоги, карточка задания, эффекты мест и слабых предметов, фазы боссов. Сделано на `main` @ `cc61389`.

## Файлы

**Картинки** — `packages/client/public/assets/`, всё nearest, кадры кратны 16 px:
- `ui/quest/`:
  - `portraits.png` — 144 × 192;
  - `portrait-frame.png` — 64 × 64;
  - `dialog-frame.png` — 48 × 48, slice 8;
  - `icons.png` — 176 × 32;
  - `progress.png`;
  - `quest.json`.
- `ui/places/`: `icons.png` (176 × 16), `places.json`.
- `ui/boss/`: `bar.png`, `bar-frame.png` (slice 6), `icons.png` (80 × 16).
- `fx/quest/`, `fx/places/`, `fx/minor/` — 5 + 8 + 9 листов.
- `fx/boss/` — 15 новых листов. `plate.png` и `portrait-*.png` части 6 не тронуты.

**Данные** — `fx/fx.json`, части 6 не тронуты, кроме `trap.alarm.then = "minor.alarm"`. Добавлено:
- `fx` — +70 эффектов;
- `moments` — 32 ключа событий для `eventKey`;
- `ambient`, `bosses`, `bossBar`.

**Код:**
- `packages/client/src/fl-quest.css` — портрет в нише и настроение, рамка диалога, ячейка награды на подиуме, карточка задания и шкала, значок в HUD, полоска босса, карточка места.
- `packages/client/src/fxsheet.ts` — `ATLAS` 1024 × 1536: прибавлена свободная область `{x 0, y 768, w 1024, h 768}`. Листы части 13 (≈420 000 px) не помещались в оставшиеся ≈174 000. Всё остальное в атласе на прежних местах; `effects3d.ts` берёт размер из `ATLAS`.
- `packages/client/test/fx.test.ts` — 148 эффектов (78 + 70), 62 события.

**Скрипты:**
- `tools/art/firelight/p13/` — `build.sh` и `mock/`, подробно в `README.md`;
- `tools/art/firelight/hd2d-viewer/viewer.js` — сцены `fx=` части 13 и `&fo=`.

**Документы и превью:**
- `docs/design/system/firelight-quests.md`;
- `docs/design/previews/firelight/quests/`.

**Проверки:**
- `vitest` — 844 теста клиента, включая `fx.test.ts`: эффекты, события, листы, ряды кадров, упаковка в атлас;
- `tsc -p packages/client` и `tsc -p packages/client/test` проходят без ошибок;
- `sh tools/art/firelight/p13/build.sh` на чистой копии `main` с пакетом пересобирает все файлы байт в байт.

## Как подключить

### 1. Диалог квеста

`screens.ts → showQuest` и `showReforge`:
1. Окну — класс `fl-dialog`.
2. Вместо `portrait(who)` (спрайт ×3) — `el('div', 'fl-portrait <npc> <mood> speaks')`. Здесь `npc` — `ghost`, `wandmaker`, `blacksmith` или `imp`.
3. Настроение — `quest.json → portraits.mood`, по реплике `talkWith*`:
   - **`calm`** — приветствие и напоминание;
   - **`pleased`** — `completed` и выдача награды;
   - **`annoyed`** — `noGold`, `noPickaxe`, `noBlood`, `busy` и отказ.
4. Крысиный король портрета не получил: остаётся спрайт.

Награды в `pd-reward`: ячейка `el('div', 'fl-reward-slot <вид>', item)`. Вид — `ghost-weapon`, `ghost-armor`, `wand-battle`, `wand-utility`, `reforge` или `ring`; в 3D это `quest.reward.<giver>.<вид>`.

### 2. Карточка задания и значок в HUD

**Карточка в журнале** (`meta.ts journalEntries`): `.fl-quest` с `.fl-qicon.badge` (строка 1 `icons.png` — лицо дарителя) и `.fl-qsteps`. Цели — `quest.json → goals`.

Счёт клиент берёт из рюкзака. В ядре он уже есть:

| Квест | Что считать |
|---|---|
| руда | `quest.ore`: `qty` из 15 (`ORE_WANTED`) |
| жетоны | `quest.token`: из 8 или 6 (`TOKENS_WANTED`) |
| кровь | `bloody` у кирки |
| пыль, роза, череп, рыба | предмет есть или нет |
| проклятие | 1, когда побеждено |

**Значок в HUD:** `.fl-hud-quest` в `pd-hud-side` — лицо и «9/15» — пока квест взят и не сдан.

### 3. Кузнец

- Кирка уже есть в части 9 (`held.json pickaxe`, стиль blunt).
- Эффект `mined` → `quest.ore.hit` на грани стены, затем `quest.ore.nugget`.
- Эффект `smith` (перековка) → `quest.anvil`.
- Горн — петля `quest.forge` у кузнеца (`ambient.npc.blacksmith`): свет `#ff8a3a`, flicker, радиус 4.

### 4. Места

`ambient` — какую петлю держать, пока её причина в поле зрения. Петли и вспышки: аддитивные в пакете `add`, остальные в `normal`; свет — из `light`.

| Место | Что показать |
|---|---|
| колодец | `ambient.terrain.WELL[вода]`. Вода — `WellWater` комнаты: в `level` она есть, клиенту нужна по клетке; при сети отдать вместе с картой |
| котёл | `place.pot.amber` |
| постамент | `place.pedestal`, а на куче приза — `place.prize` |
| табличка | `place.sign` |
| книжная полка | `place.shelf` раз в 4–7 с, пыль — `place.dust`, по одной на 4 клетки |
| высокая трава в саду | `place.firefly`, одна на 6 клеток |
| роса | `place.dew` |

Использование колодца: эффект `well` → `place.well.<water>.beam`.

Оживление статуи (`statue.wake`): `place.statue.wake`, потом `place.statue.dust`, потом спрайт `statue`.

Карточка «что это»: `.fl-place` с `.fl-picon` (`--pi` — индекс в `places.json icons.order`) и текст `places.json cards`. Её открывают «Осмотреть» на клетке и журнал (`.fl-codex`).

### 5. Малая магия

`moments` → эффект:

| Ключ | Эффект |
|---|---|
| `flock` | `minor.sheep.appear` на каждой клетке |
| `faded` (овца) | `minor.sheep.vanish` |
| `mirrored` | `minor.mirror`, петлёй на образе |
| `teleported` | `status.teleport.in` (и `.out` там, откуда ушёл) |
| `thorns` | `minor.thorns` |
| `glyph` | `glyph.<имя глифа>` — все 11 |
| `burst.purity.wave` | `minor.purity` вместе с `gas.purity` |

**Шипы.** У кольца шипов сейчас нет своего события: ядро шлёт `hurt` атакующему (`combat.ts` 188–194). Клиент может узнать его так: удар по герою с кольцом шипов, и `hurt` атакующему в том же ходу.

**Состояния** — петли `ambient.state`:
- `levitating` → `minor.levitate`;
- `slowed` → `status.slow`;
- `poisoned` → `status.poison`;
- сон → `minor.sleep`;
- зеркальный образ → `minor.mirror`.

**Тревога.** `trap.alarm` играет `then: minor.alarm` — колокол над ловушкой.

### 6. Боссы

**Полоска.** `.fl-bossbar.<босс>` с `--v` (здоровье / максимум) и `--was` (след раны) под HUD.
- Показывать с конца `bossCards.timeline.out`, пока босс жив и виден.
- Имя и подзаголовок — из `bossCards`.

Постановка по боссам:
- **DM-300.** Стадия — `fx.json → bosses.dm300.stages` по доле здоровья: петля поверх спрайта, ×1,3. Пар — `arena.steam` у каждой третьей стены арены. `died` DM-300 → `arena.dm300.explode`, затем 6 штук `arena.dm300.debris` (ряд — случайный: 0, 1 или 2).
- **Тенгу.** `jumped` → `arena.tengu.smoke` в `from` и в `to`. Где сюрикен Тенгу (`missile`, `sprite 15`) упал на пол — `arena.tengu.mark`, ряд 0–2, лежит 20 с.
- **Король.** В поле зрения — `arena.throne` (свет трона). `yell` `line: 'summon'` → `arena.king.undead` на клетках, где появились мёртвые гномы. Смерть: спрайт поворачивается на 90° за 4 шага (600 мс), затем `arena.king.crown`.
- **Жижа.** Удар по ней: `bosses.goo.squash` — масштаб спрайта при неподвижных ногах — и `arena.goo.splash`. Смерть — `arena.goo.pop` с лужей на 8 с.
- **Йог.** `arena.yog.glint` раз в 2,2–3,6 с. Новый кулак → `arena.yog.fist.rotting` или `.burning` на его клетке. Смерть: `arena.yog.death`, затем `arena.yog.amulet` над Амулетом.

**Событий, которых ядро не шлёт, нет.** Ключи `died.<kind>`, `hurt.goo`, `spawn.<fist>`, `statue.wake` — это то, что клиент уже видит: `died` с `kind`, `hurt` по мобу этого вида, новый моб-кулак, статуя, ставшая врагом. Их нужно назвать в `eventKey`.

### 7. Атлас и проверки

- `fxsheet.ts ATLAS` и `fx.test.ts` — уже в пакете.
- После подключения проверить в игре на телефоне:
  - диалог каждого из 4 NPC;
  - журнал с задачами;
  - 5 боссов: полоска и постановка;
  - колодцы, котёл, сад, библиотеку, статую.

## Превью

`docs/design/previews/firelight/quests/` (компактно, ≈9 МБ в архиве):
- `en|ru-375x812/`, `en|ru-1280x800/` — 12 экранов:
  - диалоги 4 NPC;
  - журнал заданий;
  - полоска 5 боссов на их аренах;
  - карточка места;
  - кодекс мест.
- `3d/` — 22 сцены при камере 70°, телефон и ПК: кузнец, награды, колодцы, котёл, сад, статуя, библиотека, малая магия, статусы, глифы (2), DM-300 (3 стадии и смерть), Тенгу, Король (и падение), Жижа (и смерть), Йог (и смерть с Амулетом).
- `anim/` — 13 GIF 3D-сцен.
- `sheets/` — 5 GIF всех эффектов по группам (`legend.json` — что в какой клетке) и портреты ×4.
