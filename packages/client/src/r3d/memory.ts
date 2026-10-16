/*
 * How a cell looks that was seen and is not in view any more (the fog texture's 0.55): the numbers in one place, to tune quickly. No
 * imports, so the 3D shader (fogofwar.ts) and the 2D emergency path (render.ts) read the same ones. All of them ease in across the
 * fog's own gradient at the edge of the view: a cell part way between sight and memory is part way in every one of them.
 */

/** What a remembered cell keeps of its own colour, as a share of its look in the light, added before it is greyed. */
export const MEMORY_LIFT = 0.6;
/** How far its colour is drained toward grey (1: none left), with a faint cool blue-grey tint (a multiplier per channel). */
export const MEMORY_DESATURATE = 0.88;
export const MEMORY_TINT: readonly [number, number, number] = [0.9, 0.97, 1.1];
/**
 * How much of its contrast it keeps (1: all; 0: one flat grey): the cell is pulled toward `MEMORY_MID`, a mid-dark grey (linear
 * light), so walls and floor stay legible but flatter, and no darker on the whole than before.
 */
export const MEMORY_CONTRAST = 0.55;
export const MEMORY_MID = 0.12;
/** The baked pools of fire light (torches and the like) in remembered ground: the share kept, as a faint desaturated warmth. */
export const MEMORY_POOL = 0.3;
/** The glow of lava, fungi and the like in remembered ground: the share kept, and how far it is drained of colour. */
export const MEMORY_GLOW = 0.3;
export const MEMORY_GLOW_DESATURATE = 0.7;
/** How strong a baked pool of fire light is at its middle, in sight. */
export const POOL_STRENGTH = 0.85;
