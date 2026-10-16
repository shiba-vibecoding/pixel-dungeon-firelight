import type { Category, Earn, Lang, Rarity } from './catalog';
import { lang } from './i18n';

/*
 * The texts of Pixel-Mart's storefront (storeui.ts): Russian and English side by side, since the storefront is one window and the strings
 * are few. Items carry their own names (catalog.ts); the designer's shop strings (strings.json) are read by flart.ts flStr.
 */

interface Words {
  title: string;
  home: string;
  seasonShelf: string;
  rarity: Record<Rarity, string>;
  category: Record<Category, string>;
  classic: string;
  owned: string;
  worn: string;
  wear: string;
  takeOff: string;
  tryOn: string;
  tryOff: string;
  buy: string;
  gift: string;
  close: string;
  back: string;
  nothing: string;
  closedNote: string;
  starsNote: string;
  bundleHas: (n: number, value: number) => string;
  bundleSave: (pct: number) => string;
  earn: (earn: Earn) => string;
  earnOnly: string;
  decorSet: (n: number, max: number) => string;
  thanks: string;
  failed: string;
  expired: string;
  alreadyOwned: string;
  giftTitle: string;
  giftText: string;
  giftId: string;
  giftIdHint: string;
  giftById: string;
  giftByLink: string;
  giftBadId: string;
  giftHas: string;
  giftSent: string;
  giftLinkNote: string;
  giftAccepted: string;
  giftLetter: string;
  giftLetterText: (from: string | undefined, item: string) => string;
  giftTaken: string;
  passTitle: string;
  passSub: (season: number) => string;
  passLevel: (level: number) => string;
  passXp: (into: number, need: number) => string;
  passMax: string;
  passFree: string;
  passPaid: string;
  passBuy: string;
  passBought: string;
  passHow: string;
  passClaim: string;
  passClaimed: string;
  passGot: (n: number) => string;
  passNothing: string;
  passLocked: string;
  passDevXp: string;
  starterTitle: string;
  starterText: string;
  starterNote: string;
  quipNote: string;
  photoNote: string;
  stickerTap: string;
  profileCard: (cls: string) => string;
  profileNote: string;
  slotNames: { look: string; hat: string; pet: string; fire: string; trail: string };
  sampleLine: string;
  nameSample: string;
  classes: Record<string, string>;
  hasNot: string;
  loading: string;
}

const EN: Words = {
  title: 'Pixel-Mart',
  home: 'Home',
  seasonShelf: 'Season pass',
  rarity: { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' },
  category: {
    look: 'Hero look', campfire: 'Campfire style', hat: 'Hat', pet: 'Pet', trail: 'Footstep trail', killfx: 'Kill effect', deathfx: 'Death effect',
    numbers: 'Damage numbers', quips: 'Quip pack', decor: 'Camp decoration', frame: 'Profile frame', title: 'Title', namecolor: 'Name colour',
    photoframe: 'Photo frame', sticker: 'Sticker', bundle: 'Bundle', pass: 'Season pass',
  },
  classic: 'Skins, effects, Patron',
  owned: 'Owned',
  worn: 'Worn',
  wear: 'Wear',
  takeOff: 'Take off',
  tryOn: 'Try on',
  tryOff: 'Take off',
  buy: 'Buy',
  gift: 'Gift',
  close: 'Close',
  back: 'Back',
  nothing: 'Nothing here yet.',
  closedNote: 'Purchases open inside Telegram.',
  starsNote: 'Paid in Telegram Stars. A look only: it changes nothing in the game.',
  bundleHas: (n, value) => `${n} items, worth ${value}`,
  bundleSave: (pct) => `Save ${pct}%`,
  earn: (e) => {
    if (e.by === 'pass') return `Season pass, level ${e.level}${e.track === 'paid' ? ' (paid track)' : ''}`;
    if (e.by === 'streak') return `A ${e.days}-day streak`;
    if (e.by === 'badge') return 'A badge won in the dungeon';
    if (e.by === 'patron') return 'Patrons get it';
    if (e.by === 'honour') return 'An honour of the competitions: won, never sold';
    return `Top ${e.place} of the ${e.kind === 'daily' ? 'day' : 'week'}`;
  },
  earnOnly: 'Earned, not sold',
  decorSet: (n, max) => `${n} of ${max} in the camp`,
  thanks: 'Thank you! It is yours.',
  failed: 'The purchase did not go through. Nothing was charged.',
  expired: 'Reopen the game from Telegram to buy.',
  alreadyOwned: 'You have it already.',
  giftTitle: 'A gift for a friend',
  giftText: 'Enter your friend’s Telegram ID and the gift comes to their mail in the game. Or get a link and send it yourself: whoever opens it first gets the gift. A gift costs what the thing costs.',
  giftId: 'Friend’s Telegram ID',
  giftIdHint: 'digits only',
  giftById: 'Gift by ID',
  giftByLink: 'Get a link',
  giftBadId: 'That is not a Telegram ID.',
  giftHas: 'Your friend has it already.',
  giftSent: 'Sent! It waits in your friend’s mail.',
  giftLinkNote: 'Paid. The bot has sent you the link to pass on.',
  giftAccepted: 'A gift is in your mail!',
  giftLetter: 'A gift',
  giftLetterText: (from, item) => `${from ?? 'A friend'} sends you a gift: ${item}. Claim it to wear it.`,
  giftTaken: 'That gift has been taken already.',
  passTitle: 'Season pass',
  passSub: (season) => `Season ${season}: 30 levels, XP from your checked runs`,
  passLevel: (level) => `Level ${level}`,
  passXp: (into, need) => `${into} / ${need} XP`,
  passMax: 'Every level reached',
  passFree: 'Free',
  passPaid: 'Pass',
  passBuy: 'Get the pass',
  passBought: 'Pass unlocked',
  passHow: 'XP comes from runs the server has checked: depth, kills, wins and the daily dungeon. At most 500 a day. Nothing in the pass changes a run.',
  passClaim: 'Claim',
  passClaimed: 'Claimed',
  passGot: (n) => (n === 1 ? 'Reward claimed.' : `${n} rewards claimed.`),
  passNothing: 'Nothing to claim yet.',
  passLocked: 'Locked',
  passDevXp: '+500 XP (development build)',
  starterTitle: 'Starter kit',
  starterText: 'A look, a campfire and a trail, for the price of a small thing. Once to an account.',
  starterNote: 'One purchase for the whole account.',
  quipNote: 'Your hero speaks in this voice. The words stay the game’s.',
  stickerTap: 'Tap a sticker to put it on the photo',
  photoNote: 'Stickers go on the photo; the frame is worn from «Photo».',
  profileCard: (cls) => `${cls} · best: depth 21`,
  profileNote: 'How others see you: on the boards, in the party and at the camp.',
  slotNames: { look: 'Look', hat: 'Hat', pet: 'Pet', fire: 'Fire', trail: 'Trail' },
  sampleLine: 'Another one for the fire.',
  nameSample: 'Your name',
  classes: { warrior: 'Warrior', mage: 'Mage', rogue: 'Rogue', huntress: 'Huntress' },
  hasNot: 'Not yours yet',
  loading: 'Loading the shelves…',
};

const RU: Words = {
  title: 'Пиксель-Март',
  home: 'Главная',
  seasonShelf: 'Пропуск сезона',
  rarity: { common: 'Обычный', rare: 'Редкий', epic: 'Эпический', legendary: 'Легендарный' },
  category: {
    look: 'Облик героя', campfire: 'Стиль костра', hat: 'Шапка', pet: 'Питомец', trail: 'След шагов', killfx: 'Эффект победы', deathfx: 'Эффект гибели',
    numbers: 'Числа урона', quips: 'Набор реплик', decor: 'Украшение Привала', frame: 'Рамка профиля', title: 'Титул', namecolor: 'Цвет имени',
    photoframe: 'Рамка для фото', sticker: 'Наклейка', bundle: 'Набор', pass: 'Пропуск сезона',
  },
  classic: 'Раскраски, эффекты, Покровитель',
  owned: 'Есть',
  worn: 'Надето',
  wear: 'Надеть',
  takeOff: 'Снять',
  tryOn: 'Примерить',
  tryOff: 'Снять',
  buy: 'Купить',
  gift: 'Подарить',
  close: 'Закрыть',
  back: 'Назад',
  nothing: 'Пока ничего.',
  closedNote: 'Покупки открываются внутри Telegram.',
  starsNote: 'Оплата звёздами Telegram. Только облик: на игру он не влияет.',
  bundleHas: (n, value) => `${n} предм., на ${value}`,
  bundleSave: (pct) => `Выгода ${pct}%`,
  earn: (e) => {
    if (e.by === 'pass') return `Пропуск сезона, уровень ${e.level}${e.track === 'paid' ? ' (по пропуску)' : ''}`;
    if (e.by === 'streak') return `Серия ${e.days} дн.`;
    if (e.by === 'badge') return 'Значок, добытый в подземелье';
    if (e.by === 'patron') return 'Дарят Покровителям';
    if (e.by === 'honour') return 'Честь соревнований: добывается, не продаётся';
    return `Топ-${e.place} ${e.kind === 'daily' ? 'дня' : 'недели'}`;
  },
  earnOnly: 'Только за заслуги',
  decorSet: (n, max) => `В лагере ${n} из ${max}`,
  thanks: 'Спасибо! Теперь это ваше.',
  failed: 'Покупка не прошла. Деньги не списаны.',
  expired: 'Откройте игру из Telegram заново, чтобы купить.',
  alreadyOwned: 'У вас это уже есть.',
  giftTitle: 'Подарок другу',
  giftText: 'Введите Telegram-ID друга — подарок придёт ему в почту в игре. Или получите ссылку и отправьте её сами: подарок достанется тому, кто откроет её первым. Подарок стоит столько же, сколько вещь.',
  giftId: 'Telegram-ID друга',
  giftIdHint: 'только цифры',
  giftById: 'Подарить по ID',
  giftByLink: 'Получить ссылку',
  giftBadId: 'Это не похоже на Telegram-ID.',
  giftHas: 'У друга это уже есть.',
  giftSent: 'Отправлено! Подарок ждёт друга в почте.',
  giftLinkNote: 'Оплачено. Бот прислал вам ссылку, которую можно переслать.',
  giftAccepted: 'Подарок уже в вашей почте!',
  giftLetter: 'Подарок',
  giftLetterText: (from, item) => `${from ?? 'Друг'} дарит вам подарок: ${item}. Заберите его, чтобы надеть.`,
  giftTaken: 'Этот подарок уже забрали.',
  passTitle: 'Пропуск сезона',
  passSub: (season) => `Сезон ${season}: 30 уровней, опыт — за проверенные забеги`,
  passLevel: (level) => `Уровень ${level}`,
  passXp: (into, need) => `${into} / ${need} оп.`,
  passMax: 'Все уровни пройдены',
  passFree: 'Бесплатно',
  passPaid: 'Пропуск',
  passBuy: 'Купить пропуск',
  passBought: 'Пропуск открыт',
  passHow: 'Опыт даёт забег, проверенный сервером: глубина, убийства, победа и подземелье дня. Не больше 500 в сутки. Ничто в пропуске не меняет забег.',
  passClaim: 'Забрать',
  passClaimed: 'Получено',
  passGot: (n) => (n === 1 ? 'Награда получена.' : `Получено наград: ${n}.`),
  passNothing: 'Забирать пока нечего.',
  passLocked: 'Закрыто',
  passDevXp: '+500 оп. (сборка для разработки)',
  starterTitle: 'Стартовый набор',
  starterText: 'Облик, костёр и след — по цене мелочи. Один раз на аккаунт.',
  starterNote: 'Одна покупка на весь аккаунт.',
  quipNote: 'Герой говорит этим голосом. Слова — из игры.',
  stickerTap: 'Нажмите на наклейку, чтобы положить её на снимок',
  photoNote: 'Наклейки ложатся на снимок; рамку надевают в «Фото».',
  profileCard: (cls) => `${cls} · рекорд: глубина 21`,
  profileNote: 'Так вас увидят другие: в рекордах, в отряде и на Привале.',
  slotNames: { look: 'Облик', hat: 'Шапка', pet: 'Питомец', fire: 'Костёр', trail: 'След' },
  sampleLine: 'Ещё одного — в костёр.',
  nameSample: 'Ваше имя',
  classes: { warrior: 'Воин', mage: 'Маг', rogue: 'Разбойник', huntress: 'Охотница' },
  hasNot: 'Пока не ваше',
  loading: 'Раскладываем полки…',
};

export const S: Words = lang === 'ru' ? RU : EN;
export const L: Lang = lang === 'ru' ? 'ru' : 'en';
