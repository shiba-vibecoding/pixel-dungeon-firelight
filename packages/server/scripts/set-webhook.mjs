// Points the bot's webhook at this server and sets its commands.
//
//   $env:BOT_TOKEN = Read-Host "Bot token"
//   $env:WEBHOOK_SECRET = Read-Host "Webhook secret"
//   $env:SERVER_URL = "https://pd-coop.<subdomain>.workers.dev"
//   node packages/server/scripts/set-webhook.mjs
//
// The values are read from the environment, never from the command line, so they
// stay out of the shell's history. Telegram keeps one webhook per bot: this one
// replaces the old version's.

const { BOT_TOKEN, WEBHOOK_SECRET, SERVER_URL } = process.env;
if (!BOT_TOKEN || !WEBHOOK_SECRET || !SERVER_URL) {
  console.error('Set BOT_TOKEN, WEBHOOK_SECRET and SERVER_URL first (see the top of this file).');
  process.exit(1);
}
if (!/^[A-Za-z0-9_-]{1,256}$/.test(WEBHOOK_SECRET)) {
  console.error('WEBHOOK_SECRET may hold only A-Z, a-z, 0-9, _ and -, up to 256 characters.');
  process.exit(1);
}

async function call(method, params) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const body = await response.json();
  if (!body.ok) throw new Error(`${method}: ${body.description}`);
  return body.result;
}

const url = `${SERVER_URL.replace(/\/+$/, '')}/telegram/webhook`;
await call('setWebhook', {
  url,
  secret_token: WEBHOOK_SECRET,
  allowed_updates: ['message', 'pre_checkout_query'],
  drop_pending_updates: false,
});
for (const [language, commands] of [
  ['', [['start', 'Play'], ['paysupport', 'Help with a purchase'], ['terms', 'Terms of Pixel-Mart']]],
  ['ru', [['start', 'Играть'], ['paysupport', 'Помощь с покупкой'], ['terms', 'Условия Пиксель-Марта']]],
]) {
  await call('setMyCommands', {
    commands: commands.map(([command, description]) => ({ command, description })),
    ...(language ? { language_code: language } : {}),
  });
}
const info = await call('getWebhookInfo', {});
console.log(`Webhook: ${info.url}${info.last_error_message ? ` (last error: ${info.last_error_message})` : ''}`);
console.log('Commands set: /start, /paysupport, /terms.');
