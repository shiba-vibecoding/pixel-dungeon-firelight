# Firelight · часть 1 (айдентика) — перенос

Все файлы лежат по путям репозитория pixel-dungeon-firelight (main). Новые:

- `packages/client/public/assets/brand/` — логотипы, знак, загрузчик и превью ссылки:
  - логотипы `logo-{en,ru}.png` (1×), `@4x`, `-dark@4x`;
  - квадратные `logo-square-{en,ru}.png` (1×), `@4x`;
  - `wordmark.png`, `mark.png` (1×), `mark@4x.png`;
  - `loader.png` и `loader.css`;
  - `og-image.png` (превью ссылки, RU).
- `packages/client/public/favicon-32.png`, `favicon-64.png`, `icons/apple-touch-icon-180.png`, `icons/icon-192.png`, `icons/icon-512.png`.
- `docs/telegram/`: `bot-avatar-512.png`, `bot-welcome.png`, `bot-welcome.gif` (68 КБ), `link-preview-{ru,en}.png`, `channel-pin-{ru,en}.png`.
- `docs/github/`: `header-{ru,en}.png`, `social-preview-{ru,en}.png`, `badge-{play,fork,gpl,daily}-{ru,en}.png`.
- `docs/design/system/firelight.md` — правила айдентики.
- `docs/design/previews/firelight/` — экран загрузки 375×812 и 1280×800 (RU, EN), листы айдентики 1280×800 (RU, EN), `loader-x4.gif`.

Изменённые:
- `docs/design/system/tokens.json` — в конец списка цветов добавлены 10 токенов: `fire-*` и `stone-cold`. Остальное не тронуто.
- `packages/client/index.html` — фавиконки, apple-touch-icon, og:image и twitter:card, подключён `assets/brand/loader.css`.
- `packages/client/public/manifest.webmanifest` — иконки 192, 512 и 180 вместо `banner-title.png`.

## Загрузка в коде (main.ts, экран `.pd-loading`)
Логотип и бегущего воина заменить загрузчиком; полоса, текст и совет остаются:
```ts
const logo = Object.assign(document.createElement('div'), { className: 'fl-loader', role: 'img', ariaLabel: t.gameName });
// RU: под ним подзаголовок
const sub = lang === 'ru' ? Object.assign(document.createElement('p'), { className: 'pd-loading-text', textContent: 'У костра' }) : '';
loading.replaceChildren(logo, sub, progress, progressText, hint);
```
`--fl-s` на телефоне — 3, от 900 px — 6 (`@media (min-width: 900px) { .fl-loader { --fl-s: 6 } }`).

## README
```html
<img src="docs/github/header-ru.png" alt="Pixel Dungeon: Firelight — у костра у входа в подземелье" width="100%">
<a href="https://t.me/…"><img src="docs/github/badge-play-ru.png" alt="Играть в Telegram" height="44"></a>
<img src="docs/github/badge-fork-ru.png" alt="Форк Pixel Dungeon" height="44">
<a href="LICENSE"><img src="docs/github/badge-gpl-ru.png" alt="GPL-3.0" height="44"></a>
<img src="docs/github/badge-daily-ru.png" alt="Подземелье дня" height="44">
```
Social preview: Settings → Social preview → `docs/github/social-preview-ru.png`. Бот: в BotFather поставить аватар `bot-avatar-512.png`, картинку приветствия `bot-welcome.gif` (или `bot-welcome.png`).
