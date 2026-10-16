import type { Moment, QuipClass } from './quips';

/*
 * Quip packs (Pixel-Mart's catalogue, quips.*): another set of lines for the hero, picked in place of the ordinary ones for the moments
 * a pack has lines for (the rest are said as usual). The designer's six packs (catalog.json quips) have a few lines each, in the clean register. The client alone, like the picker: no line can change a run.
 */

type Lines = readonly string[];

/** Lines by moment; `kill` is for any class, `own` adds a class's own. */
interface PackLines {
  any: Partial<Record<Moment, Lines>>;
  own?: Partial<Record<Moment, Partial<Record<QuipClass, Lines>>>>;
}

export const QUIP_PACKS: Readonly<Record<string, Readonly<Record<'ru' | 'en', PackLines>>>> = {
  'quips.pirate': {
    en: {
      any: {
        kill: ['Yo ho ho, one less landlubber!', 'Down to the depths with ye!', 'Shiver me timbers!', 'That be the rat’s last voyage.', 'Dead men tell no tales.', 'Arr, ye should’ve paid the toll.'],
        descend: ['Anchors away, deeper we go!', 'Next deck, matey.'],
        death: ['Davy Jones, I’m comin’…', 'Sink me…'],
        firstBlood: ['First blood to the captain!'],
      },
    },
    ru: {
      any: {
        kill: ['Йо-хо-хо, одним сухопутным меньше!', 'На дно тебя, голубчик!', 'Тысяча чертей!', 'Это было последнее плавание крысы.', 'Мёртвые не болтают.', 'Надо было платить за проход, арр!'],
        descend: ['Поднять якорь, идём глубже!', 'Следующая палуба, дружище.'],
        death: ['Дэйви Джонс, я иду…', 'Пошёл ко дну…'],
        firstBlood: ['Первая кровь — капитану!'],
      },
    },
  },
  'quips.knight': {
    en: {
      any: {
        kill: ["For honour and for the crown!", "A fair fight, a fairer end.", "Thy blade was dull, foe.", "Rest now, brave rat.", "Let it be written: I won.", "By my oath, that was well struck."],
        descend: ["Onward, to the next hall!", "A deeper hall, a greater glory."],
        death: ["Tell my steed I tried…", "Honour… above all…"],
        firstBlood: ["First blood for the realm!"],
      },
    },
    ru: {
      any: {
        kill: ["За честь и за корону!", "Бой был честный, конец — честнее.", "Твой клинок был туп, враг.", "Покойся с миром, храбрая крыса.", "Пусть запишут: я победил.", "Клянусь, удар был добрый."],
        descend: ["Вперёд, в следующий зал!", "Зал глубже — слава громче."],
        death: ["Скажите моему коню, что я старался…", "Честь… превыше всего…"],
        firstBlood: ["Первая кровь — во славу королевства!"],
      },
    },
  },
  'quips.gopnik': {
    en: {
      any: {
        kill: ["Sit down, we are talking.", "Wrong alley, pal.", "Got any seeds? No? Then lie down.", "That is how we do it, in the sewers.", "Nothing personal, just the rules of the street.", "Next!"],
        descend: ["Down again, like a lift in the block.", "Another basement, same vibes."],
        death: ["Tell the guys I was a good one…", "Ugh, not by the rules…"],
        firstBlood: ["First one, easy."],
      },
    },
    ru: {
      any: {
        kill: ["Сидеть, базар есть.", "Не в тот двор зашёл, братан.", "Семки есть? Нет? Тогда лежи.", "Вот так у нас в подвалах.", "Ничего личного, просто по понятиям.", "Следующий!"],
        descend: ["Опять вниз, как лифт в хрущёвке.", "Ещё один подвал, всё те же дела."],
        death: ["Пацанам передайте — я был нормальный…", "Эх, не по понятиям…"],
        firstBlood: ["Первый, как по маслу."],
      },
    },
  },
  'quips.philosopher': {
    en: {
      any: {
        kill: ["To be slain is not to be, and so, it seems, you are not.", "Was it fate? No, it was a sword.", "Every foe is a teacher, and this one taught briefly.", "I think, therefore you were.", "What is a rat, if not a question answered?", "A fine argument, and so I ended it."],
        descend: ["The way down is also a way within.", "Depth: a question of perspective."],
        death: ["So this is the answer…", "I thought, and thus was I… alas."],
        firstBlood: ["The first premise: it falls."],
      },
    },
    ru: {
      any: {
        kill: ["Быть убитым — значит не быть, и, похоже, тебя нет.", "Рок ли это? Нет, это меч.", "Каждый враг — учитель, и этот преподал коротко.", "Я мыслю — следовательно, ты был.", "Что есть крыса, если не отвеченный вопрос?", "Хороший довод, и я поставил точку."],
        descend: ["Путь вниз — это и путь внутрь.", "Глубина — вопрос точки зрения."],
        death: ["Так вот он, ответ…", "Я мыслил — и потому был… увы."],
        firstBlood: ["Первая посылка: он падает."],
      },
    },
  },
  'quips.granny': {
    en: {
      any: {
        kill: ["Oh, you naughty thing, and I only meant to knit.", "Eat your porridge, dear. Oh, you cannot now.", "In my day foes were politer.", "There, there, sleep tight.", "And wipe your paws next time!", "My knees creak, but my aim does not."],
        descend: ["Down the stairs, mind my knees.", "Another cellar, I will check the pickles."],
        death: ["Tell the cat to be good…", "Oh, my knitting…"],
        firstBlood: ["Well, that is the first one, dear."],
      },
    },
    ru: {
      any: {
        kill: ["Ах ты, озорник, а я ведь только вязать хотела.", "Кушай кашку, милок. Ой, уже нечем.", "В моё время враги были повежливее.", "Ну-ну, баю-бай.", "И лапки вытирай в следующий раз!", "Колени скрипят, а рука не дрожит."],
        descend: ["Вниз по ступенькам, коленки берегу.", "Ещё один погреб — проверю соленья."],
        death: ["Коту скажите, чтоб вёл себя хорошо…", "Ох, мои спицы…"],
        firstBlood: ["Ну вот, первый, милок."],
      },
    },
  },
  'quips.robot': {
    en: {
      any: {
        kill: ["TARGET ELIMINATED.", "ERROR 404: ENEMY NOT FOUND.", "PROCESSING… DONE. THREAT: NONE.", "BEEP. THAT WAS EFFICIENT.", "UPDATING KILL COUNT.", "HAVE A NICE SHUTDOWN."],
        descend: ["DESCENDING. DEPTH +1.", "LOADING NEXT LEVEL… OK."],
        death: ["CRITICAL FAILURE… REBOOT?", "POWER… LOW… GOODBYE."],
        firstBlood: ["FIRST KILL: LOGGED."],
      },
    },
    ru: {
      any: {
        kill: ["ЦЕЛЬ УНИЧТОЖЕНА.", "ОШИБКА 404: ВРАГ НЕ НАЙДЕН.", "ОБРАБОТКА… ГОТОВО. УГРОЗА: НЕТ.", "БИП. ЭТО БЫЛО ЭФФЕКТИВНО.", "ОБНОВЛЯЮ СЧЁТЧИК УБИЙСТВ.", "ПРИЯТНОГО ВЫКЛЮЧЕНИЯ."],
        descend: ["СПУСК. ГЛУБИНА +1.", "ЗАГРУЖАЮ СЛЕДУЮЩИЙ УРОВЕНЬ… ОК."],
        death: ["КРИТИЧЕСКИЙ СБОЙ… ПЕРЕЗАГРУЗИТЬ?", "ЗАРЯД… НИЗКИЙ… ПРОЩАЙТЕ."],
        firstBlood: ["ПЕРВОЕ УБИЙСТВО: ЗАПИСАНО."],
      },
    },
  },
};

/** The lines a pack has for a moment (and a class), or null: the ordinary lines are used. */
export function packLines(pack: string | null, lang: 'ru' | 'en', moment: Moment, heroClass: QuipClass): Lines | null {
  const lines = pack ? QUIP_PACKS[pack]?.[lang] : undefined;
  if (!lines) return null;
  const all = [...(lines.any[moment] ?? []), ...(lines.own?.[moment]?.[heroClass] ?? [])];
  return all.length > 0 ? all : null;
}
