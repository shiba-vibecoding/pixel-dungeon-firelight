import type { INPUT_EN } from './i18n-input';
import { plural } from './i18n-util';

/* The input stream's texts in Russian (i18n-input.ts has the English). */

export const INPUT_RU: typeof INPUT_EN = {
  settings: {
    loupe: 'Лупа касания',
    loupeNote: 'Удержите палец на карте: увеличенный пузырь покажет, что случится, если отпустить. С мышью — подпись у курсора',
    pathConfirm: 'Подтверждать путь',
    pathConfirmNote: 'Тап по дальней клетке сначала показывает путь, второй тап по ней идёт',
    pathModes: { always: 'Всегда', combat: 'В бою и для дальних', never: 'Никогда' },
    touchGuard: 'Защита от случайных касаний',
    touchGuardNote: 'Не считает касанием ладонь, касание у самого края экрана, первое касание после возврата в игру и тап при втором пальце на экране',
  },
  loupe: {
    walk: (n) => `Идти · ${n} ${plural(n, 'ход', 'хода', 'ходов')}`,
    attack: (name) => `Атаковать: ${name}`,
    approach: (name) => `Подойти: ${name}`,
    open: (n) => (n > 0 ? `Открыть · ${n} ${plural(n, 'ход', 'хода', 'ходов')}` : 'Открыть'),
    pickup: (name, n) => `Подобрать${name ? `: ${name}` : ''}${n > 0 ? ` · ${n} ${plural(n, 'ход', 'хода', 'ходов')}` : ''}`,
    descend: (n) => (n > 0 ? `Спуститься · ${n} ${plural(n, 'ход', 'хода', 'ходов')}` : 'Спуститься'),
    ascend: (n) => (n > 0 ? `Подняться · ${n} ${plural(n, 'ход', 'хода', 'ходов')}` : 'Подняться'),
    search: 'Искать здесь',
    sealed: 'Путь наверх закрыт',
    dig: 'Копать',
    jump: 'Прыгнуть в пропасть',
    throw: 'Бросить сюда',
    zap: 'Выстрелить сюда',
    special: 'Применить сюда',
    locked: 'Заперто',
    barricade: 'Завал',
    noway: 'Туда не пройти',
    examine: 'Осмотреть',
    cancel: 'Отмена',
  },
  path: {
    tag: (steps) => `${steps} ${plural(steps, 'шаг', 'шага', 'шагов')} · тап ещё раз`,
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
