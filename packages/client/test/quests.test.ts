import { readFileSync } from 'node:fs';
import { addHero, createItem, createWorld, floorAt, type Hero, heroById, levelAt, ORE_WANTED, TOKENS_WANTED, type World } from '@pd/core';
import { describe, expect, it } from 'vitest';
import { QUEST_EN } from '../src/i18n-quest';
import { QUEST_RU } from '../src/i18n-quest.ru';
import { BADGE_ICON, GOAL_ICON, PICKAXE_ICON, PORTRAIT_OF, rewardKind, stepsOf } from '../src/questart';
import { cardForItem, chipCard, type Goal, openCards, type QuestCard, type QuestId, questCards, share } from '../src/questcard';
import { chipLine, pickupToast, progressLine, rewardLine, stageLine } from '../src/questcardtext';
import { ghostPlan, impPlan, moodOf, smithPlan, wandmakerPlan } from '../src/questtalk';
import { LINE_IDS, type QuestWords, type Register, registerOf, say } from '../src/quest-words';
import { CPS, schedule, shown, totalMs } from '../src/typewriter';

/*
 * The quests in person (presentation only): the card's counts come from the world and the pack and nothing hidden; the givers speak
 * in both languages and both registers with every fact of the original; only the foul-mouthed setting swears; the typewriter's
 * schedule; the little replies change nothing but the words.
 */

function world(seed = 7): { world: World; hero: Hero } {
  const w = createWorld(seed);
  floorAt(w, 1).mobs = [];
  levelAt(w, 1);
  addHero(w, { id: 'p', name: 'P', heroClass: 'warrior' });
  return { world: w, hero: heroById(w, 'p')! };
}

const LANGS: ReadonlyArray<readonly [string, QuestWords]> = [['ru', QUEST_RU], ['en', QUEST_EN]];
const REGISTERS: readonly Register[] = ['clean', 'foul'];

const SWEAR_CLEAN = {
  ru: /хуй|хуе|хуя|хуё|пизд|бля|сука|суки|сучар|мудак|мудил|говн|жоп|срат|сран|залуп|дерьм|ссат|ссы|падл|мраз|(?<![а-яё])(?:на|по|вы|за|от|до|про|раз|съ|объ|пере|под|при|ис)?[её]б[аоуыилнёе]|уе?[её]б/i,
  en: /\b(?:fuck\w*|shit\w*|ass|asshole|dumbass|bitch|damn\w*|hell|crap|bastard|dick\w*|piss\w*|prick|motherfuck\w*)\b/i,
} as const;
const SWEAR_FOUL = {
  ru: /хуй|хуе|хуя|хуё|хул|пизд|бля|сука|мудак|говн|жоп|ссы|ёб|еб|хрен|хрень|сраная|нахуй/i,
  en: /fuck|shit|ass|bitch|damn|piss|bastard|crap|hell/i,
} as const;
const BANNED_AT_PEOPLE = {
  ru: /чурк|хач|(?<![а-яё])жид[ыаов]|пидор|пидр|педик|гомик|негр|даун|дебил|имбецил|инвалид|олигофрен|шлюх|шалав|проститутк|секс|трах|изнасил|минет|хуесос/i,
  en: /nigg|fagg|retard|tranny|\bspic|chink|kike|gook|cripple|slut|whore|cunt|bitch|sissy|dyke|midget|\bgay\b|\brape|blowjob|\bcock\b|pussy|\btits\b|\bsex/i,
} as const;

describe('the quest card counts from the world and the pack', () => {
  it('has no card for an errand not yet taken on', () => {
    const { world: w, hero } = world();
    w.quest = { depth: 3, type: 'rose', given: false, dropped: false, killsLeft: 8, done: false, weapon: createItem('weapon.sword'), armor: createItem('armor.mail') };
    w.wandQuest = { depth: 8, given: false, done: false, battle: createItem('wand.firebolt'), utility: createItem('wand.blink'), wants: 'dust' };
    w.smithQuest = { depth: 12, given: false, done: false, reforged: false, wants: 'gold' };
    w.impQuest = { depth: 18, given: false, done: false, prey: 'monk', reward: createItem('ring.accuracy') };
    expect(questCards(w, hero)).toEqual([]);
  });

  it('counts the dark gold ore as the blacksmith counts it: 15 pieces, the pickaxe with the hero', () => {
    const { world: w, hero } = world();
    w.smithQuest = { depth: 12, given: true, done: false, reforged: false, wants: 'gold' };
    hero.items.push(createItem('weapon.pickaxe'), createItem('quest.ore', 3));
    let card = questCards(w, hero)[0]!;
    expect(card.count).toEqual({ have: 3, need: ORE_WANTED });
    expect(card.stage).toBe('active');
    expect(progressLine(card, QUEST_RU)).toBe('Руда: 3 / 15');
    expect(progressLine(card, QUEST_EN)).toBe('Ore: 3 / 15');
    expect(chipLine(card, QUEST_RU)).toBe('Руда 3/15');
    expect(share(card)).toBeCloseTo(3 / 15);
    hero.items.find((i) => i.kind === 'quest.ore')!.qty = 15;
    card = questCards(w, hero)[0]!;
    expect(card.stage).toBe('ready');
    // The blacksmith turns the errand down without his pickaxe, whatever the ore: the card says so and is not ready.
    hero.items = hero.items.filter((i) => i.kind !== 'weapon.pickaxe');
    card = questCards(w, hero)[0]!;
    expect(card.stage).toBe('active');
    expect(card.noPickaxe).toBe(true);
  });

  it('knows the pickaxe in hand, and the bat\'s blood on it', () => {
    const { world: w, hero } = world();
    w.smithQuest = { depth: 12, given: true, done: false, reforged: false, wants: 'blood' };
    hero.weapon = createItem('weapon.pickaxe');
    let card = questCards(w, hero)[0]!;
    expect(card.found).toBe(false);
    expect(progressLine(card, QUEST_RU)).toBe('Кровь на кирке: нет');
    hero.weapon.bloody = true;
    card = questCards(w, hero)[0]!;
    expect(card.found).toBe(true);
    expect(card.stage).toBe('ready');
    expect(progressLine(card, QUEST_EN)).toBe('Blood on the pickaxe: yes');
  });

  it('counts the imp\'s tokens against 8 monks or 6 golems', () => {
    const { world: w, hero } = world();
    for (const prey of ['monk', 'golem'] as const) {
      w.impQuest = { depth: 18, given: true, done: false, prey, reward: createItem('ring.accuracy') };
      hero.items = [createItem('quest.token', 2)];
      let card = questCards(w, hero)[0]!;
      expect(card.count).toEqual({ have: 2, need: TOKENS_WANTED[prey] });
      expect(card.goal).toBe(prey);
      expect(progressLine(card, QUEST_RU)).toBe(`Жетоны: 2 / ${TOKENS_WANTED[prey]}`);
      hero.items = [createItem('quest.token', TOKENS_WANTED[prey])];
      card = questCards(w, hero)[0]!;
      expect(card.stage).toBe('ready');
      expect(stageLine(card, QUEST_EN)).toBe('Goal met: return to the imp');
    }
    expect(TOKENS_WANTED).toEqual({ monk: 8, golem: 6 });
    expect(ORE_WANTED).toBe(15);
  });

  it('tells the ghost\'s three errands and the wandmaker\'s three apart by the item in the pack', () => {
    const { world: w, hero } = world();
    const weapon = createItem('weapon.sword');
    const armor = createItem('armor.mail');
    const cases = [
      ['rose', 'quest.rose', 'rose'], ['rat', 'quest.skull', 'skull'],
    ] as const;
    for (const [type, kind, goal] of cases) {
      w.quest = { depth: 3, type, given: true, dropped: false, killsLeft: 8, done: false, weapon, armor };
      hero.items = [];
      expect(questCards(w, hero)[0]).toMatchObject({ goal, found: false, stage: 'active' });
      hero.items = [createItem(kind)];
      expect(questCards(w, hero)[0]).toMatchObject({ goal, found: true, stage: 'ready' });
    }
    // The curse: broken, not carried. What the dungeon keeps (whether the rat has come out, the kills left) never changes the card.
    w.quest = { depth: 3, type: 'curse', given: true, dropped: false, killsLeft: 8, done: false, weapon, armor };
    hero.items = [];
    const before = JSON.stringify(questCards(w, hero));
    w.quest.dropped = true;
    w.quest.killsLeft = 1;
    expect(JSON.stringify(questCards(w, hero))).toBe(before);
    w.quest.freed = true;
    expect(questCards(w, hero)[0]).toMatchObject({ goal: 'curse', found: true, stage: 'ready' });

    for (const [wants, kind] of [['dust', 'quest.dust'], ['berry', 'seed.rotberry'], ['fish', 'quest.fish']] as const) {
      w.wandQuest = { depth: 8, given: true, done: false, battle: createItem('wand.firebolt'), utility: createItem('wand.blink'), wants };
      hero.items = [];
      expect(questCards(w, hero).find((c) => c.id === 'wandmaker')).toMatchObject({ goal: wants, found: false, stage: 'active' });
      hero.items = [createItem(kind)];
      expect(questCards(w, hero).find((c) => c.id === 'wandmaker')).toMatchObject({ goal: wants, found: true, stage: 'ready' });
    }
  });

  it('is the same card in two worlds that differ only in what the hero cannot see', () => {
    const a = world(3);
    const b = world(3);
    for (const [w, hero, secret] of [[a.world, a.hero, 1], [b.world, b.hero, 7]] as const) {
      w.wandQuest = { depth: 8, given: true, done: false, battle: createItem('wand.firebolt', 1, secret), utility: createItem('wand.blink', 1, secret), wants: 'dust' };
      w.impQuest = { depth: 18, given: true, done: false, prey: 'golem', reward: createItem('ring.accuracy', 1, secret) };
      w.quest = { depth: 3, type: 'rat', given: true, dropped: secret === 7, killsLeft: secret, done: false, weapon: createItem('weapon.sword', 1, secret), armor: createItem('armor.mail', 1, secret) };
      hero.items = [];
    }
    const say = (cards: QuestCard[]): string[] => cards.flatMap((c) => [progressLine(c, QUEST_EN), rewardLine(c, QUEST_EN), chipLine(c, QUEST_EN)]);
    expect(say(questCards(a.world, a.hero))).toEqual(say(questCards(b.world, b.hero)));
  });

  it('shows the finished errands as done, and the blacksmith\'s reforging as awaiting or used', () => {
    const { world: w, hero } = world();
    w.smithQuest = { depth: 12, given: true, done: true, reforged: false, wants: 'gold' };
    let card = questCards(w, hero)[0]!;
    expect(card.stage).toBe('done');
    expect(openCards([card])).toEqual([]);
    expect(rewardLine(card, QUEST_EN)).toContain('reforging awaits');
    w.smithQuest.reforged = true;
    card = questCards(w, hero)[0]!;
    expect(rewardLine(card, QUEST_RU)).toContain('перековка использована');
  });

  it('puts the chip on the card that is ready, else the one on this depth, else the nearest the surface', () => {
    const { world: w, hero } = world();
    w.quest = { depth: 3, type: 'rose', given: true, dropped: false, killsLeft: 8, done: false, weapon: createItem('weapon.sword'), armor: createItem('armor.mail') };
    w.impQuest = { depth: 18, given: true, done: false, prey: 'monk', reward: createItem('ring.accuracy') };
    expect(chipCard(questCards(w, hero), 18)!.id).toBe('imp');
    expect(chipCard(questCards(w, hero), 5)!.id).toBe('ghost');
    hero.items = [createItem('quest.token', 8)];
    expect(chipCard(questCards(w, hero), 3)!.id).toBe('imp');
    w.impQuest.done = true;
    w.quest.done = true;
    expect(chipCard(questCards(w, hero), 3)).toBeNull();
  });

  it('words the toast for the ore and the tokens as counts, and for the single things as found', () => {
    const { world: w, hero } = world();
    w.smithQuest = { depth: 12, given: true, done: false, reforged: false, wants: 'gold' };
    w.wandQuest = { depth: 8, given: true, done: false, battle: createItem('wand.firebolt'), utility: createItem('wand.blink'), wants: 'fish' };
    hero.items = [createItem('weapon.pickaxe'), createItem('quest.ore', 4), createItem('quest.fish')];
    const cards = questCards(w, hero);
    expect(pickupToast(cardForItem(cards, 'quest.ore')!, QUEST_RU)).toBe('Руда: 4 / 15');
    expect(pickupToast(cardForItem(cards, 'quest.fish')!, QUEST_EN)).toBe('Fish caught: take it to the wandmaker');
    expect(cardForItem(cards, 'quest.rose')).toBeUndefined();
    expect(cardForItem(cards, 'potion.healing')).toBeUndefined();
  });
});

describe('the givers speak', () => {
  for (const [lang, words] of LANGS) {
    describe(lang, () => {
      it('has every line, with a foul version for the most of them', () => {
        let foul = 0;
        for (const id of LINE_IDS) {
          const line = words.lines[id];
          expect(line, id).toBeDefined();
          expect(line[0].length, id).toBeGreaterThan(10);
          if (line[1] !== undefined && line[1] !== line[0]) foul++;
        }
        expect(foul / LINE_IDS.length).toBeGreaterThan(0.9);
      });

      it('swears only in the foul register, never at a people or a person', () => {
        for (const id of LINE_IDS) {
          const [clean, rough] = words.lines[id];
          expect(clean, id).not.toMatch(SWEAR_CLEAN[lang as 'ru' | 'en']);
          expect(clean, id).not.toMatch(BANNED_AT_PEOPLE[lang as 'ru' | 'en']);
          if (rough) expect(rough, id).not.toMatch(BANNED_AT_PEOPLE[lang as 'ru' | 'en']);
        }
        for (const giver of Object.values(words.replies)) {
          for (const reply of [giver.ok, giver.later, giver.ask, giver.where, giver.bye]) expect(reply[0]).not.toMatch(SWEAR_CLEAN[lang as 'ru' | 'en']);
        }
        const rough = LINE_IDS.filter((id) => SWEAR_FOUL[lang as 'ru' | 'en'].test(words.lines[id][1] ?? ''));
        expect(rough.length / LINE_IDS.length).toBeGreaterThan(0.85);
      });

      it('picks the register from the quip setting: only «foul» swears, «clean» and «off» do not', () => {
        expect(registerOf('foul')).toBe('foul');
        expect(registerOf('clean')).toBe('clean');
        expect(registerOf('off')).toBe('clean');
        const line = words.lines['smith.intro.gold'];
        expect(say(line, registerOf('foul'))).toBe(line[1]!.replace(/\{n\}/g, ''));
        expect(say(line, registerOf('clean'), { n: 15 })).not.toMatch(SWEAR_CLEAN[lang as 'ru' | 'en']);
        expect(say(line, 'foul', { n: 15 })).not.toBe(say(line, 'clean', { n: 15 }));
        // A line with no foul version says the same in both.
        expect(say(['plain'], 'foul')).toBe('plain');
      });

      it('keeps the facts of the original in both registers', () => {
        for (const register of REGISTERS) {
          const text = (id: (typeof LINE_IDS)[number], vars = {}): string => say(words.lines[id], register, vars);
          expect(text('smith.intro.gold', { n: 15 })).toContain('15');
          expect(text('imp.intro.monk', { n: 8 })).toContain('8');
          expect(text('imp.intro.golem', { n: 6 })).toContain('6');
          expect(text('imp.remind.golem', { n: 6, have: 2 })).toMatch(/6/);
          expect(text('smith.noGold', { n: 15, have: 4 })).toMatch(/15/);
          expect(text('smith.noGold', { n: 15, have: 4 })).toMatch(/4/);
          // No placeholder is left in a line that has been filled in.
          for (const id of LINE_IDS) expect(text(id, { n: 1, have: 1, cls: 'X' }), id).not.toMatch(/\{(n|have|cls)\}/);
        }
        const re = lang === 'ru'
          ? { rose: /роз/i, rat: /крыс/i, curse: /проклят/i, dust: /пыль|пылью/i, berry: /гнилоягодник/i, fish: /рыб/i, gold: /золот/i, blood: /кров/i, ring: /кольц/i, wand: /палоч/i, reforge: /одну, лучше обеих|лучше обеих/i, tokens: /жетон/i, monks: /монах/i, golems: /голем/i }
          : { rose: /rose/i, rat: /rat/i, curse: /curse/i, dust: /dust/i, berry: /rotberry/i, fish: /phantom fish/i, gold: /gold/i, blood: /blood/i, ring: /ring/i, wand: /wand/i, reforge: /better than both/i, tokens: /token/i, monks: /monk/i, golems: /golem/i };
        for (const register of REGISTERS) {
          const t = (id: (typeof LINE_IDS)[number]): string => say(words.lines[id], register, { n: 1, have: 1, cls: 'X' });
          expect(t('ghost.intro.rose')).toMatch(re.rose);
          expect(t('ghost.intro.rat')).toMatch(re.rat);
          expect(t('ghost.intro.curse')).toMatch(re.curse);
          expect(t('wand.intro.dust')).toMatch(re.dust);
          expect(t('wand.intro.berry')).toMatch(re.berry);
          expect(t('wand.intro.fish')).toMatch(re.fish);
          expect(t('wand.intro.dust')).toMatch(re.wand);
          expect(t('smith.intro.gold')).toMatch(re.gold);
          expect(t('smith.intro.blood')).toMatch(re.blood);
          expect(t('smith.reforge')).toMatch(re.reforge);
          expect(t('imp.intro.golem')).toMatch(re.golems);
          expect(t('imp.intro.monk')).toMatch(re.monks);
          expect(t('imp.intro.monk')).toMatch(re.tokens);
          expect(t('imp.reward')).toMatch(re.ring);
          expect(t('smith.ask')).toMatch(re.reforge);
          expect(t('imp.ask')).toMatch(re.ring);
          expect(t('wand.ask')).toMatch(re.wand);
        }
      });

      it('has a card text for every goal, state and reward', () => {
        for (const goal of ['rose', 'skull', 'curse', 'dust', 'berry', 'fish', 'ore', 'blood', 'monk', 'golem'] as const) {
          expect(words.card.goal[goal], goal).toBeTruthy();
          expect(words.card.label[goal], goal).toBeTruthy();
        }
        for (const goal of ['rose', 'skull', 'curse', 'dust', 'berry', 'fish', 'blood'] as const) expect(words.card.state[goal], goal).toHaveLength(2);
        for (const reward of ['gear', 'wand', 'reforge', 'ring'] as const) expect(words.card.reward[reward]).toBeTruthy();
      });
    });
  }
});

describe('the plan of a dialogue', () => {
  it('uses each errand\'s own words, the hero\'s class and the counts', () => {
    const { world: w, hero } = world();
    const weapon = createItem('weapon.sword');
    const armor = createItem('armor.mail');
    for (const errand of ['rose', 'rat', 'curse'] as const) {
      w.quest = { depth: 3, type: errand, given: true, dropped: false, killsLeft: 8, done: false, weapon, armor };
      for (const line of ['intro', 'remind', 'reward'] as const) {
        const plan = ghostPlan(QUEST_EN, w, hero, line, errand, 'clean', 'Warrior');
        expect(plan.text).toBe(QUEST_EN.lines[`ghost.${line}.${errand}`][0].replace('{cls}', 'Warrior'));
        expect(plan.offers).toEqual(line === 'reward' ? [weapon, armor] : []);
        expect(plan.complete).toBe(line === 'reward');
      }
    }
    const intro = ghostPlan(QUEST_RU, w, hero, 'intro', 'rose', 'foul', 'Воин');
    expect(intro.text).toBe(QUEST_RU.lines['ghost.intro.rose'][1]);
    expect(ghostPlan(QUEST_RU, w, hero, 'intro', 'rose', 'clean', 'Воин').text).toBe(QUEST_RU.lines['ghost.intro.rose'][0]);

    w.smithQuest = { depth: 12, given: true, done: false, reforged: false, wants: 'gold' };
    hero.items = [createItem('quest.ore', 4)];
    const noGold = smithPlan(QUEST_EN, w, hero, 'noGold', 'clean');
    expect(noGold.text).toContain('15');
    expect(noGold.text).toContain('4');
    w.impQuest = { depth: 18, given: true, done: false, prey: 'monk', reward: createItem('ring.accuracy', 1, 2) };
    hero.items = [createItem('quest.token', 3)];
    const remind = impPlan(QUEST_RU, w, hero, 'remind', 'clean', 'Воин');
    expect(remind.text).toContain('8');
    expect(remind.text).toContain('3');
    expect(impPlan(QUEST_RU, w, hero, 'farewell', 'clean', 'Воин').text).toContain('Воин');
    expect(impPlan(QUEST_RU, w, hero, 'reward', 'clean', 'Воин').offers).toEqual([w.impQuest.reward]);
    w.wandQuest = { depth: 8, given: true, done: false, battle: createItem('wand.firebolt'), utility: createItem('wand.blink'), wants: 'berry' };
    expect(wandmakerPlan(QUEST_EN, w, hero, 'remind', 'clean').text).toBe(QUEST_EN.lines['wand.remind.berry'][0]);
    expect(wandmakerPlan(QUEST_EN, w, hero, 'reward', 'clean').offers).toEqual([w.wandQuest.battle, w.wandQuest.utility]);
  });

  it('offers cosmetic replies only: the yes, what may be asked, the way out; the real choices carry none', () => {
    const { world: w, hero } = world();
    w.quest = { depth: 3, type: 'rose', given: false, dropped: false, killsLeft: 8, done: false, weapon: createItem('weapon.sword'), armor: createItem('armor.mail') };
    const intro = ghostPlan(QUEST_RU, w, hero, 'intro', 'rose', 'clean', 'Воин');
    expect(intro.replies.map((r) => r.label)).toEqual(['Ладно', 'А что мне за это?', 'Где её искать?', 'Позже']);
    expect(intro.replies.filter((r) => r.answer).length).toBe(2);
    expect(intro.replies[1]!.answer).toBe(QUEST_RU.lines['ghost.ask'][0]);
    // The reward moment has the original's cards and nothing else to tap; the farewell one button.
    expect(ghostPlan(QUEST_RU, w, hero, 'reward', 'rose', 'clean', 'Воин').replies).toEqual([]);
    expect(ghostPlan(QUEST_RU, w, hero, 'farewell', 'rose', 'clean', 'Воин').bye).toBe('Прощай');
    // The curse's intro has no hint to ask for: its yes and no are the window's real question (main.ts).
    expect(ghostPlan(QUEST_RU, w, hero, 'intro', 'curse', 'clean', 'Воин').replies.every((r) => r.answer === undefined || r.label !== 'Где её искать?')).toBe(true);
    // Foul labels differ from clean ones, and never leak into the clean register.
    const foul = ghostPlan(QUEST_EN, w, hero, 'intro', 'rose', 'foul', 'Warrior');
    const clean = ghostPlan(QUEST_EN, w, hero, 'intro', 'rose', 'clean', 'Warrior');
    expect(foul.replies[1]!.label).not.toBe(clean.replies[1]!.label);
    expect(clean.replies[1]!.label).toBe('What do I get for it?');
  });
});

describe('the typewriter', () => {
  it('brings the letters out in order, at the even pace with a wait after clauses and sentences', () => {
    const text = 'Hi, you. Go on... Now!';
    const times = schedule(text);
    expect(times.length).toBe(text.length);
    for (let i = 1; i < times.length; i++) expect(times[i]!).toBeGreaterThanOrEqual(times[i - 1]!);
    expect(times[0]).toBe(0);
    expect(shown(times, -1)).toBe(0);
    expect(shown(times, 0)).toBe(1);
    expect(shown(times, totalMs(text))).toBe(text.length);
    // The pause after «Hi,» and after «you.»: more than the plain step.
    const step = 1000 / CPS;
    expect(times[text.indexOf(' you')]! - times[text.indexOf(',')]!).toBeGreaterThan(step * 1.5);
    // The dots of «...» are not a stop of their own.
    expect(times[text.indexOf('...') + 1]! - times[text.indexOf('...')]!).toBeLessThan(step * 1.1);
  });

  it('takes a few seconds for the longest line, and an empty line no time', () => {
    const longest = Math.max(...LANGS.flatMap(([, w]) => LINE_IDS.map((id) => w.lines[id][1] ?? w.lines[id][0]).map((t) => totalMs(t))));
    expect(longest).toBeLessThan(12_000);
    expect(totalMs('')).toBe(0);
  });
});

describe('the designer\'s quest art (part 13: ui/quest)', () => {
  const art = JSON.parse(readFileSync(new URL('../public/assets/ui/quest/quest.json', import.meta.url), 'utf8')) as {
    portraits: { rows: string[]; moods: string[]; size: number };
    icons: { goals: string[]; badges: string[] };
    goals: Record<string, Record<string, { item?: string; of: number; icon?: string }>>;
    rewards: Record<string, string>;
  };
  const png = (path: string): { w: number; h: number } => {
    const head = readFileSync(new URL(`../public/assets/${path}`, import.meta.url));
    return { w: head.readUInt32BE(16), h: head.readUInt32BE(20) };
  };

  it('picks the mood of the portrait by the moment: calm, pleased, annoyed', () => {
    for (const line of ['intro', 'remind'] as const) expect(moodOf(line), line).toBe('calm');
    for (const line of ['reward', 'farewell', 'completed'] as const) expect(moodOf(line), line).toBe('pleased');
    for (const line of ['noGold', 'noPickaxe', 'noBlood', 'busy'] as const) expect(moodOf(line), line).toBe('annoyed');
    // The blacksmith's services are business, not a mood.
    expect(moodOf('reforge')).toBe('calm');
    // The plans carry it, each moment its own.
    const { world: w, hero } = world();
    w.quest = { depth: 3, type: 'rose', given: true, dropped: false, killsLeft: 8, done: false, weapon: createItem('weapon.sword'), armor: createItem('armor.mail') };
    w.smithQuest = { depth: 12, given: true, done: false, reforged: false, wants: 'gold' };
    w.impQuest = { depth: 18, given: true, done: false, prey: 'monk', reward: createItem('ring.accuracy') };
    w.wandQuest = { depth: 8, given: true, done: false, battle: createItem('wand.firebolt'), utility: createItem('wand.blink'), wants: 'dust' };
    expect(ghostPlan(QUEST_EN, w, hero, 'intro', 'rose', 'clean', 'X').mood).toBe('calm');
    expect(ghostPlan(QUEST_EN, w, hero, 'reward', 'rose', 'clean', 'X').mood).toBe('pleased');
    expect(wandmakerPlan(QUEST_EN, w, hero, 'remind', 'clean').mood).toBe('calm');
    expect(wandmakerPlan(QUEST_EN, w, hero, 'reward', 'clean').mood).toBe('pleased');
    expect(impPlan(QUEST_EN, w, hero, 'reward', 'clean', 'X').mood).toBe('pleased');
    for (const line of ['noGold', 'noPickaxe', 'noBlood', 'busy'] as const) expect(smithPlan(QUEST_EN, w, hero, line, 'clean').mood, line).toBe('annoyed');
    expect(smithPlan(QUEST_EN, w, hero, 'completed', 'clean').mood).toBe('pleased');
    expect(smithPlan(QUEST_EN, w, hero, 'intro', 'clean').mood).toBe('calm');
  });

  it('has a portrait for four of the givers in the sheet\'s rows and none for the Rat King, three moods each', () => {
    expect(art.portraits.moods).toEqual(['calm', 'pleased', 'annoyed']);
    expect(art.portraits.rows).toEqual(['ghost', 'wandmaker', 'blacksmith', 'imp']);
    expect(Object.values(PORTRAIT_OF).sort()).toEqual([...art.portraits.rows].sort());
    expect(PORTRAIT_OF.ratKing).toBeUndefined();
    const size = png('ui/quest/portraits.png');
    expect(size).toEqual({ w: art.portraits.size * 3, h: art.portraits.size * 4 });
    for (const [kind, row] of Object.entries(PORTRAIT_OF)) expect(art.portraits.rows.indexOf(row!), kind).toBeGreaterThanOrEqual(0);
  });

  it('stands each reward on its giver\'s podium, in the rows of the reward sheet', () => {
    expect(rewardKind('ghost', 0)).toBe('ghost-weapon');
    expect(rewardKind('ghost', 1)).toBe('ghost-armor');
    expect(rewardKind('wandmaker', 0)).toBe('wand-battle');
    expect(rewardKind('wandmaker', 1)).toBe('wand-utility');
    expect(rewardKind('imp', 0)).toBe('ring');
    // The blacksmith's reward is no item: the reforging window shows pairs as it did.
    expect(rewardKind('smith', 0)).toBeNull();
    expect(Object.keys(art.rewards).length).toBe(6);
    // (The sheet has a row for each podium, the CSS names them in the same order.)
    expect(png('fx/quest/reward.png').h / 48).toBe(6);
    const css = readFileSync(new URL('../src/fl-p13.css', import.meta.url), 'utf8');
    for (const [name, row] of [['ghost-weapon', 0], ['ghost-armor', 1], ['wand-battle', 2], ['wand-utility', 3], ['reforge', 4], ['ring', 5]] as const) {
      expect(css, name).toContain(`.fl-reward-slot.${name} { --rr: ${row}; }`);
    }
  });

  it('takes the tiles of the icon sheet by the designer\'s order: the goals in row 0, the givers\' faces in row 1', () => {
    const goalName: Record<Goal, string> = { rose: 'rose', skull: 'skull', curse: 'curse', dust: 'dust', berry: 'seed', fish: 'fish', ore: 'ore', blood: 'blood', monk: 'token', golem: 'golem' };
    for (const [goal, name] of Object.entries(goalName)) expect(art.icons.goals[GOAL_ICON[goal as Goal]], goal).toBe(name);
    expect(art.icons.goals[PICKAXE_ICON]).toBe('pickaxe');
    expect(art.icons.badges.map((b) => b)).toEqual(['ghost', 'wandmaker', 'blacksmith', 'imp']);
    const badge: Record<QuestId, string> = { ghost: 'ghost', wandmaker: 'wandmaker', smith: 'blacksmith', imp: 'imp' };
    for (const [id, name] of Object.entries(badge)) expect(art.icons.badges[BADGE_ICON[id as QuestId]], id).toBe(name);
    expect(png('ui/quest/icons.png')).toEqual({ w: 16 * art.icons.goals.length, h: 32 });
    // Every goal of the data has an icon (the data's `icon`, or the goal's own name).
    for (const quests of Object.values(art.goals)) {
      for (const [goal, g] of Object.entries(quests)) expect(art.icons.goals, goal).toContain(g.icon ?? goal);
    }
  });

  it('lays the bar out as a step a unit (ore 15, tokens 8 or 6), one step for a single thing, green once the goal is met', () => {
    const { world: w, hero } = world();
    w.smithQuest = { depth: 12, given: true, done: false, reforged: false, wants: 'gold' };
    hero.items.push(createItem('weapon.pickaxe'), createItem('quest.ore', 9));
    expect(stepsOf(questCards(w, hero)[0]!)).toEqual({ of: 15, done: 9, green: false });
    expect(art.goals.blacksmith!.gold!.of).toBe(15);
    hero.items.find((i) => i.kind === 'quest.ore')!.qty = 15;
    expect(stepsOf(questCards(w, hero)[0]!)).toEqual({ of: 15, done: 15, green: true });
    w.impQuest = { depth: 18, given: true, done: false, prey: 'golem', reward: createItem('ring.accuracy') };
    hero.items.push(createItem('quest.token', 4));
    const imp = questCards(w, hero).find((c) => c.id === 'imp')!;
    expect(stepsOf(imp)).toEqual({ of: TOKENS_WANTED.golem, done: 4, green: false });
    expect(art.goals.imp!.golem!.of).toBe(TOKENS_WANTED.golem);
    expect(art.goals.imp!.monk!.of).toBe(TOKENS_WANTED.monk);
    w.quest = { depth: 3, type: 'rose', given: true, dropped: false, killsLeft: 8, done: false, weapon: createItem('weapon.sword'), armor: createItem('armor.mail') };
    expect(stepsOf(questCards(w, hero).find((c) => c.id === 'ghost')!)).toEqual({ of: 1, done: 0, green: false });
    hero.items.push(createItem('quest.rose'));
    expect(stepsOf(questCards(w, hero).find((c) => c.id === 'ghost')!)).toEqual({ of: 1, done: 1, green: true });
    w.quest.done = true;
    expect(stepsOf(questCards(w, hero).find((c) => c.id === 'ghost')!).green).toBe(true);
  });

  it('shows the bar of a card from the pack and the world only, the same in two worlds that differ in what the hero cannot see', () => {
    const a = world(7);
    const b = world(8);
    for (const { world: w, hero } of [a, b]) {
      w.wandQuest = { depth: 8, given: true, done: false, battle: createItem('wand.firebolt'), utility: createItem('wand.blink'), wants: 'fish' };
      hero.items.push(createItem('quest.ore', 2));
    }
    // Where the fish swims and the rest of the dungeon's secrets are not in the card's reach: only the pack is.
    expect(questCards(a.world, a.hero).map(stepsOf)).toEqual(questCards(b.world, b.hero).map(stepsOf));
    expect(stepsOf(questCards(a.world, a.hero)[0]!)).toEqual({ of: 1, done: 0, green: false });
  });
});
