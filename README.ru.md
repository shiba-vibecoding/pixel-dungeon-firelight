<p align="right"><a href="README.md">English</a> · <b>Русский</b></p>

<p align="center"><img src="docs/github/header-ru.png" alt="Pixel Dungeon: Firelight — у костра у входа в подземелье" width="100%"></p>

<p align="center">
  <a href="https://t.me/pixel_dungeon_gamebot"><img src="docs/github/badge-play-ru.png" alt="Играть в Telegram" height="44"></a>
  <a href="https://github.com/watabou/pixel-dungeon"><img src="docs/github/badge-fork-ru.png" alt="Форк Pixel Dungeon" height="44"></a>
  <a href="LICENSE"><img src="docs/github/badge-gpl-ru.png" alt="GPL-3.0" height="44"></a>
  <img src="docs/github/badge-daily-ru.png" alt="Подземелье дня" height="44">
</p>

# Pixel Dungeon: Firelight — «У костра»

**Firelight** — форк [Pixel Dungeon](https://github.com/watabou/pixel-dungeon) от Watabou, пересобранный для Telegram. Каждый забег начинается у костра на поверхности, а внизу ждёт оригинальное подземелье, освещённое огнём.

- **Играть:** [@pixel_dungeon_gamebot](https://t.me/pixel_dungeon_gamebot) в Telegram.
- **Основа:** оригинальный Pixel Dungeon 1.9.2a. Правила перенесены точно: те же четыре героя, предметы, монстры и боссы. Firelight — это прокачанная ванила без горы лишних предметов. Новое будет приходить по одной идее, и каждую мы делаем по-своему.

## Что добавляет Firelight
- **Честное подземелье дня.** Одно подземелье на всех каждый день и одна попытка, которая идёт в зачёт. Сид дня — секрет сервера, поэтому пройти его заранее нельзя.
- **Забеги проверяет сервер.** Он переигрывает каждый забег по ходам игрока: смерть не отменить перезагрузкой, а правки на устройстве откатываются. Забеги попадают на доски дня, недели и всех времён, за первые места дают кубки, есть серия дней с заморозками.
- **Привал.** Главный экран — твой герой у костра.
- **Современное управление с телефона:**
  - умная камера, которая не сбрасывает обзор при ходьбе;
  - вопрос перед шагом на известную ловушку и перед тем, как выпить неизвестное зелье, когда рядом враг;
  - повторное нажатие на слот стреляет по отмеченной цели;
  - «Памятка» со скрытыми правилами оригинала.
- **Скоро:**
  - объёмный мир HD-2D на Three.js: факелы, огонь и магия дают настоящий свет и тени;
  - воксельные герои и монстры из оригинального пиксель-арта;
  - своя музыка и звуки;
  - матные реплики героя после убийств.

## Репозиторий и ветки
- **`main`** — Firelight, **полная переписка оригинала на TypeScript**. В неё входят:
  - детерминированное ядро правил;
  - веб-клиент (Telegram Mini App);
  - сервер на Cloudflare Workers.
- **`master`** — нетронутый оригинальный код Watabou **на Java**, точка отсчёта форка.

| Папка | Что это |
| --- | --- |
| `packages/core` | Вся игра на чистом детерминированном TypeScript. Мир — обычный JSON, вся математика целочисленная, поэтому телефон и сервер всегда считают одинаково. |
| `packages/client` | Mini App: карта на canvas, а окна, интерфейс и Привал на HTML (дизайн-система в `docs/design/system`). |
| `packages/server` | Cloudflare Worker: по Durable Object на игрока и на каждую доску. Он отвечает за вход через Telegram, проверку забегов, доски, почту и отчёты о проблемах. |

```bash
npm install
npm test            # vitest
npm run typecheck
npm run server      # сервер на http://127.0.0.1:8787
npm run dev         # клиент на http://127.0.0.1:5173
```

Выкладка описана в [DEPLOY.md](DEPLOY.md).

## Авторы и лицензия
Pixel Dungeon создал Watabou (Олег Доля), лицензия GPL-3.0. Firelight следует правилам оригинала и использует его графику. Проект распространяется под GPL-3.0-or-later (см. [LICENSE](LICENSE)).

Прошлое издание проекта на контенте Shattered Pixel Dungeon (Evan Debenham, GPL-3.0) хранится в ветке `archive/shattered-2.4` [прошлого репозитория](https://github.com/shiba-vibecoding/pixel-dungeon-telegram).

Арт интерфейса (Привал, окна, значки) сделан в собственной дизайн-системе проекта «Pixel Dungeon UI». Шрифт Galmuri распространяется по лицензии SIL OFL 1.1.
