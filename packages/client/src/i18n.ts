import type { HeroClass, MobKind } from '@pd/core';

/* Interface text in Russian and English; the language follows Telegram or the browser. */

const en = {
  subtitle: 'co-op edition',
  classes: { warrior: 'Warrior', mage: 'Mage', rogue: 'Rogue', huntress: 'Huntress' } as Record<HeroClass, string>,
  classInfo: {
    warrior: 'Tough and strong. Starts with a short sword.',
    mage: 'Quick hands: attacks twice as fast with knuckledusters.',
    rogue: 'Stealthy, evasive and good at finding secrets.',
    huntress: 'Fragile but deadly with a dagger.',
  } as Record<HeroClass, string>,
  mobs: { rat: 'marsupial rat', gnoll: 'gnoll scout', crab: 'sewer crab', goo: 'Goo' } as Record<MobKind, string>,
  solo: 'Play solo',
  continueRun: 'Continue',
  newRun: 'New game',
  coop: 'Play with friends',
  join: (room: string) => `Join party ${room}`,
  daily: 'Daily dungeon',
  dailyInfo: 'Same dungeon for everyone today',
  coopUnavailable: 'Co-op server is not configured',
  yourName: 'Your name',
  invite: 'Invite a friend',
  inviteText: 'Join my party in Pixel Dungeon!',
  linkCopied: 'Invite link copied',
  toMenu: 'Main menu',
  resume: 'Back to the game',
  soundOn: 'Sound: on',
  soundOff: 'Sound: off',
  help: 'How to play',
  helpText: [
    'Tap a cell to walk there, tap a monster to attack it.',
    'Tap your hero or the magnifier to search for hidden doors.',
    'The hourglass waits a turn; resting heals.',
    'Walk onto the stairs to go deeper.',
    'In a party, time flows while everyone is safe. In a fight, the dungeon waits for each hero in turn.',
    'A fallen hero rises again when a companion goes deeper.',
  ],
  depth: (n: number) => `Depth ${n}`,
  waitingFor: (names: string) => `Waiting for ${names}…`,
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  replaced: 'The game was opened elsewhere',
  youDied: 'You have fallen',
  youDiedCoop: 'A companion will bring you back by going deeper.',
  partyFell: 'The party has fallen',
  soloFell: (depth: number) => `You died on depth ${depth}.`,
  tryAgain: 'Try again',
  restartRun: 'New run',
  noticed: (mob: string) => `A ${mob} notices you!`,
  killed: (mob: string) => `The ${mob} dies.`,
  heroDied: (name: string) => `${name} has fallen!`,
  levelUp: (name: string, lvl: number) => `${name} reaches level ${lvl}!`,
  myLevelUp: (lvl: number) => `Level up! You are now level ${lvl}.`,
  found: 'You found something hidden!',
  nothingFound: 'You search but find nothing.',
  revived: (name: string) => `${name} is back on their feet.`,
  tooDeep: 'The way down is still being built. To be continued!',
  oozed: 'Caustic ooze eats your flesh. Wash it off in water!',
  gooPumps: 'Goo is pumping itself up!',
  gooNotice: 'GLURP-GLURP!',
  gooDeath: 'glurp... glurp...',
  bossSlain: 'Goo is slain! The exit is open.',
  victory: 'Victory!',
  victoryText: 'Goo is slain and the sewers are clear. To be continued: the prison below is being built.',
  miss: 'miss',
  levelUpFloat: 'LEVEL UP',
  welcome: 'Welcome to the sewers. Find the stairs down!',
  room: (id: string) => `Party ${id}`,
};

type Strings = typeof en;

const ru: Strings = {
  subtitle: 'кооперативное издание',
  classes: { warrior: 'Воин', mage: 'Маг', rogue: 'Разбойник', huntress: 'Охотница' },
  classInfo: {
    warrior: 'Крепкий и сильный. Начинает с коротким мечом.',
    mage: 'Быстрые руки: кастетами бьёт вдвое чаще.',
    rogue: 'Скрытный, вёрткий, лучше всех находит тайники.',
    huntress: 'Хрупкая, но опасная с кинжалом.',
  },
  // Names as in the Russian localisation of the original.
  mobs: { rat: 'сумчатая крыса', gnoll: 'гнолл-следопыт', crab: 'сточный краб', goo: 'Жижа' },
  solo: 'Играть одному',
  continueRun: 'Продолжить',
  newRun: 'Новая игра',
  coop: 'Играть с друзьями',
  join: (room) => `Присоединиться к ${room}`,
  daily: 'Подземелье дня',
  dailyInfo: 'Сегодня у всех одно подземелье',
  coopUnavailable: 'Сервер кооператива не настроен',
  yourName: 'Ваше имя',
  invite: 'Позвать друга',
  inviteText: 'Присоединяйся к моему отряду в Pixel Dungeon!',
  linkCopied: 'Ссылка-приглашение скопирована',
  toMenu: 'Главное меню',
  resume: 'Вернуться в игру',
  soundOn: 'Звук: включён',
  soundOff: 'Звук: выключен',
  help: 'Как играть',
  helpText: [
    'Нажмите на клетку, чтобы идти туда, на монстра — чтобы атаковать.',
    'Нажмите на героя или на лупу, чтобы искать потайные двери.',
    'Песочные часы — пропустить ход; отдых лечит.',
    'Встаньте на лестницу, чтобы спуститься глубже.',
    'В отряде время идёт свободно, пока все в безопасности. В бою подземелье ждёт хода каждого героя.',
    'Павший герой встанет снова, когда товарищ спустится глубже.',
  ],
  depth: (n) => `Глубина ${n}`,
  waitingFor: (names) => `Ждём: ${names}…`,
  connecting: 'Подключение…',
  reconnecting: 'Переподключение…',
  replaced: 'Игра открыта в другом окне',
  youDied: 'Вы пали',
  youDiedCoop: 'Товарищ вернёт вас, спустившись глубже.',
  partyFell: 'Отряд пал',
  soloFell: (depth) => `Вы погибли на глубине ${depth}.`,
  tryAgain: 'Ещё раз',
  restartRun: 'Новый забег',
  noticed: (mob) => `Вас замечает ${mob}!`,
  killed: (mob) => `${capitalize(mob)} гибнет.`,
  heroDied: (name) => `${name} падает без сил!`,
  levelUp: (name, lvl) => `${name} достигает ${lvl}-го уровня!`,
  myLevelUp: (lvl) => `Новый уровень! Теперь у вас ${lvl}-й.`,
  found: 'Вы нашли что-то скрытое!',
  nothingFound: 'Вы ищете, но ничего не находите.',
  revived: (name) => `${name} снова в строю.`,
  tooDeep: 'Дальше путь ещё строится. Продолжение следует!',
  oozed: 'Слизь разъедает плоть. Смойте её водой!',
  gooPumps: 'Жижа начинает накачиваться!',
  gooNotice: 'ХЛЮП-ХЛЮП!',
  gooDeath: 'хлюп... хлюп...',
  bossSlain: 'Жижа повержена! Выход открыт.',
  victory: 'Победа!',
  victoryText: 'Жижа повержена, канализация зачищена. Продолжение следует: тюрьма ниже уже строится.',
  miss: 'промах',
  levelUpFloat: 'НОВЫЙ УРОВЕНЬ',
  welcome: 'Добро пожаловать в канализацию. Найдите лестницу вниз!',
  room: (id) => `Отряд ${id}`,
};

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function language(): 'ru' | 'en' {
  const telegram = (globalThis as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { language_code?: string } } } } })
    .Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
  const code = new URLSearchParams(location.search).get('lang') ?? telegram ?? navigator.language ?? 'en';
  return /^(ru|uk|be|kk)/i.test(code) ? 'ru' : 'en';
}

export const lang = language();
export const t: Strings = lang === 'ru' ? ru : en;
export { capitalize };
