import type { HeroClass, Offer } from '@pd/core';
import { type Category, type Item, itemById, itemName } from '../../client/src/catalog';

/*
 * What an invoice says an offer is, in the buyer's language. Written on the
 * server, not taken from the client's request: the invoice is what Telegram
 * shows the buyer and keeps on their receipt, so a client must not be able
 * to put its own words there. The names follow the shop's (client i18n.ts).
 */

export interface InvoiceText {
  title: string;
  description: string;
}

interface Words {
  look: Record<HeroClass, string>;
  skin: Record<string, [name: string, info: string]>;
  effect: Record<string, [name: string, info: string]>;
  frame: Record<string, string>;
  frameWord: string;
  frameInfo: string;
  effectWord: string;
  patron: InvoiceText;
  tip: InvoiceText;
}

const EN: Words = {
  look: { warrior: 'Warrior look', mage: 'Mage look', rogue: 'Rogue look', huntress: 'Huntress look' },
  skin: {
    ash: ['Ashen', 'Armour gone grey with ash, the hair too.'],
    royal: ['Royal', 'Gold for metal and light cloth, purple for the rest.'],
    shadow: ['Shadow', 'Dark violet, hair near black.'],
  },
  effect: {
    sparks: ['Sparks', 'Your blows strike gold sparks.'],
    fireflies: ['Fireflies', 'Fireflies drift around you.'],
    snow: ['Snowfall', 'Snow falls about you. Winter only.'],
  },
  frame: { bronze: 'Bronze', gold: 'Gold', shadow: 'Shadow', patron: 'Patron' },
  frameWord: 'Frame',
  frameInfo: 'A frame for your portrait, seen by the party.',
  effectWord: 'Effect',
  patron: { title: 'Patron', description: 'A month’s subscription: a star by your name, the «Patron» portrait frame and the «Patron of the arts» badge. Looks only.' },
  tip: { title: 'Treat the developer', description: 'Thank you for playing! A treat changes nothing in the game, but it keeps it growing.' },
};

const RU: Words = {
  look: { warrior: 'Облик воина', mage: 'Облик мага', rogue: 'Облик разбойника', huntress: 'Облик охотницы' },
  skin: {
    ash: ['Пепельный', 'Броня, посеревшая от пепла, и пепельные волосы.'],
    royal: ['Королевский', 'Металл и светлая ткань в золото, цветное в пурпур.'],
    shadow: ['Теневой', 'Тёмный фиолетовый, волосы почти чёрные.'],
  },
  effect: {
    sparks: ['Искры', 'Ваши удары высекают золотые искры.'],
    fireflies: ['Светлячки', 'Вокруг вас кружат светлячки.'],
    snow: ['Снегопад', 'Вокруг вас падает снег. Только зимой.'],
  },
  frame: { bronze: 'Бронза', gold: 'Золото', shadow: 'Тень', patron: 'Покровитель' },
  frameWord: 'Рамка',
  frameInfo: 'Рамка вашего портрета, её видит отряд.',
  effectWord: 'Эффект',
  patron: { title: 'Покровитель', description: 'Подписка на месяц: звезда у имени, рамка портрета «Покровитель» и значок «Меценат». Только облик.' },
  tip: { title: 'Угостить разработчика', description: 'Спасибо, что играете! Угощение ничего не меняет в игре, но помогает ей расти.' },
};

/** Russian for the languages the client shows in Russian; English otherwise. */
export const speaksRussian = (language?: string): boolean => /^(ru|uk|be|kk)/i.test(language ?? '');

/** The invoice's title (at most 32 characters, Telegram's limit) and description (255). */
export function invoiceText(offer: Offer, language?: string): InvoiceText {
  const w = speaksRussian(language) ? RU : EN;
  const fit = (text: InvoiceText): InvoiceText => ({ title: text.title.slice(0, 32), description: text.description.slice(0, 255) });
  switch (offer.kind) {
    case 'skin': {
      const [name, info] = w.skin[offer.skin!] ?? [offer.sku, ''];
      return fit({ title: `${w.look[offer.heroClass!]}: ${name}`, description: info || name });
    }
    case 'effect': {
      const [name, info] = w.effect[offer.effect!] ?? [offer.sku, ''];
      return fit({ title: `${w.effectWord}: ${name}`, description: info || name });
    }
    case 'frame':
      return fit({ title: `${w.frameWord}: ${w.frame[offer.frame!] ?? offer.sku}`, description: w.frameInfo });
    case 'patron':
      return fit(w.patron);
    case 'tip':
      return fit({ title: `${w.tip.title} ${offer.stars}★`, description: w.tip.description });
  }
}

const CLASS_WORD: Record<HeroClass, [ru: string, en: string]> = { warrior: ['Воин', 'Warrior'], mage: ['Маг', 'Mage'], rogue: ['Разбойник', 'Rogue'], huntress: ['Охотница', 'Huntress'] };

const CATEGORY_WORD: Record<Category, [ru: string, en: string]> = {
  look: ['Облик', 'Look'], campfire: ['Костёр', 'Campfire'], hat: ['Шапка', 'Hat'], pet: ['Питомец', 'Pet'], trail: ['След', 'Trail'],
  killfx: ['Эффект убийства', 'Kill effect'], deathfx: ['Эффект гибели', 'Death effect'], numbers: ['Числа урона', 'Damage numbers'],
  quips: ['Набор реплик', 'Quip pack'], decor: ['Украшение лагеря', 'Camp decoration'], frame: ['Рамка профиля', 'Profile frame'],
  title: ['Титул', 'Title'], namecolor: ['Цвет имени', 'Name colour'], photoframe: ['Рамка для фото', 'Photo frame'], sticker: ['Наклейка', 'Sticker'],
  bundle: ['Набор', 'Bundle'], pass: ['Пропуск сезона', 'Season pass'],
};

/** What an invoice says a catalogue item is: its name, and what it is, in the buyer's language; a gift says so. Looks only: never the game. */
export function itemInvoiceText(entry: Item, language?: string, gift = false): InvoiceText {
  const ru = speaksRussian(language);
  const lang = ru ? 'ru' : 'en';
  // A look is of a class: the receipt says whose (the card names it by its colour alone).
  const name = entry.heroClass ? `${CLASS_WORD[entry.heroClass][ru ? 0 : 1]}: ${itemName(entry, lang)}` : itemName(entry, lang);
  const word = CATEGORY_WORD[entry.category][ru ? 0 : 1];
  const parts = entry.items?.map((id) => itemById(id)).filter((part): part is Item => part !== undefined).map((part) => itemName(part, lang));
  const what = entry.category === 'pass'
    ? (ru ? 'Платная дорожка сезона: награды за уровни. Только облик.' : 'The season’s paid track: a reward at every level. Looks only.')
    : parts && parts.length > 0 ? `${ru ? 'В наборе' : 'Includes'}: ${parts.join(', ')}.` : `${word}. ${ru ? 'Только облик, на игру не влияет.' : 'A look only: it changes nothing in the game.'}`;
  const prefix = gift ? (ru ? 'Подарок: ' : 'Gift: ') : '';
  const fit = (text: InvoiceText): InvoiceText => ({ title: text.title.slice(0, 32), description: text.description.slice(0, 255) });
  return fit({ title: `${prefix}${name}`, description: gift ? `${ru ? 'Подарок другу. ' : 'A gift for a friend. '}${what}` : what });
}
