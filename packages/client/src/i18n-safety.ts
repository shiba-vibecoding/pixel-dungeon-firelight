import type { TrapKind } from '@pd/core';

/*
 * The texts of the safety stream: the questions asked before a step onto a trap or into gas, before putting on the unknown,
 * drinking an unknown potion among enemies, or reading a scroll that changes an item for good; the verbs of the
 * confirmations; the labels of a run («counts», «repeat», «not counted»); and the death window's notes. Every rule stated
 * here is checked against this build's core (traps.ts, gas.ts, scrolls.ts, combat.ts), which is Pixel Dungeon 1.9's.
 */

/** The first letter small, for a name that stands in the middle of a sentence. */
const small = (name: string): string => name.charAt(0).toLowerCase() + name.slice(1);

export const SAFETY_EN = {
  ask: {
    cancel: 'Cancel',
    never: 'Don’t ask again',
    putOn: 'Put on',
    putOnNever: 'Put on, and don’t ask again',
    putOnTitle: (name: string) => `Put on ${name}?`,
    putOnText: (identify: string, remove: string) =>
      `Nobody knows yet whether this is cursed, and a cursed thing cannot be taken off. A ${small(identify)} shows it first; a ${small(remove)} lifts a curse.`,
    drink: 'Drink',
    drinkNever: 'Drink, and don’t ask again',
    drinkTitle: (name: string) => `Drink ${name}?`,
    drinkText: 'An enemy is in sight, and this potion is unknown. Some potions harm: toxic or paralytic gas, flames. Thrown, a harmful one hits where it lands instead of you.',
    throwInstead: 'Throw it instead',
  },
  target: {
    upgrade: 'Upgrade',
    enchant: 'Enchant',
    upgradeTitle: (name: string) => `Upgrade ${name}?`,
    upgradeText: 'The scroll is spent only if you agree. An upgrade cannot be undone.',
    upgradeLoss: (chance: number) => ` The enchantment may be driven out: ${chance}%.`,
    upgradeMaybe: ' The enchantment may be driven out.',
    enchantTitle: (name: string) => `Enchant ${name}?`,
    enchantPlain: 'It takes a new enchantment. The scroll is spent only if you agree.',
    enchantReplace: 'It takes a new enchantment, and the one it has now is replaced. The scroll is spent only if you agree.',
  },
  danger: {
    step: 'Step',
    walkIn: 'Walk in',
    trapAsk: ' Step onto it anyway?',
    gasAsk: ' Walk into it anyway?',
    gas: {
      toxic: ['Toxic gas', 'A cloud of toxic gas lies ahead: it hurts everyone who breathes it.'],
      paralytic: ['Paralytic gas', 'A cloud of paralytic gas lies ahead: whoever breathes it cannot move for a few turns.'],
    } as Record<'toxic' | 'paralytic', readonly [string, string]>,
    gasAhead: 'A cloud of gas bars the way. Tap again to walk in.',
  },
  /** PD 1.9's traps (levels/traps): the name, and what it does when stepped on (core traps.ts). */
  trap: {
    toxic: ['Toxic gas trap', 'A cloud of toxic gas bursts from it and spreads: it hurts everyone who breathes it.'],
    fire: ['Fire trap', 'It bursts into flame: whoever stands there catches fire, and the grass around burns.'],
    paralytic: ['Paralytic gas trap', 'A cloud of paralytic gas bursts from it: whoever breathes it cannot move for a few turns.'],
    poison: ['Poison trap', 'It poisons whoever steps on it: health ticks away for several turns.'],
    alarm: ['Alarm trap', 'It emits a piercing sound that calls every monster on the level to the spot.'],
    lightning: ['Lightning trap', 'It strikes whoever steps on it with lightning, for a third to two thirds of their health.'],
    gripping: ['Gripping trap', 'It snaps shut on the leg: a wound that grows with the depth, softened by armour.'],
    summoning: ['Summoning trap', 'It summons one to three monsters around whoever steps on it.'],
  } as Record<TrapKind, readonly [string, string]>,
  /** The notice while aiming from a quick slot with a target marked. */
  aimAgain: 'Tap the slot again to fire at the marked target',
  settings: {
    danger: 'Ask before a trap or gas',
    dangerNote: 'A step onto a known trap or into a cloud of gas in sight asks first',
    risky: 'Ask before risky use',
    riskyNote: 'Putting on an unidentified thing, drinking an unknown potion with an enemy in sight, or reading upgrade and enchantment scrolls asks first',
  },
  verbs: {
    holdHint: 'Hold to confirm',
    /** The hold button while held, and when full. */
    holding: 'Hold on…',
    replaced: 'Replaced',
  },
  /** The hint under a hold button's row: «hold for 1.2 s». */
  holdFor: (seconds: string) => `hold for ${seconds} s`,
  /** How a run counts, as a chip. */
  label: {
    counted: 'counts',
    repeat: 'repeat',
    custom: 'own seed',
    local: 'not counted',
    countedNote: 'This run counts for the boards.',
    repeatNote: 'Today’s dungeon was played already: this repeat is practice and does not count for the boards.',
    customNote: 'A run on your own seed does not count for records or boards.',
    localNote: 'This run is played without the server: it counts for no board.',
  },
  /** The death window's notes: what a cause means when it was no monster's blow, and what the pack held. */
  death: {
    notes: {
      hunger: 'Starvation takes health every turn and stops it coming back. Any food ends it.',
      bleeding: 'Bleeding takes health every turn and fades slowly on its own.',
      poison: 'Poison takes health every turn until it wears off. A potion of healing cures it.',
      burning: 'Fire burns every turn until it burns out; water puts it out.',
      ooze: 'Caustic ooze burns every turn until it is washed off in water.',
      deferred: 'A glyph of viscosity put the blows off for later, and then they came due a point a turn.',
      fall: 'A jump or a fall into a chasm costs health.',
      gripping: 'A gripping trap. Traps are found by searching; tap one to read what it does.',
      gas: 'Gas from a trap or a potion. A potion of purity gives a few turns of immunity to gases.',
      lightning: 'Lightning from a trap, a wand or a monster.',
      bones: 'A skeleton falls apart in an explosion of bones that hurts whoever stands near.',
      bomb: 'A bomb’s blast hurts everyone near it, the one who threw it too.',
      multiplicity: 'The armour of multiplicity pays for each mirror image in health.',
    } as Record<string, string>,
    carried: (items: number, gold: number) => `In the pack: ${items} item${items === 1 ? '' : 's'}${gold > 0 ? `, ${gold} gold` : ''}.`,
    noAnkh: 'There was no ankh in the pack to bring you back: the run ends here.',
  },
};

export const SAFETY_RU: typeof SAFETY_EN = {
  ask: {
    cancel: 'Отмена',
    never: 'Больше не спрашивать',
    putOn: 'Надеть',
    putOnNever: 'Надеть и не спрашивать',
    putOnTitle: (name: string) => `Надеть «${name}»?`,
    putOnText: (identify: string, remove: string) =>
      `Неизвестно, не проклята ли эта вещь, а проклятую вещь не снять. Проверить заранее можно: ${small(identify)}. Снять проклятие: ${small(remove)}.`,
    drink: 'Выпить',
    drinkNever: 'Выпить и не спрашивать',
    drinkTitle: (name: string) => `Выпить «${name}»?`,
    drinkText: 'Враг в поле зрения, а зелье неопознанное. Бывают вредные зелья: ядовитый или парализующий газ, пламя. Брошенное, вредное зелье сработает там, куда упадёт, а не на вас.',
    throwInstead: 'Бросить вместо этого',
  },
  target: {
    upgrade: 'Улучшить',
    enchant: 'Зачаровать',
    upgradeTitle: (name: string) => `Улучшить «${name}»?`,
    upgradeText: 'Свиток потратится, только если вы согласитесь. Улучшение не отменить.',
    upgradeLoss: (chance: number) => ` Зачарование может исчезнуть: ${chance}%.`,
    upgradeMaybe: ' Зачарование может исчезнуть.',
    enchantTitle: (name: string) => `Зачаровать «${name}»?`,
    enchantPlain: 'Вещь получит новое зачарование. Свиток потратится, только если вы согласитесь.',
    enchantReplace: 'Вещь получит новое зачарование, а нынешнее заменится. Свиток потратится, только если вы согласитесь.',
  },
  danger: {
    step: 'Наступить',
    walkIn: 'Войти',
    trapAsk: ' Всё равно наступить?',
    gasAsk: ' Всё равно войти?',
    gas: {
      toxic: ['Ядовитый газ', 'Впереди облако ядовитого газа: он вредит всякому, кто им дышит.'],
      paralytic: ['Парализующий газ', 'Впереди облако парализующего газа: надышавшийся не может двигаться несколько ходов.'],
    },
    gasAhead: 'Путь преграждает облако газа. Коснитесь ещё раз, чтобы войти.',
  },
  trap: {
    toxic: ['Ловушка с ядовитым газом', 'Из неё вырывается облако ядовитого газа и растекается: оно вредит всякому, кто им дышит.'],
    fire: ['Огненная ловушка', 'Она вспыхивает пламенем: стоящий на ней загорается, и трава вокруг горит.'],
    paralytic: ['Ловушка с парализующим газом', 'Из неё вырывается облако парализующего газа: надышавшийся не может двигаться несколько ходов.'],
    poison: ['Ядовитая ловушка', 'Она отравляет наступившего: здоровье убывает несколько ходов.'],
    alarm: ['Сигнальная ловушка', 'Она издаёт пронзительный звук и созывает на это место всех монстров уровня.'],
    lightning: ['Ловушка с молнией', 'Она бьёт наступившего молнией: от трети до двух третей его здоровья.'],
    gripping: ['Капкан', 'Он захлопывается на ноге: рана растёт с глубиной, броня её смягчает.'],
    summoning: ['Призывающая ловушка', 'Она призывает от одного до трёх монстров вокруг наступившего.'],
  },
  aimAgain: 'Коснитесь ячейки ещё раз, чтобы выстрелить по отмеченной цели',
  settings: {
    danger: 'Спрашивать про ловушки и газ',
    dangerNote: 'Шаг на известную ловушку или в облако газа в поле зрения сначала переспросит',
    risky: 'Спрашивать про рискованное',
    riskyNote: 'Надеть неопознанную вещь, выпить неизвестное зелье при враге в поле зрения или прочесть свиток улучшения или зачарования — сначала переспросит',
  },
  verbs: {
    holdHint: 'Удерживайте, чтобы подтвердить',
    holding: 'Держите…',
    replaced: 'Заменено',
  },
  holdFor: (seconds: string) => `удерживайте ${seconds.replace('.', ',')} с`,
  label: {
    counted: 'зачёт',
    repeat: 'повтор',
    custom: 'свой сид',
    local: 'без зачёта',
    countedNote: 'Этот забег идёт в зачёт досок.',
    repeatNote: 'Подземелье дня уже сыграно: этот повтор — тренировка и в доски не идёт.',
    customNote: 'Забег на своём сиде не идёт ни в рекорды, ни в доски.',
    localNote: 'Этот забег сыгран без сервера: ни в какую доску он не пойдёт.',
  },
  death: {
    notes: {
      hunger: 'Истощение отнимает здоровье каждый ход и не даёт ему вернуться. Голод утоляет любая еда.',
      bleeding: 'Кровотечение отнимает здоровье каждый ход и понемногу стихает само.',
      poison: 'Яд отнимает здоровье каждый ход, пока не выветрится. Зелье исцеления его снимает.',
      burning: 'Огонь жжёт каждый ход, пока не прогорит; вода его тушит.',
      ooze: 'Едкая слизь жжёт каждый ход, пока её не смыть водой.',
      deferred: 'Глиф вязкости отложил удары на потом, и они сработали позже — по единице за ход.',
      fall: 'Прыжок или падение в пропасть стоит здоровья.',
      gripping: 'Капкан. Ловушки находят поиском; коснитесь её, чтобы прочитать, что она делает.',
      gas: 'Газ из ловушки или зелья. Зелье очищения даёт на несколько ходов иммунитет к газам.',
      lightning: 'Молния из ловушки, палочки или от монстра.',
      bones: 'Скелет рассыпается взрывом костей, который ранит всех рядом.',
      bomb: 'Взрыв бомбы ранит всех рядом, и бросившего тоже.',
      multiplicity: 'Доспех множественности платит здоровьем за каждое зеркальное отражение.',
    },
    carried: (items: number, gold: number) => `В рюкзаке: предметов — ${items}${gold > 0 ? `, золота — ${gold}` : ''}.`,
    noAnkh: 'Анкха, чтобы вернуть вас к жизни, в рюкзаке не было: забег окончен.',
  },
};
