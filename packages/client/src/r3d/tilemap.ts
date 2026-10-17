/*
 * Where the tiles are in the terrain atlas (256 x 256: the region's own sheet of 16 x 8 tiles, then the walls' sheet of 16 x 2 under
 * it, so a tile number runs on): no Three.js, no DOM, so geometry can be made and counted without a renderer.
 */

export const ATLAS_COLS = 16;
export const ATLAS_ROWS = 16;
/** The first tile of the walls' sheet (the tiles' eight rows are 128 tiles). */
export const WALLS_FIRST = 128;
/** The wall kit: row 0 the caps by neighbour mask (1 north, 2 east, 4 south, 8 west have floor); row 1 faces, edges, shadows. */
export const CAP_FIRST = WALLS_FIRST;
export const FACE_FIRST = WALLS_FIRST + 16;
export const FACE_WALL = FACE_FIRST;
export const FACE_DECO = FACE_FIRST + 1;
export const FACE_UPPER = FACE_FIRST + 2;
export const FACE_SHADE = FACE_FIRST + 3;
/** The lip of a floor that ends at a chasm, then the rock that goes down into the dark. */
export const EDGE_LIP = FACE_FIRST + 4;
export const EDGE_ROCK = FACE_FIRST + 5;
/** Contact shadows on the floor along a wall: north, east, south, west, the inner corner. */
export const SHADOW_FIRST = FACE_FIRST + 8;

/** The doors' rows (the designer's door sheet, assets/doors): after the walls' two rows, six rows of tiles. */
export const DOOR_FIRST = WALLS_FIRST + 32;
