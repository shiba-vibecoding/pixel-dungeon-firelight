# Как выложить игру

Игра состоит из двух частей:

- **клиент** — статический сайт, его отдаёт GitHub Pages этого репозитория
  (`https://shiba-vibecoding.github.io/pixel-dungeon-telegram/`, тот же адрес,
  что был у Java-версии: бот открывает новую игру без перенастройки);
- **сервер** — Cloudflare Worker `pd-coop` с Durable Objects: комнаты
  кооператива, рекорды «Подземелья дня», кошельки Пиксель-Марта и вебхук бота
  (оплата звёздами, `/start`, `/paysupport`, `/terms`).

Обе части бесплатны (у Cloudflare 100 000 запросов к Durable Objects в сутки).
Одиночная игра работает и без сервера.

Команды ниже — для PowerShell, из папки `C:\pixel_dungeon\pd-ts`. Токен бота
и секреты вводятся только в консоли и никуда не пишутся.

## 1. Сервер (Cloudflare)

1. Войдите в Cloudflare (откроется браузер):

   ```powershell
   npx wrangler login
   ```

2. Выложите сервер:

   ```powershell
   npm run deploy:server
   ```

   Wrangler напечатает адрес вида `https://pd-coop.<поддомен>.workers.dev`.
   В браузере по нему должно быть написано `Pixel Dungeon co-op server`.

3. Секреты сервера. Токен — тот же, что у бота (@BotFather → `/mybots` → бот →
   API Token). Секрет вебхука — случайная строка до 256 символов из `A-Z a-z 0-9 _ -`
   (не из примеров), он нужен ещё в шаге 2. Сгенерировать:
   `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`.

   ```powershell
   npx wrangler secret put BOT_TOKEN --config packages/server/wrangler.jsonc
   npx wrangler secret put WEBHOOK_SECRET --config packages/server/wrangler.jsonc
   ```

## 2. Вебхук бота

У бота один вебхук. Сейчас его принимает Worker Java-версии
(`telegram-pixel-dungeon-gamebot`). Переводим на новый сервер: он умеет то же
(отвечает кнопкой «Играть») плюс оплату и команды.

```powershell
node packages/server/scripts/set-webhook.mjs https://pd-coop.<поддомен>.workers.dev --new-secret
```

С `--new-secret` скрипт сам придумает секрет вебхука и запишет его на сервер
(`npx wrangler secret put WEBHOOK_SECRET` тогда не нужен). Без флага он спросит
секрет, заданный вручную. Токен бота спрашивается скрыто. В конце скрипт стучится
на сервер с секретом и пишет `Check: the server accepts this secret`, если всё
сходится. Он напишет также `Webhook: https://pd-coop…/telegram/webhook`. Проверка: напишите
боту что угодно — он ответит фразой и кнопкой «Играть». Старый Worker после
этого можно удалить в панели Cloudflare.

## 3. Клиент (GitHub Pages)

1. На GitHub: **Settings → Secrets and variables → Actions → Variables** —
   добавьте три переменные:
   - `PD_SERVER_URL` = `wss://pd-coop.<поддомен>.workers.dev`
   - `PD_TG_APP_LINK` = `https://t.me/pixel_dungeon_gamebot/pixel_dungeon`
   - `PD_PUBLISH` = `true` — без неё сборка только тестирует и ничего не выкладывает.
2. **Settings → Pages → Source** должен стоять на **GitHub Actions** (так было и
   для Java-версии).
3. **Actions → CI and deploy → Run workflow** (ветка `main`). Через пару минут
   по адресу GitHub Pages откроется новая игра — и в боте тоже.

Сохранения Java-версии в новую не переносятся: формат другой. Сама Java-версия
лежит в ветке `java-gwt`; вернуть её — запустить там старую сборку.

Если добавить секреты `CLOUDFLARE_API_TOKEN` (право «Edit Cloudflare Workers») и
`CLOUDFLARE_ACCOUNT_ID`, сервер будет обновляться сам при каждом push в `main`.

## 4. Telegram

- Картинка мини-приложения 640×360: `docs/design/bot-cover-640x360.png`
  (@BotFather → `/myapps` → приложение → Edit Photo). Перерисовать:
  `python packages/client/scripts/bot-cover.py "Другая подпись"`.
- Политика конфиденциальности: `https://shiba-vibecoding.github.io/pixel-dungeon-telegram/privacy.html`
  (@BotFather → бот → Bot Settings → Privacy Policy).
- Оплата звёздами в Telegram отдельно не включается: звёзды работают у любого бота.
  Вывод заработанных звёзд — @BotFather → бот → Balance (через Fragment, в TON).

Приглашения: «Играть с друзьями» отправляет ссылку
`https://t.me/pixel_dungeon_gamebot/pixel_dungeon?startapp=room_<код>`.

## Проверка после выкладки

- Бот отвечает на сообщение кнопкой «Играть», команды `/paysupport` и `/terms` работают.
- В игре: «Играть с друзьями» — друг заходит по ссылке, вы видите друг друга.
- «Подземелье дня» → конец забега → таблица дня с вашим местом.
- Пиксель-Март → купить облик → Telegram показывает оплату звёздами.
  Проверить можно на самом дешёвом товаре и вернуть звёзды через `/paysupport`
  (возврат делает владелец бота: Bot API `refundStarPayment`).

## Запуск на своём компьютере

```powershell
npm install
npm run server   # сервер: ws://127.0.0.1:8787
npm run dev      # клиент: http://127.0.0.1:5173
```

Два игрока в одном браузере: откройте две вкладки
`http://127.0.0.1:5173/?room=test&player=a&name=Алиса` и
`http://127.0.0.1:5173/?room=test&player=b&name=Боб&hero=mage`.
В режиме разработки покупки в Пиксель-Марте проходят без оплаты.
