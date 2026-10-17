import type { Moment, QuipClass, QuipLang } from '../src/quips';
import { FOOD_MOMENT, TRAP_MOMENT } from '../src/quipwatch';

/*
 * The dictionary of quipsense.test.ts: words (RU and EN stems) for the creatures, bosses, traps, foods, places and gear of the game,
 * with the moments (or the classes) where each is TRUE of every event that can bring the line. Kept apart from the test so that the
 * old lines (or a draft of new ones) can be run against it.
 */

/** One line, and everything it can be said for. */
export interface Said {
  lang: QuipLang;
  /** Where it lives, for the message. */
  where: string;
  moment: Moment;
  /** The classes that can say it: all four for a shared line (and a pack's), one for a class's own. */
  classes: readonly QuipClass[];
  line: string;
  /** A pack's lines are the pack's voice, not the class's. */
  pack: boolean;
}

export const TRAP_MOMENTS = ['trap', ...Object.values(TRAP_MOMENT)] as Moment[];
const FOOD_MOMENTS = ['ate', ...Object.values(FOOD_MOMENT)] as Moment[];
const HUNGER = ['hungry', 'starving', 'starvingNag'] as Moment[];
const m = (...moments: Moment[]): Moment[] => moments;

/** A Cyrillic stem: starts a word (what follows is free). */
const ru = (stems: string, flags = 'i'): RegExp => new RegExp(`(?<![а-яё])(?:${stems})`, flags);
/** A Cyrillic whole word. */
const ruWord = (words: string): RegExp => new RegExp(`(?<![а-яё])(?:${words})(?![а-яё])`, 'i');
const en = (words: string): RegExp => new RegExp(`\\b(?:${words})\\b`, 'i');

export interface Term {
  /** What the word is. */
  id: string;
  ru?: RegExp;
  en?: RegExp;
  /** The moments where the word is true of every event that can bring them. */
  moments?: readonly Moment[];
  /** Or the classes whose own voice it is (a line that only they say). */
  classes?: readonly QuipClass[];
  why?: string;
}

/*
 * The dictionary. Everything here is named for what it says; the moments are where it is TRUE. A word that appears in no moment's
 * list is true nowhere: the weapons (the hero may hold any), the creatures that have no moment of their own, the spells.
 */
export const TERMS: readonly Term[] = [
  // --- Creatures ---
  { id: 'rat', ru: ru('крыс|грызун|альбинос|вонючк'), en: en('rats?|rodents?|albino|marsupial|fetid'), moments: m('trivialRat') },
  { id: 'crab', ru: ru('краб|клешн|панцир|хитин|членистоног|боком'), en: en('crabs?|claws?|shell|chitin|arthropod|sideways'), moments: m('trivialCrab') },
  {
    id: 'a monster of no moment of its own',
    ru: ru('гнолл|скелет|летуч|вампир|шаман|голем|мимик|призрак|привидени|паук|скорпион|суккуб|элементал|монах'),
    en: en('gnolls?|skeletons?|bats?|vampires?|shamans?|golems?|mimics?|ghosts?|wraiths?|spiders?|scorpions?|scorpio|succubus|elementals?|monks?|bandits?'),
  },
  { id: 'a thief (the creature)', ru: ruWord('вор|вора|вору|вором|воры|воров|ворам|воришка|воришку|воришки'), en: en('thief|thieves|crook|bandit'), moments: m('thief'), classes: ['rogue'] },
  {
    id: 'stealing and pockets',
    ru: ru('укра[лд]|стащ|тырь|потыр|кошел|карман|обчист|ограб|грабёж|грабеж'),
    en: en('steal|stole|stolen|rob|robbed|robbery|pickpocket|mugging|wallet|pockets?|loot|coins?|crime'),
    moments: m('thief'),
    classes: ['rogue'],
  },
  // --- Bosses ---
  {
    id: 'Goo',
    ru: ru('слиз|склиз|сопл|луж[аиуе]|лужей|пузырь|накач|сдул|пыхт|лопн'),
    en: en('goo|slim(?:y|e|eball)|snot|puddles?|pump(?:ed)?|deflated|inflated|splat|colloid|sticky'),
    moments: m('goo'),
  },
  { id: 'a pop (the Goo bursts, a monster appears)', en: en('popped'), moments: m('goo', 'trapSummoning') },
  { id: 'the sewers', ru: ru('канализац'), en: en('sewers?'), moments: m('goo', 'trivial', 'trivialRat', 'trivialCrab'), why: 'rats and crabs live on depths 1-4 only (checked below)' },
  { id: 'Tengu and the prison', ru: ru('тэнгу|тенгу|ниндзя|сюрикен|тюрьм|прыжк|прыгал'), en: en('tengu|ninja|shuriken|prison|jump(?:ed|s)?'), moments: m('tengu') },
  { id: 'teleporting', ru: ru('телепорт'), en: en('teleport\\w*'), moments: m('tengu', 'trapSummoning') },
  {
    id: 'DM-300 and machines',
    ru: ru('дм-?300|ржав|шестер|гайк|металлолом|жестянк|железяк|механизм|утилизац|замыкан|чинил'),
    en: en('dm-?300|rust\\w*|gears?|scrap\\w*|machine|repair\\w*|short circuit'),
    moments: m('dm300'),
  },
  { id: 'a scrap heap', ru: ruWord('лом'), moments: m('dm300') },
  { id: 'iron', ru: ru('желез'), en: en('iron|steel'), moments: m('dm300', 'amulet') },
  {
    id: 'the King of Dwarves',
    ru: ru('корол(?!ев)|величеств|династ|скипетр|корон|некромант|гном'),
    en: en('kings?|crown|majesty|dynasty|sceptre|scepter|necromancy|dwarv\\w+|dwarf|vault'),
    moments: m('king'),
  },
  { id: 'Yog-Dzewa and gods', ru: ru('йог|бог(?:а|у|ом|е|ов|и)?(?![а-яё])|божеств|божий|божь|древн'), en: en('yog(?:-dzewa)?|gods?|divine|ancient'), moments: m('yog') },
  { id: 'the Amulet', ru: ru('амулет|йендор'), en: en('amulet|yendor'), moments: m('amulet') },
  { id: 'the ankh', ru: ru('анкх'), en: en('ankh'), moments: m('death') },
  // --- Traps ---
  { id: 'a trap', ru: ru('ловуш|щёлк|щелк|плитк|плитку'), en: en('traps?|click|floor tile'), moments: TRAP_MOMENTS },
  {
    id: 'fire',
    ru: ru('огон|огн|горит|горю|горячо|горяч|пылаю|поджар|подгор|спичк|факел|свеч|шашлык|дымк|хруст(?:ящ)'),
    en: en('fire|burn(?:s|ing|ed|t)?|flames?|torch|candle|matches|hot|roast(?:ed)?|cooked|crisp|smoky|kebab'),
    moments: m('trapFire', 'ateSteak', 'atePasty', 'streak'),
    why: 'streak: «пошла жара» / «I\'m on fire» are a hot streak; the pasty is hot; the steak is smoky',
  },
  { id: 'poison', ru: ru('яд(?![а-яё]*(?:овит))|отрав|тошн|блев|противояд'), en: en('poison\\w*|antidote|nause\\w+|puke|venom|sickens'), moments: m('trapPoison') },
  { id: 'poisonous', ru: ru('ядовит'), en: en('toxic'), moments: m('trapToxic', 'trapPoison') },
  { id: 'gas', ru: ru('газ|кашл|кха|лёгких|лёгкие,|задых|платок'), en: en('gas|cough\\w*|lungs|hanky'), moments: m('trapToxic') },
  { id: 'breath', ru: ru('дыш|дыхани'), en: en('breath\\w*'), moments: m('trapToxic', 'trapParalytic', 'nearDeath') },
  {
    id: 'paralysis',
    ru: ru('паралич|парализ|пошевел|застыл|замер|двинуть|двигаюсь|столбом|памятник|деревяшк|не слушаются'),
    en: en('paraly\\w+|can\'t move|stiff|plank|statue|stuck like|won\'t listen|don\'t move'),
    moments: m('trapParalytic'),
  },
  { id: 'frost', ru: ru('заморож|мороз|холодит'), en: en('frozen|frost|chill\\w*|carpaccio'), moments: m('ateCarpaccio', 'trapParalytic') },
  { id: 'carpaccio', ru: ru('карпаччо'), moments: m('ateCarpaccio') },
  {
    id: 'lightning',
    ru: ru('молни|током|электр|розетк|громоотвод|искры|шарахн|лягушк|дёргаюсь'),
    en: en('lightning|electric\\w*|socket|sparks?|thor|frog|twitch\\w*'),
    moments: m('trapLightning', 'dm300'),
  },
  { id: 'a zap', ru: ru('вжих'), en: en('zap(?:ped)?'), moments: m('wand', 'trapLightning', 'dm300') },
  { id: 'a gripping trap', ru: ru('капкан|лодыжк|тисках'), en: en('ankle|vise|jaws|leg'), moments: m('trapGripping') },
  {
    id: 'an alarm',
    ru: ru('сирен|тревог|трещотк|звонок|звон(?![а-яё])|шобл|сбежится|припрутся|весь этаж|похорон'),
    en: en('sirens?|alarm|rattle|bell|whole floor|entire gang|funeral'),
    moments: m('trapAlarm'),
  },
  {
    id: 'summoned monsters',
    ru: ru('незван|вылезл|из воздуха|принесло|аллерг|упаковк|подар|гост(?:ь|и|ей)(?![а-яё])|компани'),
    en: en('uninvited|thin air|gift\\w*|allergic|popped out|guests?'),
    moments: m('trapSummoning', 'trapAlarm'),
    why: 'the alarm brings «вся компания»; a summoning brings one to three',
  },
  { id: 'a count of monsters', ru: ru('три моб|три монстр|трое|кольц|окруж|толп'), en: en('three monsters|surrounded|crowds?') },
  // --- Food and hunger ---
  { id: 'a ration', ru: ru('паёк|пайк|паек|сухар'), en: en('rations?|crackers?'), moments: m('ateRation', 'ateOverpriced', ...HUNGER) },
  { id: 'a pasty', ru: ru('пирожок|пирожк'), en: en('pasty|pasties'), moments: m('atePasty', 'hungry') },
  { id: 'a steak', ru: ru('шашлык|жарен|дымк'), en: en('grill\\w*|chargrilled|smoky|kebab'), moments: m('ateSteak', 'trapFire') },
  { id: 'raw or mystery meat', ru: ru('сырят|неведом|хуй пойми|непонятно чьё'), en: en('mystery|raw|who-the-fuck-knows|who knows what'), moments: m('ateMeat') },
  {
    id: 'meat',
    ru: ru('мяс|мясн'),
    en: en('meat\\w*'),
    moments: m('atePasty', 'ateMeat', 'ateSteak', 'ateCarpaccio', ...HUNGER),
  },
  {
    id: 'food',
    ru: ru('жрат|жрач|жратв|хавч|еда(?![а-яё])|еды|еду|съесть|поесть|голод|брюх|пузо|желуд|живот'),
    en: en('food|eat(?! me)|eating|eaten|ate|grub|hungry|hunger|famished|belly|stomach|feed'),
    moments: m(...FOOD_MOMENTS, ...HUNGER, 'nearDeath'),
    why: 'nearDeath: «eat, heal» is advice',
  },
  {
    id: 'starvation (full hunger)',
    ru: ru('голодаю|умираю от голода|подыхаю|дохнуть от голода|с голоду|голод жрёт|голод отнимает|голод кусает|здоровье тает|жрёт само себя|съедает сам себя|жрать себя|есть себя|к хребту|воет'),
    en: en('starving|starved|starvation|dying of hunger|eating myself|digesting itself|eats my health|health melts|spine|howling'),
    moments: m('starving', 'starvingNag'),
  },
  { id: 'blood', ru: ru('кров'), en: en('blood|bleed\\w*|bloody'), moments: m('firstBlood', 'amulet', 'nearDeath', 'trapPoison') },
  { id: 'a monster\'s hide, flesh or guts', ru: ru('шкур|мех(?![а-яё])|потрох|плоть'), en: en('fur|hide|flesh|entrails'), moments: m('trivialRat') },
  { id: 'guts', ru: ru('кишк'), en: en('guts'), moments: m('starving', 'trapPoison') },
  // --- Gear: the hero may hold anything, and has no spells ---
  {
    id: 'a sword or a blade',
    ru: ru('меч(?:а|у|ом|е|и|ей)?(?![а-яё])|клин[ок]|лезви|сабл|шпаг|рапир|секир|топор|алебард|кортик|раскро|рубанул|рубил|рубка|рубить|порубить'),
    en: en('swords?|blades?|sabers?|swung|slash\\w*|hack\\w*|axes?|cleaver|chopped'),
  },
  { id: 'a dagger or a knife', ru: ru('кинжал|нож(?:а|у|ом|е|и|ей|ик\\w*)?(?![а-яё])|стилет|финк'), en: en('daggers?|knives|knife|stab\\w*|shiv|dirk') },
  { id: 'a club, mace or hammer', ru: ru('дубин|булав|молот|кувалд|палиц|кастет'), en: en('maces?|clubs?|hammers?|cudgel|knuckles?|knuckleduster') },
  {
    id: 'a missile weapon',
    ru: ru('копь|дротик|метательн|бумеранг|арбалет|тетив|колчан|(?:лук|лука|луком|луке)(?![а-яё])|стрел(?:а|ы|у|е|ой|ами|ам|ах|ять)?(?![а-яё])'),
    en: en('spears?|javelins?|darts?|boomerangs?|bows?|arrows?|quiver|bowstring|crossbow'),
  },
  { id: 'a staff', ru: ru('посох|жезл'), en: en('staff|staves') },
  { id: 'a wand', ru: ru('палочк|палка-стрел'), en: en('wands?'), moments: m('wand') },
  { id: 'a spell', ru: ru('заклинан|заклят|фаербол|огненн|(?:мана|маны|мане)(?![а-яё])'), en: en('spells?|fireball|firebolt|mana|incinerat\\w+|fried|magic missile|missile') },
  { id: 'a shield or a cloak', ru: ru('щит|плащ|накидк|мантия'), en: en('shield|cloak|cape|robes?') },
  { id: 'stairs', ru: ru('лестниц|ступеньк'), en: en('stairs?|staircase'), moments: m('descend') },
  { id: 'a place: caves, a city, the demon halls', ru: ru('пещер|демон'), en: en('caves?|cavern|demons?') },
  // --- How a plain kill went: a quick one or not ---
  {
    id: 'one blow',
    ru: ru('один удар|одним ударом|одного удара|один выстрел|одним выстрелом|один тычок|один взмах|с одного'),
    en: en('one (?:hit|swing|shot|poke|blow|stroke)|single (?:hit|blow)|one-hit'),
    moments: m('oneHit', 'nearDeath'),
    why: 'a plain kill took more than one blow (or none: a proc); nearDeath: «one swing from the list» is about the hero',
  },
  // --- The classes' own voices: a line the other classes can say may not use them ---
  {
    id: 'the huntress\'s forest',
    ru: ru('лес(?:а|у|ом|е)?(?![а-яё])|охотниц|трофе|добыч|дичь|тропа'),
    en: en('forests?|woods|huntress|trophy|prey|trail|tracks?|hunt\\w*'),
    classes: ['huntress'],
  },
  {
    id: 'the mage\'s science',
    ru: ru('эксперимент|гипотез|формул|уравнени|академи|физик|энтропи|подопытн|теори|матчасть|конспект|волнов|сопромат|интеллект|пересдач|зачёт|баг(?![а-яё])|фикс'),
    en: en('experiments?|hypothes\\w+|formula|equation|academy|physics|entropy|theory|segfault|dunning|wizard|degree|nerd|peer|intellect|colloid'),
    moments: m('wand', 'goo'),
    classes: ['mage'],
  },
  { id: 'the warrior\'s ancestors', ru: ru('воин|предк'), en: en('warrior|ancestors'), classes: ['warrior'] },
];

export function wordsIn(term: Term, lang: QuipLang, line: string): string[] {
  const re = lang === 'ru' ? term.ru : term.en;
  if (!re) return [];
  const g = new RegExp(re.source, 'gi');
  return line.match(g) ?? [];
}

export function allowedAt(term: Term, said: Said): boolean {
  if (term.moments?.includes(said.moment)) return true;
  if (term.classes && !said.pack && said.classes.every((c) => term.classes!.includes(c))) return true;
  return false;
}

/** The terms a line has, and where they are not true. */
export function lies(said: Said): string[] {
  const out: string[] = [];
  for (const term of TERMS) {
    for (const word of wordsIn(term, said.lang, said.line)) {
      if (!allowedAt(term, said)) out.push(`${said.where} «${said.line}» — «${word}» is ${term.id}`);
    }
  }
  return out;
}
