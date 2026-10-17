/*
 * The designer's place art on the cards (assets/ui/places/icons.png, places.json): which tile of the icon sheet is each place, the little
 * cards of the codex in both languages, and the icon as a node. The examine cards (placetext.ts) say what the rules say; this only gives
 * them a face. Pure data except `picon`.
 */

/** The places of the icon sheet, in its order (places.json icons.order). */
export const PLACE_ICONS = [
  'well-awareness', 'well-health', 'well-transmutation', 'pot', 'garden', 'statue', 'library', 'pedestal', 'sign', 'dew', 'altar',
] as const;

export type PlaceIcon = (typeof PLACE_ICONS)[number];

/** The designer's cards (places.json cards): the name and a line, in English and in Russian. */
export const PLACE_CARDS: Readonly<Record<PlaceIcon, { en: readonly [string, string]; ru: readonly [string, string] }>> = {
  'well-awareness': { en: ['Well of awareness', 'One drink: what you wear is known, the level is mapped, its secrets shown. Drop an unknown item in: it is identified.'], ru: ['Колодец знания', 'Один глоток: надетое опознано, уровень на карте, тайники видны. Бросьте неопознанную вещь — она опознается.'] },
  'well-health': { en: ['Well of health', 'One drink: full health, poison, burning and weakness gone. A dew vial dropped in comes out full.'], ru: ['Колодец здоровья', 'Один глоток: здоровье полностью, яд, горение и слабость проходят. Брошенная фляга для росы выйдет полной.'] },
  'well-transmutation': { en: ['Well of transmutation', 'Drinking does nothing. An item dropped in turns into another of its kind; the well dries.'], ru: ['Колодец превращения', 'Пить бесполезно. Брошенная вещь станет другой того же рода; колодец пересохнет.'] },
  'pot': { en: ['Alchemy pot', 'Three seeds make a potion: 1 in N a random one, else by the seeds.'], ru: ['Котёл', 'Три семени — зелье: с шансом 1/N случайное, иначе по семенам.'] },
  'garden': { en: ['Garden', 'Tall grass and plants; trampled grass gives dew and seeds.'], ru: ['Сад', 'Высокая трава и растения; примятая трава даёт росу и семена.'] },
  'statue': { en: ['Statue', 'A statue holding a weapon may wake and fight; it drops that weapon.'], ru: ['Статуя', 'Статуя с оружием может ожить и напасть; оружие останется после неё.'] },
  'library': { en: ['Library', 'Bookshelves burn; scrolls lie among them.'], ru: ['Библиотека', 'Книжные полки горят; среди них лежат свитки.'] },
  'pedestal': { en: ['Pedestal', 'A prize lies on it.'], ru: ['Постамент', 'На нём лежит награда.'] },
  'sign': { en: ['Sign', 'Read it: a word from the dungeon.'], ru: ['Табличка', 'Прочтите: весточка подземелья.'] },
  'dew': { en: ['Dew', 'A drop heals a little; a vial gathers it.'], ru: ['Роса', 'Капля немного лечит; фляга её собирает.'] },
  'altar': { en: ['Altar', 'Sacrifice a monster in its flames for a prize.'], ru: ['Алтарь', 'Принесите монстра в жертву в его пламени — получите награду.'] },
};

/** An icon of the sheet as a node (`scale` is the size in tiles of 16 px; the stylesheet's own is 3). */
export function picon(icon: PlaceIcon, scale?: number): HTMLElement {
  const node = document.createElement('i');
  node.className = 'fl-picon';
  node.style.setProperty('--pi', String(PLACE_ICONS.indexOf(icon)));
  if (scale !== undefined) node.style.setProperty('--ps2', String(scale));
  node.setAttribute('aria-hidden', 'true');
  return node;
}
