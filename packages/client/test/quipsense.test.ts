import { Rng, rollMob } from '@pd/core';
import type { MobKind } from '@pd/core';
import { describe, expect, it } from 'vitest';
import { QUIP_PACKS } from '../src/quip-packs';
import { type Moment, type Occasion, OCCASIONS, QUIP_CLASSES, type QuipClass, type QuipData, type QuipLang } from '../src/quips';
import { enQuips } from '../src/quips-en';
import { ruQuips } from '../src/quips-ru';
import { FOOD_MOMENT, TRAP_MOMENT, TRIVIAL_MOMENT } from '../src/quipwatch';
import { lies, type Said } from './quipterms';

/*
 * The truth of the hero's lines. A line is said for a moment, and the moment can come from many events: a plain kill is any monster,
 * on any floor, by whatever weapon is in hand; a trap is one of eight; a meal is one of six foods; and the huntress says what the
 * others say. So a line may name a creature, a boss, a trap, a food, a place, a weapon or a hunger stage only where that is true of
 * EVERY event that can bring the moment (the owner heard «Мечом по крысе» after a crab). This file holds a dictionary of such
 * words (RU and EN stems) with the moments each is true in, and fails on a line that has one in a moment where it can be false.
 */

const LANGS: ReadonlyArray<readonly [QuipLang, QuipData]> = [['ru', ruQuips], ['en', enQuips]];

function allLines(): Said[] {
  const out: Said[] = [];
  for (const [lang, data] of LANGS) {
    for (const register of ['foul', 'clean'] as const) {
      const set = data[register];
      for (const heroClass of QUIP_CLASSES) {
        for (const line of set.kill[heroClass]) out.push({ lang, where: `${lang} ${register} kill.${heroClass}`, moment: 'kill', classes: [heroClass], line, pack: false });
      }
      for (const occasion of OCCASIONS) {
        for (const line of set.shared[occasion]) out.push({ lang, where: `${lang} ${register} shared.${occasion}`, moment: occasion, classes: QUIP_CLASSES, line, pack: false });
        for (const [heroClass, lines] of Object.entries(set.own[occasion] ?? {}) as Array<[QuipClass, readonly string[]]>) {
          for (const line of lines) out.push({ lang, where: `${lang} ${register} own.${occasion}.${heroClass}`, moment: occasion, classes: [heroClass], line, pack: false });
        }
      }
    }
  }
  for (const [id, byLang] of Object.entries(QUIP_PACKS)) {
    for (const lang of ['ru', 'en'] as const) {
      const { any, own } = byLang[lang];
      for (const [moment, lines] of Object.entries(any) as Array<[Moment, readonly string[]]>) {
        for (const line of lines) out.push({ lang, where: `${lang} pack ${id} ${moment}`, moment, classes: QUIP_CLASSES, line, pack: true });
      }
      for (const [moment, byClass] of Object.entries(own ?? {}) as Array<[Moment, Partial<Record<QuipClass, readonly string[]>>]>) {
        for (const [heroClass, lines] of Object.entries(byClass) as Array<[QuipClass, readonly string[]]>) {
          for (const line of lines) out.push({ lang, where: `${lang} pack ${id} ${moment}.${heroClass}`, moment, classes: [heroClass], line, pack: true });
        }
      }
    }
  }
  return out;
}

describe('the lines say only what is true of every event that can bring them', () => {
  const lines = allLines();

  it('has the lines to look at', () => {
    expect(lines.length).toBeGreaterThan(2000);
    for (const lang of ['ru', 'en'] as const) expect(lines.some((l) => l.lang === lang && l.pack)).toBe(true);
  });

  it('names no creature, boss, trap, food, place, weapon or hunger stage in a moment where it can be false', () => {
    const wrong = lines.flatMap(lies);
    expect(wrong).toEqual([]);
  });

  it('knows its words: a rat after a crab, a sword in a plain kill, fire in a poison trap, a ration at a kill', () => {
    const said = (moment: Moment, line: string, lang: QuipLang = 'ru', classes: readonly QuipClass[] = QUIP_CLASSES): Said => ({ lang, where: 'test', moment, classes, line, pack: false });
    expect(lies(said('trivialCrab', 'Ебать, крыса. Страшно.'))).toHaveLength(1);
    expect(lies(said('trivialRat', 'Ебать, крыса. Страшно.'))).toHaveLength(0);
    expect(lies(said('trivial', 'Крысе — крысиная смерть.')).length).toBeGreaterThan(0);
    expect(lies(said('trivialRat', 'Мечом по крысе — как кувалдой по комару.')).length).toBeGreaterThan(0);
    expect(lies(said('kill', 'Мечом по ебалу.', 'ru', ['warrior']))).toHaveLength(1);
    expect(lies(said('kill', 'Sword’s dirty again.', 'en', ['warrior']))).toHaveLength(1);
    expect(lies(said('kill', 'Fireball up your ass.', 'en', ['mage']))).toHaveLength(1);
    expect(lies(said('kill', 'One arrow, one dead asshole.', 'en', ['huntress']))).toHaveLength(1);
    expect(lies(said('kill', 'Тетива дрогнула — и ты уже труп.', 'ru', ['huntress']))).toHaveLength(1);
    expect(lies(said('kill', 'This sewer is full of idiots.', 'en', ['warrior']))).toHaveLength(1);
    expect(lies(said('kill', 'Канализация, блядь.'))).toHaveLength(1);
    expect(lies(said('trapPoison', 'Горит жопа!'))).toHaveLength(1);
    expect(lies(said('trapFire', 'Горит жопа!'))).toHaveLength(0);
    expect(lies(said('trap', 'Какой яд!'))).toHaveLength(1);
    expect(lies(said('trapSummoning', 'Подарочек: три моба в одной коробке.'))).toHaveLength(1);
    expect(lies(said('kill', 'Паёк съем, врага уложу.'))).toHaveLength(1);
    expect(lies(said('ate', 'Паёк в брюхо — и жить можно.'))).toHaveLength(1);
    expect(lies(said('ateRation', 'Паёк в брюхо — и жить можно.'))).toHaveLength(0);
    expect(lies(said('hungry', 'Голод жрёт здоровье.'))).toHaveLength(1);
    expect(lies(said('starving', 'Голод жрёт здоровье.'))).toHaveLength(0);
    expect(lies(said('hungry', 'Starving. Where is the food?', 'en'))).toHaveLength(1);
    expect(lies(said('death', 'Killed by a rat? Fuck you, fate.', 'en'))).toHaveLength(1);
    expect(lies(said('kill', 'Один удар — и пиздец.'))).toHaveLength(1);
    expect(lies(said('oneHit', 'Один удар — и пиздец.'))).toHaveLength(0);
    expect(lies(said('kill', 'Мясо, блядь. Просто мясо.'))).toHaveLength(2);
    // A class may use its own voice, and only in its own lines.
    expect(lies(said('kill', 'Лес не прощает.', 'ru', ['huntress']))).toHaveLength(0);
    expect(lies(said('streak', 'Лес не прощает.', 'ru'))).toHaveLength(1);
    expect(lies(said('kill', 'Карманы — на выход.', 'ru', ['rogue']))).toHaveLength(0);
    expect(lies(said('kill', 'Карманы — на выход.', 'ru', ['warrior']))).toHaveLength(1);
  });

  it('keeps the wand to the moment of a bolt: nothing else is a wand', () => {
    const wand = lines.filter((l) => /палочк|wands?\b/i.test(l.line));
    for (const l of wand) expect(l.moment, l.line).toBe('wand');
  });
});

describe('every moment has the lines to be true to its kind', () => {
  it('gives each of the eight traps, six foods and the trivial kills a moment and lines of their own, never the general pool alone', () => {
    for (const [, data] of LANGS) {
      for (const register of ['foul', 'clean'] as const) {
        const set = data[register];
        for (const moment of [...Object.values(TRAP_MOMENT), ...Object.values(FOOD_MOMENT), ...Object.values(TRIVIAL_MOMENT)] as Occasion[]) {
          expect(set.shared[moment].length, moment).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it('gives every kind of rat and crab the moment of its own species', () => {
    const kinds = Object.keys(TRIVIAL_MOMENT) as MobKind[];
    expect([...kinds].sort()).toEqual(['albino', 'crab', 'fetidRat', 'rat']);
    expect(TRIVIAL_MOMENT.rat).toBe('trivialRat');
    expect(TRIVIAL_MOMENT.albino).toBe('trivialRat');
    expect(TRIVIAL_MOMENT.fetidRat).toBe('trivialRat');
    expect(TRIVIAL_MOMENT.crab).toBe('trivialCrab');
  });
});

describe('the sewers: rats and crabs live nowhere else', () => {
  it('rolls a rat, an albino or a crab only on depths 1 to 4 (so «the sewers» in their lines is always true)', () => {
    const sewerKinds = new Set<MobKind>(['rat', 'albino', 'crab', 'fetidRat']);
    for (let depth = 1; depth <= 30; depth++) {
      const rng = Rng.seeded(depth * 7919);
      let seen = 0;
      for (let i = 0; i < 4000; i++) {
        if (sewerKinds.has(rollMob(rng, depth))) seen++;
      }
      if (depth <= 4) expect(seen, `depth ${depth}`).toBeGreaterThan(0);
      else expect(seen, `depth ${depth}`).toBe(0);
    }
  });
});

/*
 * Gender. The huntress is a woman, so what she says in Russian is feminine in the past tense (her own lines) or has no past tense
 * for herself (the lines she shares with the others and a pack's); the others are men. A line that the huntress can say may have no
 * masculine past-tense verb, and one that a man can say no feminine, unless the verb is not the hero's: the foe spoken to, a thing,
 * the forest. Those lines are listed below, each looked at by hand (so a new «я рубил» in a shared line cannot slip by).
 */
describe('Russian verbs: the huntress speaks as a woman, the others as men', () => {
  const MASCULINE = /(?<![а-яё])[а-яё]+(?:[аеёиоуыя]л|[аеёиоуыя]лся|[аеёиоуыя]лись)(?![а-яё])/gi;
  const FEMININE = /(?<![а-яё])[а-яё]+(?:[аеёиоуыя]ла|[аеёиоуыя]лась)(?![а-яё])/gi;
  /** Words that look like a past tense and are not: nouns and the like. */
  const NOT_VERBS = new Set([
    'стул', 'пол', 'факел', 'мудила', 'могила', 'сила', 'силы', 'дела', 'стрела', 'формула', 'пола', 'правила', 'сначала', 'пила',
    'мила', 'скала', 'жила', 'игла', 'метла', 'смола', 'хвала', 'зола', 'кобыла', 'мгла', 'подвал',
  ]);
  /**
   * Lines with a past tense that is NOT the hero's (checked by hand): the monster spoken to («Лопнул, сука»), what a thing did («Интуиция
   * подвела»), the forest («Лес услышал»). None has «я» in it: with «я» the verb is the hero's.
   */
  const OTHERS_PAST: ReadonlySet<string> = new Set([
    "Волновая функция схлопнулась. Ты дохлый, блядь.",
    "Ни толку, ни трофея. Нахуя ты был?",
    "Ты даже убегать не умел, блядь.",
    "Шуршал, как дурак. Дошуршался, блядь.",
    "Краб, блядь. Боком пришёл, боком и сдох.",
    "Лопнул, сука склизкая!",
    "Слизь собралась — слизь и расползлась.",
    "Допыхтелся, сопля.",
    "Прыгал, метал, дохнул. Хуйня.",
    "Тюрьма пуста, ёпта. Босс кончился.",
    "Чинился, чинился — и нахуй всё равно.",
    "Йог-Дзевой назвался, а сдох как хуйня.",
    "Первый пошёл. Остальные в очередь.",
    "Даже не почувствовал, бедолага.",
    "Не успел даже охнуть, сука.",
    "В ближний бой лезть не пришлось. Лень победила, блядь.",
    "Заряд ушёл в тебя. Пиздец тебе.",
    "Вор у вора украл — вор сдох.",
    "Потырил? Теперь не тырь, сука.",
    "Карманы вывернул, воришка ёбаный.",
    "Кто мне это подсунул, сука?",
    "Ну и кто тут решил, что мне везёт?",
    "Щёлк — и пиздец подкрался незаметно.",
    "Какая падла тут это заложила?",
    "Паралич, блядь. Только бы никто не подошёл.",
    "Кто придумал эту хуйню? Больно же!",
    "Ёпта, лодыжка хрустнула. Спасибо, подземелье.",
    "Доигрались, блядь. Теперь голод кусает.",
    "Пузо набито, мозг включился, блядь.",
    "Спасибо, еда. Выручила, блядь.",
    "Мороз нашёл своё место — в желудке, нахуй.",
    "Хоть мелочь выпала? Нет? Позор.",
    "Боком ходил, прямиком сдох.",
    "Живая. Лес меня не принял, сука.",
    "Падальщик попался. Добыча вернулась.",
    "Лес предупреждал: чужого не бери. Не послушала, сука.",
    "Наука… сука… потеряла… героя…",
    "Лес примет… и срать хотел.",
    "Интуиция подвела. Эмпирика вернее, нахуй.",
    "Сила сказала своё слово.",
    "Гипотеза «выживу» не подтвердилась.",
    "Тень была на моей стороне.",
    "Ни одна монета не пострадала. Ты — да.",
    "Тихо. Лес услышал.",
    "След оборвался.",
    "Ты шумел. Это было зря.",
    "Ждала — и ты пришёл.",
    "Грызун с амбициями. Был.",
    "Краб. Боком пришёл — тут и остался.",
    "Лопнул, слизняк.",
    "Накачался и сдулся.",
    "Допыхтелся.",
    "Прыгал, метал, проиграл.",
    "Тюрьма опустела. Босс кончился.",
    "Чинился, чинился — не вышло.",
    "Династия закончилась. Печально для династии.",
    "Бог, а пал, как все.",
    "Глаз закрылся. Навсегда.",
    "Йог-Дзевой назвался, а оказался слабаком.",
    "Первый пошёл. Остальные — в очередь.",
    "Не успел даже охнуть.",
    "В ближний бой лезть не пришлось. Лень победила.",
    "Заряд ушёл в тебя.",
    "Вор у вора украл — вор проиграл.",
    "Потырил? Больше не будешь.",
    "Карманы вывернул, воришка.",
    "Кто мне это подсунул?",
    "Щёлк — и день перестал быть томным.",
    "Паралич. Только бы никто не подошёл.",
    "Кто это придумал? Больно же!",
    "Хрустнула лодыжка. Спасибо, подземелье.",
    "Доигрались. Теперь голод кусается.",
    "Живот полон, мозг включился.",
    "Мороз нашёл своё место — в желудке.",
    "Хоть мелочь выпала? Нет? Обидно.",
    "Боком ходил, прямиком упал.",
    "Живая. Лес меня не принял.",
    "Лес предупреждал: чужого не бери. Не послушала.",
    "Наука… потеряла… героя…",
    "Интуиция подвела. Эмпирика победила.",
    "Бой был честный, конец — честнее.",
    "Твоя отвага была тупа, враг.",
    "Клянусь, удар был добрый.",
    "Вперёд, в следующий зал!",
    "Зал глубже — слава громче.",
    "Не в тот двор зашёл, братан.",
    "Каждый враг — учитель, и этот преподал коротко.",
    "Мыслю, следовательно, ты был.",
    "Коту скажите, чтоб вёл себя хорошо…",
  ]);
  const firstPerson = /(?<![а-яё])(?:я|мы)(?![а-яё])/i;

  const gendered = (line: string): { masculine: string[]; feminine: string[] } => {
    const take = (re: RegExp): string[] => (line.match(re) ?? []).map((w) => w.toLowerCase()).filter((w) => !NOT_VERBS.has(w));
    return { masculine: take(MASCULINE), feminine: take(FEMININE) };
  };

  const ruLines = allLines().filter((l) => l.lang === 'ru');

  it('says nothing of the hero in the masculine past tense when the huntress can say it, nor in the feminine when a man can', () => {
    const wrong: string[] = [];
    for (const said of ruLines) {
      const { masculine, feminine } = gendered(said.line);
      const huntressSays = said.classes.includes('huntress');
      const manSays = said.classes.some((c) => c !== 'huntress');
      if (OTHERS_PAST.has(said.line)) continue;
      if (huntressSays) for (const w of masculine) wrong.push(`${said.where} «${said.line}» — «${w}» is masculine, and the huntress says it`);
      if (manSays) for (const w of feminine) wrong.push(`${said.where} «${said.line}» — «${w}» is feminine, and a man says it`);
    }
    expect(wrong).toEqual([]);
  });

  it("keeps the list of verbs that are not the hero's honest: each line is still said, still needs it, and has no «я»", () => {
    const needing = new Set<string>();
    for (const said of ruLines) {
      const { masculine, feminine } = gendered(said.line);
      if ((said.classes.includes('huntress') && masculine.length > 0) || (said.classes.some((c) => c !== 'huntress') && feminine.length > 0)) needing.add(said.line);
    }
    for (const line of OTHERS_PAST) {
      expect(needing.has(line), `no longer needed (or gone): ${line}`).toBe(true);
      expect(firstPerson.test(line), `has «я», so the verb is the hero's: ${line}`).toBe(false);
    }
  });

  it('catches the verbs that matter', () => {
    expect(gendered('Ты прыгал, я рубил.').masculine).toContain('рубил');
    expect(gendered('Я ждала, и ты дождался.').feminine).toContain('ждала');
    expect(gendered('Я победил, суки.').masculine).toEqual(['победил']);
    expect(gendered('Сила есть — ума не надо.')).toEqual({ masculine: [], feminine: [] });
    expect(firstPerson.test('Ты прыгал, я рубил.')).toBe(true);
    expect(firstPerson.test('Лопнул, сука склизкая!')).toBe(false);
  });
});
