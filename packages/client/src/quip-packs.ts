import type { Moment, QuipClass } from './quips';

/*
 * Quip packs (Pixel-Mart's catalogue, quips.*): another set of lines for the hero, picked in place of the ordinary ones for the moments
 * a pack has lines for (the rest are said as usual). These two are placeholders, a few lines each, in the clean register; the real
 * packs will be written like quips-ru.ts and quips-en.ts. The client alone, like the picker: no line can change a run.
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
  'quips.noble': {
    en: {
      any: {
        kill: ['How terribly rude of you to die.', 'Do mind the carpet.', 'One does not simply lose.', 'You have been dismissed.', 'Most unseemly, that.', 'Pray, take your leave. Permanently.'],
        descend: ['Onward, to a fresher cellar.', 'A deeper cellar, how quaint.'],
        death: ['I regret nothing. Well, perhaps the stairs.', 'How very undignified…'],
        firstBlood: ['First blood: a gentleman’s victory.'],
      },
    },
    ru: {
      any: {
        kill: ['Как неучтиво с вашей стороны умирать.', 'Прошу, не запачкайте ковёр.', 'Проигрывать — не в моих правилах.', 'Вы свободны. Навсегда.', 'Как это неприлично.', 'Позвольте откланяться. Вам — особенно.'],
        descend: ['Вперёд, в погреб посвежее.', 'Ещё глубже? Как мило.'],
        death: ['Ни о чём не жалею. Разве что о лестнице.', 'Как это недостойно…'],
        firstBlood: ['Первая кровь — победа джентльмена.'],
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
