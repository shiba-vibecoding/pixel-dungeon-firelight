/*
 * The camp's and the meta screens' texts (camp.ts, campui.ts, mailui.ts, coach.ts, newsui.ts, reportui.ts, offlineui.ts, update.ts):
 * «Привал», the mail, the step tutorial, «What's new», «Report a problem», «No connection», the toast of an update.
 * The news themselves are in releases.ts. Russian is typed by English (i18n-camp.ru.ts).
 */

/** The way a place is said in the mail: 1st, 2nd, 3rd... */
export function ordinal(n: number): string {
  const rest = n % 100;
  const suffix = rest >= 11 && rest <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

export const CAMP_EN = {
  camp: {
    /** The four classes of the original, in the order of avatars.png. */
    cls: ['Warrior', 'Mage', 'Rogue', 'Huntress'] as readonly string[],
    say: [
      ['One more night by the fire, then down.', 'My sword is sharp.', 'Hear that? Rats.'],
      ['Magic hates a hurry.', 'The wand is warm. A good sign.', 'How many floors down?'],
      ['Quiet. Nobody sees us.', 'Gold won’t find itself.', 'Been down there before.'],
      ['Wind from below. Smells of rat.', 'The boomerang is ready.', 'Clear stars tonight.'],
    ] as ReadonlyArray<readonly string[]>,
    sulk: [['Enough!', 'Now I’m sulking.'], ['Don’t poke a mage!', 'Now I’m sulking.'], ['Hands off!', 'Now I’m sulking.'], ['Enough!', 'Now I’m sulking.']] as ReadonlyArray<readonly string[]>,
    prev: 'Previous hero',
    next: 'Next hero',
    quests: 'Quests',
    questsNew: 'Quests, something new',
    mail: 'Mail',
    ranks: 'Rankings',
    mart: 'Pixel-Mart',
    prefs: 'Settings',
    board: 'Day’s board',
    profileHint: 'Open the rankings',
    today: 'Today:',
    continueMeta: (cls: string, lvl: number, depth: number) => `${cls} · lv ${lvl} · depth ${depth}`,
    left: (n: number, hours: boolean) => `${n} ${hours ? 'h' : 'min'} left`,
    attempt: '1 attempt',
    played: 'Played',
    placeOf: (n: number) => `Played · #${n}`,
    dailyHardship: (name: string, info: string) => `Hardship · ${name}: ${info}`,
    dailyBoon: (name: string, info: string) => `Boon · ${name}: ${info}`,
    dailyNext: (left: string) => `Next daily dungeon in ${left}`,
    dailyResets: (time: string) => `New rules at ${time} your time`,
    attemptHint: 'The attempt is spent when the run starts.',
    rulesMore: 'The day’s rules: details',
    units: { d: 'd', h: 'h', m: 'min', soon: 'a moment' },
  },
  mail: {
    title: 'Mail',
    claim: 'Claim',
    claimAll: 'Claim all',
    got: 'Claimed',
    keep: 'Letters are kept for 30 days',
    empty: 'No letters. Take a place in the daily dungeon or the week’s rankings: the results come here.',
    offline: 'The mail could not be reached. Try again in a moment.',
    cup: 'Cup of the day',
    medal: 'Week results',
    cupText: (date: string, place: number, total: number | undefined) => ({
      before: `Daily dungeon ${date}: `, em: total ? `${ordinal(place)} of ${total}` : `${ordinal(place)} place`, after: '. The cup goes to your «Mine» shelf.',
    }),
    medalText: (week: string, place: number, total: number | undefined) => ({
      before: `Week ${week}: `, em: total ? `${ordinal(place)} of ${total}` : `${ordinal(place)} place`, after: '. The medal goes to your «Mine» shelf.',
    }),
    gifts: { gold: 'Gold cup', silver: 'Silver cup', bronze: 'Bronze cup', week: 'Medal' } as Record<string, string>,
    today: 'today',
    yesterday: 'yesterday',
    claimedToast: 'Added to «Mine»',
    countLabel: (n: number) => `${n} unclaimed`,
  },
  coach: {
    step: (i: number, n: number) => `Step ${i} of ${n}`,
    next: 'Next',
    done: 'Got it',
    skip: 'Skip the tutorial',
    steps: [
      ['An enemy', 'This is a *%s*. Tap it to strike. The fight goes in turns: you hit, it hits back.'],
      ['Stairs down', 'Walk to the *stairs* and tap them to go deeper. The way back up is open, too.'],
      ['Backpack', 'All your things are here. Tap one to *wear, drink or read* it.'],
      ['Quickslot', 'Keep what you need at once here: *one tap* and it’s used. Open an item in the backpack and choose «Put in the quickslot».'],
    ] as ReadonlyArray<readonly [string, string]>,
  },
  news: {
    title: 'What’s new',
    version: (v: string) => `Version ${v}`,
    play: 'Play',
    all: 'All changes',
    allMore: (n: number) => `All changes (${n} more)`,
    once: 'This window shows once after an update',
    tags: { add: 'Added', now: 'Now', fix: 'Fixed', bal: 'Balance' },
    bannerAlt: 'Four heroes by the fire',
    back: 'Back',
    row: 'What’s new',
    earlier: 'Earlier versions',
  },
  report: {
    title: 'Report a problem',
    label: 'What happened',
    optional: 'optional',
    placeholder: 'E.g. my backpack vanished after the stairs',
    attach: 'Attach the run’s log',
    attachNote: 'The run’s moves and actions, game and phone versions. No name, no chats.',
    send: 'Send',
    sending: 'Sending…',
    cancel: 'Cancel',
    sentTitle: 'Sent, thank you!',
    sentText: 'We will look at the log.',
    close: 'Close',
    failed: 'Could not send it: no connection to the server. Try again in a moment.',
    errorTitle: 'Something went wrong',
    errorText: 'The game stopped on an error. Your run is saved: restart, and it goes on from where the server has it.',
    restart: 'Restart',
  },
  offline: {
    title: 'No connection to the server',
    text: 'Keep playing: the run is saved on your phone. When the connection is back, it reaches the server and counts for the boards.',
    note: 'While offline — no boards and no mail.',
    textStart: 'The server hands out every run that counts, and cannot be reached now. Try again, or play without ranking: this run counts nowhere.',
    retry: 'Retry',
    play: 'Play offline',
    playNew: 'Play without ranking',
    auto: 'We will check again in {n} s',
    checking: 'Checking…',
    strip: 'Offline · the run will count later',
    stripLocal: 'Offline · this run is not ranked',
    back: 'The run reached the server',
    stillOff: 'Still no connection.',
    windowFailed: 'Could not load this window: no connection.',
  },
  newVersion: 'A new version is out — updating',
  /** The settings' name field outside Telegram, where the name is not known (the camp has no field for it). */
  nameRow: 'Hero’s name',
  nameNote: 'Shown on the camp card and the boards',
};
