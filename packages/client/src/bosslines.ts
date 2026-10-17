/*
 * What the bosses say besides the lines of the original (the cry when it notices the party and the last words, which view.ts logs and
 * this file's bubble repeats): a line or two at the start of the fight, at half health and at the death, in the fork's own voice. Each
 * boss has a clean pool and a foul one; the foul pool is used only in the «foul» register of the quips setting (quips.ts), and then
 * it comes with the clean one. Shown in the player's language only. The client alone: the picker rolls with Math.random, never the
 * core's generator, so no line can change a run.
 *
 * The lines are said by the boss to its victim, in the first person, and name no weapon, hero or place (any hero can meet them).
 */

export const BOSS_KINDS = ['goo', 'tengu', 'dm300', 'king', 'yog'] as const;
export type BossKind = (typeof BOSS_KINDS)[number];

/** The moments with lines: the fight starts, the boss is at half health, the boss falls. */
export const BOSS_MOMENTS = ['notice', 'half', 'death'] as const;
export type BossMoment = (typeof BOSS_MOMENTS)[number];

export interface LineSet {
  clean: readonly string[];
  foul: readonly string[];
}
type Lang = 'ru' | 'en';
type Lines = Record<BossMoment, Record<Lang, LineSet>>;

export const BOSS_LINES: Readonly<Record<BossKind, Lines>> = {
  goo: {
    notice: {
      en: {
        clean: ['Glurp... hungry... glurp.', 'Something edible! Glurp!', 'Come closer, snack. GLURP.'],
        foul: ['Fresh meat, glurp. Fuck yes.', 'Get in my belly, you little shit.'],
      },
      ru: {
        clean: ['Хлюп... голодный... хлюп.', 'Что-то съедобное! Хлюп!', 'Иди сюда, закуска. ХЛЮП.'],
        foul: ['Свежее мясо, хлюп. Заебись.', 'Лезь ко мне в брюхо, мелочь.'],
      },
    },
    half: {
      en: {
        clean: ['Glurp?! That hurt! GLURP!', 'Now I am angry. Glurp.', 'Bigger. Stronger. Glurp.'],
        foul: ['Ow, you prick! GLURP!', 'Now I am pissed, glurp.'],
      },
      ru: {
        clean: ['Хлюп?! Больно! ХЛЮП!', 'Теперь я злой. Хлюп.', 'Больше. Сильнее. Хлюп.'],
        foul: ['Ай, сука! ХЛЮП!', 'Всё, я взбешён, хлюп.'],
      },
    },
    death: {
      en: {
        clean: ['gl... urp...', 'Splat...', 'Glurp. Tell the others. Glurp.'],
        foul: ['Fuck... it... glurp...', 'Burst like a bag of shit... glurp.'],
      },
      ru: {
        clean: ['хл... юп...', 'Плюх...', 'Хлюп. Передайте остальным. Хлюп.'],
        foul: ['Блядь... хлюп...', 'Лопнул, как мешок с говном... хлюп.'],
      },
    },
  },
  tengu: {
    notice: {
      en: {
        clean: ['Nobody leaves this prison.', 'Catch me if you can.', 'I have waited for a guest.'],
        foul: ['Nobody leaves, you fuck.', 'Come on then, meatbag.'],
      },
      ru: {
        clean: ['Из этой тюрьмы никто не уходит.', 'Поймай меня, если сможешь.', 'Я ждал гостя.'],
        foul: ['Отсюда никто не уходит, мразь.', 'Ну давай, мясной мешок.'],
      },
    },
    half: {
      en: {
        clean: ['Not bad. Now keep up!', 'Too slow, mortal!', 'Now it gets fast.'],
        foul: ['Not bad for a corpse-to-be. Keep up, shithead!', 'Too slow, you sack of shit!'],
      },
      ru: {
        clean: ['Неплохо. А теперь не отставай!', 'Слишком медленно, смертный!', 'Теперь будет быстро.'],
        foul: ['Неплохо для будущего трупа. Не отставай, мудила!', 'Слишком медленно, мешок говна!'],
      },
    },
    death: {
      en: {
        clean: ['Thank you... I think.', 'The door is open... go...', 'Fast... but not enough.'],
        foul: ['Fuck... finally...', 'You bastard... you did it.'],
      },
      ru: {
        clean: ['Спасибо... наверное.', 'Дверь открыта... иди...', 'Быстрый... но не достаточно.'],
        foul: ['Блядь... наконец-то...', 'Ублюдок... ты смог.'],
      },
    },
  },
  dm300: {
    notice: {
      en: {
        clean: ['Initiating cleanup protocol.', 'Dust to dust, scrap to scrap.', 'Intruder in sector fifteen.'],
        foul: ['Initiating fuck-you protocol.', 'Intruder. Scrap it, and the bitch inside.'],
      },
      ru: {
        clean: ['Запуск протокола очистки.', 'Прах к праху, лом к лому.', 'Нарушитель в пятнадцатом секторе.'],
        foul: ['Запуск протокола «иди нахуй».', 'Нарушитель. Размолоть на лом.'],
      },
    },
    half: {
      en: {
        clean: ['Armour at fifty percent. Unacceptable.', 'Damage detected. Raising aggression.', 'Warning. Sparks. Warning.'],
        foul: ['Armour at fifty percent. Motherfucker.', 'Damage detected. Fuck. Damage. Fuck.'],
      },
      ru: {
        clean: ['Броня пятьдесят процентов. Неприемлемо.', 'Обнаружен ущерб. Повышаю агрессию.', 'Внимание. Искры. Внимание.'],
        foul: ['Броня пятьдесят процентов. Пиздец.', 'Обнаружен ущерб. Блядь. Ущерб. Блядь.'],
      },
    },
    death: {
      en: {
        clean: ['Error... error... ERR...', 'Rebooting... never.', 'Core temperature critical.'],
        foul: ['System failure, fuck.', 'Error. Error. Fuck.'],
      },
      ru: {
        clean: ['Ошибка... ошибка... ОШ...', 'Перезагрузка... никогда.', 'Критическая температура ядра.'],
        foul: ['Системный сбой, блядь.', 'Ошибка. Ошибка. Блядь.'],
      },
    },
  },
  king: {
    notice: {
      en: {
        clean: ['Kneel before the throne of the dwarves!', 'Subjects, to me!', 'My hall. My rules.'],
        foul: ['Who the fuck let you into my hall?', 'Kneel, or I will bury you.'],
      },
      ru: {
        clean: ['На колени перед троном гномов!', 'Подданные, ко мне!', 'Мой зал. Мои правила.'],
        foul: ['Какого хуя ты в моём зале?', 'На колени, или я тебя закопаю.'],
      },
    },
    half: {
      en: {
        clean: ['You wound my pride, not my crown!', 'Rise, my court. Rise!', 'The dead obey me.'],
        foul: ['You bastard! I will bury you in my own halls!', 'Rise, you rotting fucks!'],
      },
      ru: {
        clean: ['Ты ранишь мою гордость, не корону!', 'Встаньте, мой двор. Встаньте!', 'Мёртвые мне повинуются.'],
        foul: ['Ублюдок! Я похороню тебя в собственных залах!', 'Вставайте, гнилые твари!'],
      },
    },
    death: {
      en: {
        clean: ['The throne... passes...', 'My court... my crown...', 'A king falls. The dark remains.'],
        foul: ['Shit... my crown...', 'Fuck... a king, dead.'],
      },
      ru: {
        clean: ['Трон... переходит...', 'Мой двор... моя корона...', 'Король пал. Тьма осталась.'],
        foul: ['Дерьмо... моя корона...', 'Блядь... король мёртв.'],
      },
    },
  },
  yog: {
    notice: {
      en: {
        clean: ['I have waited so long.', 'Your light will go out.', 'Come closer. Into the dark.'],
        foul: ['Another candle. I will piss it out.', 'A small thing, come to die. Fuck, how sweet.'],
      },
      ru: {
        clean: ['Я так долго ждал.', 'Твой свет погаснет.', 'Подойди ближе. Во тьму.'],
        foul: ['Ещё одна свечка. Я её зассу.', 'Мелочь пришла умирать. Как мило, блядь.'],
      },
    },
    half: {
      en: {
        clean: ['You are interesting. Still pointless.', 'My fists are only the beginning.', 'Look into my eye.'],
        foul: ['Still twitching, you little fuck?', 'My fists are only the start, shithead.'],
      },
      ru: {
        clean: ['Ты любопытен. Но всё ещё бесполезен.', 'Мои кулаки — только начало.', 'Взгляни в мой глаз.'],
        foul: ['Всё ещё дёргаешься, мелкая тварь?', 'Мои кулаки — только начало, мудила.'],
      },
    },
    death: {
      en: {
        clean: ['The dark... returns...', 'Not... the end...', 'You will find what you wanted. It is not what you think.'],
        foul: ['Fuck... you.', 'A god, killed by a fucking mortal.'],
      },
      ru: {
        clean: ['Тьма... вернётся...', 'Не... конец...', 'Ты найдёшь, что хотел. Это не то, о чём ты думаешь.'],
        foul: ['Иди... нахуй.', 'Бога убил какой-то смертный, блядь.'],
      },
    },
  },
};

/** Every line a moment can say in a register (the foul register has the clean lines too). */
export function bossPool(kind: BossKind, moment: BossMoment, lang: Lang, foul: boolean): readonly string[] {
  const set = BOSS_LINES[kind][moment][lang];
  return foul ? [...set.foul, ...set.clean] : set.clean;
}

/** One line for the moment, none of the `recent` ones again if the pool has any other; `roll` is a number in [0, 1). */
export function bossLine(kind: BossKind, moment: BossMoment, lang: Lang, foul: boolean, roll: number, recent: readonly string[] = []): string {
  const pool = bossPool(kind, moment, lang, foul);
  const fresh = pool.filter((line) => !recent.includes(line));
  const from = fresh.length > 0 ? fresh : pool;
  return from[Math.min(from.length - 1, Math.floor(roll * from.length))]!;
}
