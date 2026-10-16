import type { Category, Earn, Lang, Rarity } from './catalog';
import { lang } from './i18n';

/*
 * The texts of Pixel-Mart's expanded shop (storeui.ts, catalog.ts names): Russian and English side by side, since the storefront is
 * one window and the strings are few. Items carry their own names (catalog.ts).
 */

type Tab = Category | 'photo' | 'pass';

interface Words {
  title: string;
  sub: string;
  tabs: Record<Tab, string>;
  rarity: Record<Rarity, string>;
  category: Record<Category, string>;
  wardrobe: string;
  wardrobeSub: string;
  passButton: string;
  classic: string;
  all: string;
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
  nothingOwned: string;
  closedNote: string;
  starsNote: string;
  placeholderNote: string;
  bundleHas: (n: number, value: number) => string;
  bundleSave: (pct: number) => string;
  earn: (earn: Earn) => string;
  earnOnly: string;
  decorSet: (n: number, max: number) => string;
  thanks: string;
  failed: string;
  expired: string;
  alreadyOwned: string;
  wornToast: string;
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
  tryOnHint: string;
  sampleLine: string;
  nameSample: string;
  classes: Record<string, string>;
  hasNot: string;
}

const EN: Words = {
  title: 'Pixel-Mart',
  sub: 'Looks only. The game stays the same for everyone.',
  tabs: {
    look: 'Looks', campfire: 'Campfires', hat: 'Hats', pet: 'Pets', trail: 'Trails', killfx: 'Kills', deathfx: 'Falls', numbers: 'Numbers', quips: 'Quips',
    decor: 'Camp', frame: 'Frames', title: 'Titles', namecolor: 'Names', photoframe: 'Photo', sticker: 'Stickers', bundle: 'Bundles', pass: 'Pass', photo: 'Photo',
  },
  rarity: { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' },
  category: {
    look: 'Hero look', campfire: 'Campfire style', hat: 'Hat', pet: 'Pet', trail: 'Footstep trail', killfx: 'Kill effect', deathfx: 'Death effect',
    numbers: 'Damage numbers', quips: 'Quip pack', decor: 'Camp decoration', frame: 'Profile frame', title: 'Title', namecolor: 'Name colour',
    photoframe: 'Photo frame', sticker: 'Sticker', bundle: 'Bundle', pass: 'Season pass',
  },
  wardrobe: 'My things',
  wardrobeSub: 'What you own and wear',
  passButton: 'Season pass',
  classic: 'Skins, effects, Patron',
  all: 'All',
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
  nothingOwned: 'You own nothing of this kind yet. The shop is one tab over.',
  closedNote: 'Purchases open inside Telegram.',
  starsNote: 'Paid in Telegram Stars. A look only: it changes nothing in the game.',
  placeholderNote: 'Placeholder art: the real picture is on its way.',
  bundleHas: (n, value) => `${n} items, worth ${value}`,
  bundleSave: (pct) => `${pct}% off`,
  earn: (e) => (e.by === 'pass' ? `Season pass, level ${e.level}${e.track === 'paid' ? ' (paid track)' : ''}` : e.by === 'streak' ? `A ${e.days}-day streak` : `Top ${e.place} of the ${e.kind === 'daily' ? 'day' : 'week'}`),
  earnOnly: 'Earned, not sold',
  decorSet: (n, max) => `${n} of ${max} in the camp`,
  thanks: 'Thank you! It is yours.',
  failed: 'The purchase did not go through. Nothing was charged.',
  expired: 'Reopen the game from Telegram to buy.',
  alreadyOwned: 'You have it already.',
  wornToast: 'Worn.',
  giftTitle: 'A gift for a friend',
  giftText: 'Enter your friend’s Telegram ID and the gift comes to their mail in the game. Or get a link and send it yourself: whoever opens it first gets the gift.',
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
  passPaid: 'Paid',
  passBuy: 'Unlock the paid track',
  passBought: 'Paid track unlocked',
  passHow: 'XP comes from runs the server has checked: depth, kills, wins and the daily dungeon. At most 500 a day.',
  passClaim: 'Claim',
  passClaimed: 'Claimed',
  passGot: (n) => (n === 1 ? 'Reward claimed.' : `${n} rewards claimed.`),
  passNothing: 'Nothing to claim yet.',
  passLocked: 'Locked',
  passDevXp: '+500 XP (development build)',
  tryOnHint: 'Tap «Try on» to see it on your hero.',
  sampleLine: 'Another one for the fire.',
  nameSample: 'Your name',
  classes: { warrior: 'Warrior', mage: 'Mage', rogue: 'Rogue', huntress: 'Huntress' },
  hasNot: 'Not yours yet',
};

const RU: Words = {
  title: 'Пиксель-Март',
  sub: 'Только облик. Игра для всех одна и та же.',
  tabs: {
    look: 'Облики', campfire: 'Костры', hat: 'Шапки', pet: 'Питомцы', trail: 'Следы', killfx: 'Убийства', deathfx: 'Гибель', numbers: 'Числа', quips: 'Реплики',
    decor: 'Лагерь', frame: 'Рамки', title: 'Титулы', namecolor: 'Имена', photoframe: 'Фото', sticker: 'Наклейки', bundle: 'Наборы', pass: 'Пропуск', photo: 'Фото',
  },
  rarity: { common: 'Обычный', rare: 'Редкий', epic: 'Эпический', legendary: 'Легендарный' },
  category: {
    look: 'Облик героя', campfire: 'Стиль костра', hat: 'Шапка', pet: 'Питомец', trail: 'След шагов', killfx: 'Эффект убийства', deathfx: 'Эффект гибели',
    numbers: 'Числа урона', quips: 'Набор реплик', decor: 'Украшение лагеря', frame: 'Рамка профиля', title: 'Титул', namecolor: 'Цвет имени',
    photoframe: 'Рамка для фото', sticker: 'Наклейка', bundle: 'Набор', pass: 'Пропуск сезона',
  },
  wardrobe: 'Мои вещи',
  wardrobeSub: 'Что у вас есть и что надето',
  passButton: 'Пропуск сезона',
  classic: 'Раскраски, эффекты, Покровитель',
  all: 'Все',
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
  nothingOwned: 'Такого у вас пока нет. Магазин — на соседней вкладке.',
  closedNote: 'Покупки открываются внутри Telegram.',
  starsNote: 'Оплата звёздами Telegram. Только облик: на игру он не влияет.',
  placeholderNote: 'Пока рисунок-заготовка: настоящий уже в пути.',
  bundleHas: (n, value) => `${n} предм., на ${value}`,
  bundleSave: (pct) => `−${pct}%`,
  earn: (e) => (e.by === 'pass' ? `Пропуск сезона, уровень ${e.level}${e.track === 'paid' ? ' (платная дорожка)' : ''}` : e.by === 'streak' ? `Серия ${e.days} дн.` : `Топ-${e.place} ${e.kind === 'daily' ? 'дня' : 'недели'}`),
  earnOnly: 'Только за заслуги',
  decorSet: (n, max) => `В лагере ${n} из ${max}`,
  thanks: 'Спасибо! Теперь это ваше.',
  failed: 'Покупка не прошла. Деньги не списаны.',
  expired: 'Откройте игру из Telegram заново, чтобы купить.',
  alreadyOwned: 'У вас это уже есть.',
  wornToast: 'Надето.',
  giftTitle: 'Подарок другу',
  giftText: 'Введите Telegram-ID друга — подарок придёт ему в почту в игре. Или получите ссылку и отправьте её сами: подарок достанется тому, кто откроет её первым.',
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
  passPaid: 'Платно',
  passBuy: 'Открыть платную дорожку',
  passBought: 'Платная дорожка открыта',
  passHow: 'Опыт даёт забег, проверенный сервером: глубина, убийства, победа и подземелье дня. Не больше 500 в сутки.',
  passClaim: 'Забрать',
  passClaimed: 'Получено',
  passGot: (n) => (n === 1 ? 'Награда получена.' : `Получено наград: ${n}.`),
  passNothing: 'Забирать пока нечего.',
  passLocked: 'Закрыто',
  passDevXp: '+500 оп. (сборка для разработки)',
  tryOnHint: 'Нажмите «Примерить», чтобы увидеть это на герое.',
  sampleLine: 'Ещё одного — в костёр.',
  nameSample: 'Ваше имя',
  classes: { warrior: 'Воин', mage: 'Маг', rogue: 'Разбойник', huntress: 'Охотница' },
  hasNot: 'Пока не ваше',
};

export const S: Words = lang === 'ru' ? RU : EN;
export const L: Lang = lang === 'ru' ? 'ru' : 'en';
export type { Tab };
