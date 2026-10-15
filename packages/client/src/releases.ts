/*
 * What changed, version by version: the text of the «Что нового» window (newsui.ts), in Russian and English.
 * A future update only adds an entry at the head of RELEASES (newest first): a small one is a list of changes,
 * each with its tag (added / now / fixed / balance); a major one (`major`) is the big window with its header
 * and four main items, its other changes behind «All changes». The window is shown once per version, to
 * those who played before the update (news.ts).
 */

export type Tag = 'add' | 'now' | 'fix' | 'bal';
export interface Words {
  ru: string;
  en: string;
}
/** The icon of a main item of a major update: the heroes' faces, the fire of the camp, a cup, the confirming hand. */
export type MainIcon = 'heroes' | 'camp' | 'season' | 'steps';

export interface Change {
  tag: Tag;
  text: Words;
}

export interface Release {
  /** Dotted numbers, as `3.0`. */
  version: string;
  major?: boolean;
  /** A major update: the title in the banner («Firelight»), the line under it and the line above the title. */
  title?: Words;
  kick?: Words;
  sub?: Words;
  /** A major update: a notice shown plainly above the main items (here: the world started afresh). */
  notice?: Words;
  /** A major update: the four things that are new, with their icons. */
  main?: ReadonlyArray<{ icon: MainIcon; title: Words; text: Words }>;
  changes: readonly Change[];
}

const add = (ru: string, en: string): Change => ({ tag: 'add', text: { ru, en } });
const now = (ru: string, en: string): Change => ({ tag: 'now', text: { ru, en } });
const fix = (ru: string, en: string): Change => ({ tag: 'fix', text: { ru, en } });

export const RELEASES: readonly Release[] = [
  {
    version: '3.0',
    major: true,
    kick: { ru: 'Новый сезон', en: 'A new season' },
    title: { ru: 'У костра', en: 'Firelight' },
    sub: { ru: 'Чистый лист: оригинальный Pixel Dungeon 1.9', en: 'A fresh start on the original Pixel Dungeon 1.9' },
    notice: {
      ru: 'Начался новый сезон: забеги, рекорды, доски, серии, значки и кубки обнулены. Остались только имя, настройки и всё, что куплено в Пиксель-Марте.',
      en: 'A new season has begun: runs, records, boards, streaks, badges and trophies are reset. Only your name, settings and everything bought in Pixel-Mart stay.',
    },
    main: [
      {
        icon: 'heroes',
        title: { ru: 'Оригинальная игра', en: 'The original game' },
        text: { ru: 'Правила Pixel Dungeon 1.9.2a Watabou: четыре героя, все уровни, боссы и Амулет Йендора.', en: 'The rules of Watabou’s Pixel Dungeon 1.9.2a: four heroes, every level, the bosses and the Amulet of Yendor.' },
      },
      {
        icon: 'camp',
        title: { ru: 'Привал', en: 'The camp' },
        text: { ru: 'Живой главный экран: костёр, ваш герой и подземелье дня. Свайп меняет класс.', en: 'A live home screen: the fire, your hero and the day’s dungeon. A swipe changes the class.' },
      },
      {
        icon: 'season',
        title: { ru: 'Новый сезон', en: 'A new season' },
        text: { ru: 'Новые доски дня и недели, серии и кубки: все начинают с нуля.', en: 'New boards of the day and the week, streaks and cups: everyone starts from zero.' },
      },
      {
        icon: 'steps',
        title: { ru: 'Осторожные шаги', en: 'Careful steps' },
        text: { ru: 'Игра спросит, прежде чем вы наступите на ловушку, в газ или в огонь, или наденете неизвестное.', en: 'The game asks before you step on a trap, into gas or fire, or put on something unknown.' },
      },
    ],
    changes: [
      now('Начался новый сезон: идущие забеги, рекорды, история, серии и заморозки, значки, кубки и все доски (дня, недели, за всё время) обнулены. Имя, облик, язык, настройки и всё купленное в Пиксель-Марте остались.', 'A new season has begun: runs under way, records, history, streaks and freezes, badges, trophies and every board (day, week, all-time) are reset. Your name, look, language, settings and everything bought in Pixel-Mart stay.'),
      add('Игра теперь строго по оригинальному Pixel Dungeon 1.9.2a: Воин, Маг, Разбойник и Охотница.', 'The game now follows the original Pixel Dungeon 1.9.2a to the letter: the Warrior, the Mage, the Rogue and the Huntress.'),
      add('Привал: живой главный экран с костром и вашим героем; правила подземелья дня спрятаны за «?».', 'The camp: a live home screen with a fire and your hero; the day’s rules are folded behind «?».'),
      add('Обучение по шагам для новых игроков: враг, лестница, рюкзак, быстрый слот.', 'A step-by-step tutorial for new players: an enemy, the stairs, the backpack, the quickslot.'),
      add('«Памятка» в журнале и на привале: голод, анкх, проклятия, кольцо богатства, мимики, колодцы, семена, очки, испытания и цвета ловушек.', 'The «Guide» in the journal and at the camp: hunger, the ankh, curses, the ring of wealth, mimics, wells, seeds, the score, challenges and trap colours.'),
      add('Игра спрашивает, прежде чем вы наступите на известную ловушку, в облако газа или в огонь.', 'The game asks before you step on a known trap, into a cloud of gas or into fire.'),
      add('Вопрос и перед тем, как надеть неопознанную вещь, выпить неизвестное зелье при враге или улучшить вещь свитком.', 'And before you put on an unidentified thing, drink an unknown potion with an enemy near, or read a scroll that changes an item for good.'),
      add('«Что нового» и «Сообщить о проблеме» в настройках.', '«What’s new» and «Report a problem» in the settings.'),
      add('Игра без связи: забег идёт дальше и засчитается, когда связь вернётся.', 'Play without a connection: the run goes on and counts once the connection is back.'),
      fix('Когда Telegram свёрнут, игра перестаёт рисовать и не греет телефон.', 'With Telegram minimised, the game stops drawing and no longer warms the phone.'),
    ],
  },
];

/** The release a version names. */
export const releaseOf = (version: string): Release | undefined => RELEASES.find((release) => release.version === version);

/** The newest release: the game's version. */
export const CURRENT: Release = RELEASES[0]!;
