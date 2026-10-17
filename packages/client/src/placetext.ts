import { T, type Level } from '@pd/core';
import { lang } from './i18n';
import { WATER_NUMBER } from './places';

/*
 * What the special places say when they are examined, and what the toasts of their use say (places.ts has the places themselves). Every
 * line is from the rules as they are: nothing is promised that the core does not do, and nothing is told that the party has not seen.
 */

export interface PlaceCard {
  name: string;
  lines: string[];
}

const ru = (): boolean => lang === 'ru';

/** Every word the cards and the use-toasts say, in both languages. */
export const WORDS = {
  wellName: (water: number): string =>
    ru() ? ['Колодец здоровья', 'Колодец знания', 'Колодец перемен'][water]! : ['Well of health', 'Well of awareness', 'Well of transmutation'][water]!,
  wellHint: (water: number): string =>
    ru()
      ? [
        'Войдите в колодец и сделайте глоток: здоровье вернётся полностью, уйдут яд, огонь, слабость, хромота и голод. Флакон росы, уроненный в воду, наполнится. Колодец пересохнет.',
        'Войдите в колодец и сделайте глоток: надетое опознается целиком, откроются проклятия вещей в рюкзаке, а на карте проступят все тайники уровня. Неопознанная вещь, уроненная в воду, тоже опознается. Колодец пересохнет.',
        'Станьте в колодец и уроните вещь: она превратится в другую того же рода, а колодец пересохнет. Самому пить из него бесполезно.',
      ][water]!
      : [
        'Step into the well and sip: health comes back in full, and poison, fire, weakness, crippling and hunger go. A dew vial dropped into the water fills up. The well runs dry.',
        'Step into the well and sip: what you wear is known through and through, the curses of the things you carry show, and every secret of the level appears on the map. An unidentified item dropped into the water is identified too. The well runs dry.',
        'Stand in the well and drop an item: it turns into another of its kind, and the well runs dry. Drinking from it does nothing.',
      ][water]!,
  /** What the use of a well did: the toast. */
  wellDone: (water: number): string =>
    ru()
      ? ['Колодец здоровья: исцелены раны, снят яд, огонь и голод', 'Колодец знания: надетое опознано, карта и тайники уровня раскрыты', 'Колодец перемен: вода ждёт вещь, которую в неё уронят'][water]!
      : ['Well of health: wounds healed, poison, fire and hunger gone', 'Well of awareness: what you wear is known, the level\'s map and secrets are open', 'Well of transmutation: the water waits for an item dropped in'][water]!,
  transmuted: (from: string, to: string): string => (ru() ? `Колодец перемен: ${from} стал ${to}` : `Well of transmutation: ${from} became ${to}`),
  altarName: ru() ? 'Жертвенный огонь' : 'Sacrificial fire',
  altarHint: ru()
    ? 'Пока огонь горит, к нему сходятся все монстры уровня. Кто постоит в огне, будет отмечен, и если он умрёт, пока метка держится, огонь примет его как жертву. Насытившись, огонь погаснет и оставит свиток уничтожения.'
    : 'While the fire burns, every monster on the level is drawn to it. Whoever stands in it is marked, and if it dies while the mark lasts, the fire takes it as an offering. Sated, it goes out and leaves a scroll of wipe out.',
  shelfName: ru() ? 'Книжная полка' : 'Bookshelf',
  shelfHint: ru()
    ? 'Тесные ряды старых книг: через полку не пройти и не видно. Сухое дерево и бумага горят хорошо.'
    : 'Packed rows of old books: you can neither pass nor see through them. Dry wood and paper burn well.',
  pedestalName: ru() ? 'Пьедестал' : 'Pedestal',
  pedestalHint: ru() ? 'На пьедестале лежит награда. Её можно просто взять.' : 'A prize lies on the pedestal. You can simply take it.',
  pedestalEmpty: ru() ? 'Пьедестал пуст: награду уже забрали.' : 'The pedestal is empty: the prize has been taken.',
  signHint: ru() ? 'Подойдите вплотную, и вы прочтёте, что на ней написано.' : 'Step onto it to read what is written.',
  haggled: (percent: number): string => (ru() ? `Кольцо торговца: скидка ${percent}%` : `Ring of haggler: ${percent}% off`),
};

/** The card of a place the party has seen, or null if the cell is not one of them. `heapHere`: something lies on the cell, in sight. */
export function placeCard(level: Level, altarBurning: boolean, cell: number, heapHere: boolean): PlaceCard | null {
  const terrain = level.map[cell];
  switch (terrain) {
    case T.WELL: {
      const well = level.wells.find((w) => w.pos === cell);
      if (!well) return null;
      const water = WATER_NUMBER[well.water];
      return { name: WORDS.wellName(water), lines: [WORDS.wellHint(water)] };
    }
    case T.BOOKSHELF:
      return { name: WORDS.shelfName, lines: [WORDS.shelfHint] };
    case T.PEDESTAL:
      if (level.altar?.pos === cell) {
        return altarBurning
          ? { name: WORDS.altarName, lines: [WORDS.altarHint] }
          : { name: ru() ? 'Остывший алтарь' : 'Cold altar', lines: [ru() ? 'Огонь насытился и погас.' : 'The fire is sated and has gone out.'] };
      }
      return { name: WORDS.pedestalName, lines: [heapHere ? WORDS.pedestalHint : WORDS.pedestalEmpty] };
    case T.SIGN:
      return { name: ru() ? 'Табличка' : 'Sign', lines: [WORDS.signHint] };
    default:
      return null;
  }
}
