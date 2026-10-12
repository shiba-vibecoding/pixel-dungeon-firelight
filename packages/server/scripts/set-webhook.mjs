// Points the bot's webhook at this server and sets its commands.
//
//   node packages/server/scripts/set-webhook.mjs https://pd-coop.<subdomain>.workers.dev
//
// The bot token and the webhook secret are asked for with hidden input (or taken
// from BOT_TOKEN / WEBHOOK_SECRET in the environment), never from the command
// line, so they stay off the screen and out of the shell's history. Telegram
// keeps one webhook per bot: this one replaces the old version's.

import { createInterface } from 'node:readline';

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (text) => {
      if (text.startsWith(question)) process.stdout.write(question);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

const SERVER_URL = process.argv[2] ?? process.env.SERVER_URL;
if (!SERVER_URL) {
  console.error('Usage: node packages/server/scripts/set-webhook.mjs https://pd-coop.<subdomain>.workers.dev');
  process.exit(1);
}
if (process.env.BOT_TOKEN) console.log('Using BOT_TOKEN from the environment.');
if (process.env.WEBHOOK_SECRET) console.log('Using WEBHOOK_SECRET from the environment.');
const BOT_TOKEN = process.env.BOT_TOKEN || (await askHidden('Bot token (hidden): '));
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || (await askHidden('Webhook secret (hidden): '));
if (!BOT_TOKEN || !WEBHOOK_SECRET) {
  console.error('Both the bot token and the webhook secret are needed.');
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
  if (!body.ok) {
    console.error(`${method}: ${body.description}`);
    if (response.status === 401) {
      console.error('Telegram does not accept this bot token: it is mistyped or was revoked in @BotFather.');
      if (process.env.BOT_TOKEN) console.error('It came from $env:BOT_TOKEN; clear it with: Remove-Item Env:BOT_TOKEN');
    }
    process.exit(1);
  }
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
