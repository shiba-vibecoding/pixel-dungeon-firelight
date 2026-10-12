# Как выложить игру

Игра состоит из двух частей:

- **клиент** — статический сайт (HTML + JS + картинки), его отдаёт GitHub Pages;
- **сервер кооператива** — Cloudflare Worker с Durable Objects: одна «комната» на отряд.
  Одиночная игра и «Подземелье дня» работают и без сервера.

Обе части бесплатны. GitHub Pages бесплатен для публичных репозиториев.
На бесплатном тарифе Cloudflare Durable Objects дают 100 000 запросов в сутки:
подключение к комнате — один запрос, а ходы внутри подключения считаются как
один запрос на 20 сообщений, то есть это порядка двух миллионов ходов в сутки.
Простаивающие комнаты «засыпают» и ничего не стоят.

## 1. Сервер кооператива (Cloudflare)

1. Зарегистрируйтесь на <https://dash.cloudflare.com> (бесплатный аккаунт).
2. В папке `pd-ts` войдите в аккаунт — откроется браузер:

   ```bash
   npx wrangler login
   ```

3. Выложите сервер:

   ```bash
   npm run deploy:server
   ```

   В конце wrangler напечатает адрес вида `https://pd-coop.<ваш-поддомен>.workers.dev`.
   Откройте его в браузере — должно быть написано `Pixel Dungeon co-op server`.
   Адрес для клиента тот же, но со схемой `wss://`:
   `wss://pd-coop.<ваш-поддомен>.workers.dev`.

4. Передайте серверу токен бота, чтобы игроки из Telegram входили под своими
   именами и никто не мог выдать себя за другого (токен берётся у @BotFather):

   ```bash
   npx wrangler secret put BOT_TOKEN --config packages/server/wrangler.jsonc
   ```

   Игроков из обычного браузера сервер пускает как гостей, пока в
   `packages/server/wrangler.jsonc` стоит `"ALLOW_GUESTS": "true"`.

## 2. Клиент (GitHub Pages)

1. Создайте на GitHub пустой репозиторий, например `pixel-dungeon-coop`.
2. Отправьте туда код:

   ```bash
   git remote add origin https://github.com/<вы>/pixel-dungeon-coop.git
   git push -u origin main
   ```

3. В репозитории: **Settings → Pages → Source: GitHub Actions**.
4. **Settings → Secrets and variables → Actions → Variables** — добавьте:
   - `PD_SERVER_URL` = `wss://pd-coop.<ваш-поддомен>.workers.dev`
   - `PD_TG_APP_LINK` = ссылка на мини-приложение, например
     `https://t.me/pixel_dungeon_gamebot/coop` (см. ниже)
5. **Actions → CI and deploy → Run workflow** (или любой push в `main`).
   Через минуту игра откроется по адресу `https://<вы>.github.io/pixel-dungeon-coop/`.

Если ещё добавить секреты `CLOUDFLARE_API_TOKEN` (токен с правом «Edit Cloudflare
Workers») и `CLOUDFLARE_ACCOUNT_ID`, сервер тоже будет обновляться сам при каждом push.

## 3. Telegram

**Вариант А (рекомендую): отдельное мини-приложение у того же бота.**
Старая версия на Java остаётся как есть, а новая живёт рядом.

1. @BotFather → `/newapp` → выберите `@pixel_dungeon_gamebot`.
2. Название, описание, картинка 640×360.
3. Web App URL — адрес из GitHub Pages.
4. Короткое имя, например `coop`. Ссылка на игру будет
   `https://t.me/pixel_dungeon_gamebot/coop` — её же укажите в `PD_TG_APP_LINK`.

**Вариант Б: заменить старую версию.** @BotFather → `/myapps` → бот →
Edit Web App URL → адрес из GitHub Pages; `PD_TG_APP_LINK` =
`https://t.me/pixel_dungeon_gamebot/pixel_dungeon`.

Приглашения: кнопка «Играть с друзьями» (и «Позвать друга» в меню) отправляет
ссылку вида `https://t.me/<бот>/<приложение>?startapp=room_<код>`. Друг открывает
её, выбирает героя и нажимает «Присоединиться».

## Запуск на своём компьютере

```bash
npm install
npm run server   # сервер кооператива: ws://127.0.0.1:8787
npm run dev      # клиент: http://127.0.0.1:5173
```

Два игрока в одном браузере: откройте две вкладки
`http://127.0.0.1:5173/?room=test&player=a&name=Алиса` и
`http://127.0.0.1:5173/?room=test&player=b&name=Боб&hero=mage`.
