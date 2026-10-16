import type { INPUT_EN } from './i18n-input';

/* The input stream's texts in Russian (i18n-input.ts has the English). */

export const INPUT_RU: typeof INPUT_EN = {
  settings: {
    touchGuard: 'Защита от случайных касаний',
    touchGuardNote: 'Не считает касанием ладонь, касание у самого края экрана, первое касание после возврата в игру и тап при втором пальце на экране',
  },
};
