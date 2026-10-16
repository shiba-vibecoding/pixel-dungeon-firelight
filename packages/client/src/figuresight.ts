/*
 * Which figures are drawn: the hero and the party's own, anything the hero senses (mind vision shows every creature on the level, as
 * the original's potion does), and a monster only while the cell it stands on is in sight now. In the original a sprite's `visible` is
 * `Dungeon.visible[pos]`, its cell at this moment, and it goes the moment that cell leaves the field of view.
 *
 * The cell is the monster's real one (`to`), not the cells of its last step: a puppet keeps the cell it came from (`from`) and the one
 * it aims at after its walk has ended, so a monster that once stepped out of a doorway (a cell always in sight, beside the hero) was
 * drawn in the room behind the closed door, in full colour, for as long as that cell stayed in view.
 */
export interface FigureCells {
  isHero: boolean;
  /** The cell the creature stands on (the world's). */
  to: number;
}

export const figureShown = (puppet: FigureCells, visible: readonly boolean[], seeAll: boolean): boolean => puppet.isHero || seeAll || visible[puppet.to] === true;
