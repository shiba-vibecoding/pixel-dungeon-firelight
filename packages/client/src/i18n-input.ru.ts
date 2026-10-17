import type { INPUT_EN } from './i18n-input';

/* The input stream's texts in Russian (i18n-input.ts has the English). */

export const INPUT_RU: typeof INPUT_EN = {
  settings: {
    touchGuard: 'Защита от случайных касаний',
    touchGuardNote: 'Не считает касанием ладонь, касание у самого края экрана, первое касание после возврата в игру и тап при втором пальце на экране',
  },
  feed: {
    title: 'Что было',
    open: 'Что было',
    deathLink: 'Что произошло',
    empty: 'Пока ничего: вас не ранили.',
    turn: (turn) => `ход ${turn}`,
    hint: 'Последние раны, свежие сверху.',
    died: 'Гибель',
    causes: {
      burning: 'Огонь', poison: 'Яд', bleeding: 'Кровотечение', hunger: 'Голод', ooze: 'Едкая слизь', deferred: 'Отложенные удары',
      gas: 'Ядовитый газ', trap: 'Ловушка', fall: 'Падение', lightning: 'Молния', bones: 'Кости', bomb: 'Бомба',
      multiplicity: 'Доспех множественности', wand: 'Палочка', missile: 'Метательное оружие', unknown: 'Неизвестно',
    },
  },
};
