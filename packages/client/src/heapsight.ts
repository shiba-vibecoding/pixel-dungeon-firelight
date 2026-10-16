/*
 * What lies about is drawn only where the hero sees it now, as in the original: ItemSprite.update() sets `visible = heap == null ||
 * Dungeon.visible[heap.pos]`, and PlantSprite the same. A room seen once and left shows its walls and floor, remembered, but not the
 * scroll lying in it. The field of view already holds what the original adds to it (mind vision, awareness), and the cell the hero
 * stands on is in it; mapping and clairvoyance show terrain, never items. Both renderers (render.ts, r3d/world3d.ts) ask here.
 */
export const heapDrawn = (visible: readonly boolean[], pos: number): boolean => visible[pos] === true;
