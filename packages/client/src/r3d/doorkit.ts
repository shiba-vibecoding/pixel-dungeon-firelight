/*
 * The doors' 3D pieces (design part 10, «doors you can read from any side»), with no Three.js and no DOM: a door as a list of quads, each
 * with its corners in the door cell's own cells (x and z 0 to 1, y up; z grows south, towards the camera), the picture on it (a rect of the
 * region's door sheet, assets/doors/doors-<region>.png and its -glow twin) and how it is drawn. All sizes are in assets/doors/doors.json.
 *
 * A door, any kind, is read by four things that show from above and from every side:
 *  - the threshold: a plate on the floor of the doorway, lipping out into both rooms, its planks or slabs running the way through;
 *  - the frame: two posts lining the doorway and two lintel beams across its faces, not the wall's material, a pixel proud of the
 *    wall's top: from above a bright rectangle round the gap, whichever way the wall runs;
 *  - the leaf: planks with a hinge knuckle and a ring on its top edge (a chain on a locked one), lower than the wall so it reads as
 *    a door in a gap and not as a wall; its face (a slot, the city's amber slits, the halls' runes) where the camera sees it;
 *  - light: a warm line under the leaf, a glow over it and a spill on the threshold when the room beyond is lit, a cold one at a
 *    locked door; a padlock on both faces and a keyhole plaque on the lintel for a locked door.
 * A door in a wall running north-south (the camera sees only its top) is the same, turned: its threshold, frame and leaf top are what
 * it is read by, and the wall cell south of it is lowered to a shoulder (`shoulderHeight`), so nothing of the doorway is hidden.
 *
 * Nothing here is a rule of the game: it is only what is drawn.
 */

export interface DoorKit {
  heights: { wall: number; cut: number; frameTop: { full: number; cut: number }; shoulder: number };
  post: { w: number };
  lintel: { h: number; d: number };
  leaf: { w: number; t: number; h: { full: number; cut: number }; lift: number };
  barricade: { t: number };
  threshold: { w: number; l: number; h: number };
  padlock: { w: number; h: number; d: number; x: number; y: number };
  plaque: { w: number; h: number; d: number; rise: number };
  spill: { l: number };
  grate: { y: number; t: number };
  atlas: Record<string, [number, number, number, number]>;
  /** The effects sheet (doors-fx.png, 128 x 48): where each strip lies (y) and its frames (w x h each, side by side from x = 0). */
  fx: Record<'sparks' | 'dust' | 'key' | 'flame', { row: number; w: number; h: number; frames: number }>;
}

export type DoorLook = 'closed' | 'locked' | 'vault' | 'barricade' | 'charred';
export type DoorLight = 'warm' | 'cold' | null;

export interface DoorOptions {
  /** The wall runs east-west (the camera sees the door's face); false: it runs north-south (the camera sees its top). */
  across: boolean;
  /** The door stands in a cut wall line (kit.cut high, the camera sees its back). */
  cut: boolean;
  look: DoorLook;
  /** How far open the leaf is: 0 shut, 1 a quarter turn (the in-between frames of the swing are any value between). */
  open: number;
  /** The hinge is at the east post (in the door's own frame: the post at x = 1); the leaf swings south (towards z = 1). */
  hingeEast: boolean;
  swingSouth: boolean;
  /** The light through the gaps of a shut door: warm (a lit room beyond), cold (locked), or none. */
  light: DoorLight;
}

/** How a quad is drawn: `solid` (cut out at one half), `add` (added light, no depth write). */
export type DoorBlend = 'solid' | 'add';

export interface DoorQuad {
  /** The picture: a name in kit.atlas; the same rect of the glow sheet is its glow. */
  pic: string;
  blend: DoorBlend;
  /** Corners, x y z: bottom left, bottom right, top right, top left as the face is seen from outside (a top face: from above, north up). */
  p: number[];
  /** The face's normal. */
  n: [number, number, number];
  /** Mirror the picture across (left to right) or up and down. */
  flipU: boolean;
  flipV: boolean;
  /** Which part this is: the leaf (it swings), the frame, the threshold, the lock, the light. */
  part: 'leaf' | 'frame' | 'threshold' | 'lock' | 'light' | 'grate' | 'crack';
}

type Face = 'S' | 'N' | 'E' | 'W' | 'T';

/** The quads of a box's faces: each face a picture (and whether it is mirrored). */
function box(
  out: DoorQuad[], part: DoorQuad['part'], x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
  faces: Partial<Record<Face, { pic: string; flipU?: boolean; flipV?: boolean; blend?: DoorBlend }>>,
): void {
  const corners: Record<Face, number[]> = {
    S: [x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1],
    N: [x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0],
    E: [x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1],
    W: [x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0],
    T: [x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0],
  };
  const normals: Record<Face, [number, number, number]> = { S: [0, 0, 1], N: [0, 0, -1], E: [1, 0, 0], W: [-1, 0, 0], T: [0, 1, 0] };
  for (const f of ['S', 'N', 'E', 'W', 'T'] as const) {
    const d = faces[f];
    if (!d) continue;
    out.push({ pic: d.pic, blend: d.blend ?? 'solid', p: corners[f], n: normals[f], flipU: !!d.flipU, flipV: !!d.flipV, part });
  }
}

/** Every corner and normal of the quads from `from` on, turned about a vertical axis through (px, pz) by `a` radians (+x towards +z). */
function turn(qs: DoorQuad[], from: number, px: number, pz: number, a: number): void {
  const c = Math.cos(a), s = Math.sin(a);
  for (let i = from; i < qs.length; i++) {
    const q = qs[i]!;
    for (let k = 0; k < 12; k += 3) {
      const dx = q.p[k]! - px, dz = q.p[k + 2]! - pz;
      q.p[k] = px + dx * c - dz * s;
      q.p[k + 2] = pz + dx * s + dz * c;
    }
    const [nx, ny, nz] = q.n;
    q.n = [nx * c - nz * s, ny, nx * s + nz * c];
  }
}

/** Mirrors quads east for west (x to 1 - x): each face keeps its front (the corners swap pairwise) and its picture mirrors. */
function mirrorX(qs: DoorQuad[], from: number): void {
  for (let i = from; i < qs.length; i++) {
    const q = qs[i]!;
    const p = q.p.map((v, k) => (k % 3 === 0 ? 1 - v : v));
    q.p = [...p.slice(3, 6), ...p.slice(0, 3), ...p.slice(9, 12), ...p.slice(6, 9)];
    q.n = [-q.n[0], q.n[1], q.n[2]];
    q.flipU = !q.flipU;
  }
}

/** A door wall running north-south: the door's own frame (wall along x) turned a quarter, so its "south" faces east. */
function stand(qs: DoorQuad[]): void {
  for (const q of qs) {
    for (let k = 0; k < 12; k += 3) {
      const x = q.p[k]!, z = q.p[k + 2]!;
      q.p[k] = z;
      q.p[k + 2] = 1 - x;
    }
    q.n = [q.n[2], q.n[1], -q.n[0]];
  }
}

/** The quads of a door in its cell. */
export function doorQuads(kit: DoorKit, o: DoorOptions): DoorQuad[] {
  const qs: DoorQuad[] = [];
  const P = kit.post.w;
  const top = o.cut ? kit.heights.frameTop.cut : kit.heights.frameTop.full;
  const sfx = o.cut ? 'cut' : '';
  const L = kit.lintel;
  // The frame: two posts lining the doorway, two lintels across its faces.
  const post = { S: { pic: `post${sfx}_face` }, N: { pic: `post${sfx}_face` }, T: { pic: 'post_top' } };
  // (Their outer faces lie on the walls either side, which are the doorway's jambs: only the faces into the doorway are drawn.)
  box(qs, 'frame', 0, 0, 0, P, top, 1, { ...post, E: { pic: `post${sfx}_side` } });
  box(qs, 'frame', 1 - P, 0, 0, 1, top, 1, { ...post, W: { pic: `post${sfx}_side` } });
  for (const [z0, z1] of [[0, L.d], [1 - L.d, 1]] as const) {
    box(qs, 'frame', P, top - L.h, z0, 1 - P, top, z1, { S: { pic: 'lintel_face' }, N: { pic: 'lintel_face' }, T: { pic: 'lintel_top' } });
  }
  // The threshold, lipping out into both rooms.
  const T = kit.threshold;
  const lip = (T.l - 1) / 2;
  const sill = o.look === 'locked' ? 'threshold_locked' : o.look === 'vault' ? 'threshold_vault' : 'threshold_plain';
  box(qs, 'threshold', P, 0, -lip, 1 - P, T.h, 1 + lip, { T: { pic: sill }, S: { pic: 'threshold_side' }, N: { pic: 'threshold_side' }, E: { pic: 'threshold_side' }, W: { pic: 'threshold_side' } });
  // The keyhole plaque on both lintels of a locked door, a pixel over the frame's top.
  if (o.look === 'locked' || o.look === 'vault') {
    const pic = o.look === 'vault' ? 'plaque_vault' : 'plaque';
    const PL = kit.plaque, x0 = 0.5 - PL.w / 2, x1 = 0.5 + PL.w / 2, y0 = top - PL.h + PL.rise, y1 = top + PL.rise;
    box(qs, 'lock', x0, y0, 1, x1, y1, 1 + PL.d, { S: { pic }, T: { pic: `${pic}_top` } });
    box(qs, 'lock', x0, y0, -PL.d, x1, y1, 0, { N: { pic }, T: { pic: `${pic}_top` } });
  }
  // The leaf (or the barricade's boards), and what hangs on it: built hinged at the west post, swung, then mirrored if the hinge is east.
  const leafStart = qs.length;
  const barricade = o.look === 'barricade' || o.look === 'charred';
  const t = barricade ? kit.barricade.t : kit.leaf.t;
  const h = o.cut ? kit.leaf.h.cut : kit.leaf.h.full;
  const lift = kit.leaf.lift;
  const face = `${o.cut ? 'leafcut' : 'leaf'}_${o.look}`;
  const z0 = 0.5 - t / 2, z1 = 0.5 + t / 2;
  box(qs, 'leaf', P, lift, z0, 1 - P, lift + h, z1, {
    S: { pic: face }, N: { pic: face, flipU: true }, T: { pic: `top_${o.look}` },
    E: { pic: o.cut ? 'edgecut' : 'edge' }, W: { pic: o.cut ? 'edgecut' : 'edge' },
  });
  if (o.look === 'locked') {
    const K = kit.padlock, x0 = kit.padlock.x - K.w / 2, x1 = x0 + K.w, y0 = lift + h * K.y, y1 = y0 + K.h;
    box(qs, 'lock', x0, y0, z1, x1, y1, z1 + K.d, { S: { pic: 'padlock' }, T: { pic: 'padlock_top' }, E: { pic: 'padlock_side' }, W: { pic: 'padlock_side' } });
    box(qs, 'lock', x0, y0, z0 - K.d, x1, y1, z0, { N: { pic: 'padlock', flipU: true }, T: { pic: 'padlock_top' }, E: { pic: 'padlock_side' }, W: { pic: 'padlock_side' } });
  }
  const shut = o.open <= 0;
  if (shut && o.light && !barricade) {
    // Light through the gaps: a line under the leaf and a glow over it (to the lintels), on both faces; a spill on the threshold.
    const c = o.light;
    const lintelUnder = top - L.h;
    for (const [z, f] of [[z1 + 0.003, 'S'], [z0 - 0.003, 'N']] as const) {
      box(qs, 'light', P, T.h, f === 'S' ? z - 0.001 : z, 1 - P, lift + 0.03, f === 'S' ? z : z + 0.001, { [f]: { pic: `strip_${c}`, blend: 'add' } });
      if (lintelUnder > lift + h + 0.01) box(qs, 'light', P, lift + h, f === 'S' ? 0.5 - 0.001 : 0.5, 1 - P, lintelUnder, f === 'S' ? 0.5 : 0.5 + 0.001, { [f]: { pic: `transom_${c}`, blend: 'add' } });
    }
    const S = kit.spill.l, y = T.h + 0.002;
    box(qs, 'light', P, y - 0.001, z1, 1 - P, y, z1 + S, { T: { pic: `spill_${c}`, blend: 'add' } });
    box(qs, 'light', P, y - 0.001, z0 - S, 1 - P, y, z0, { T: { pic: `spill_${c}`, blend: 'add', flipV: true } });
  }
  // Swing: about the pin at the west post's inner edge, in the wall line; then the east hinge is the mirror.
  if (o.open > 0) {
    const leafParts = qs.slice(leafStart).filter((q) => q.part === 'leaf' || q.part === 'lock');
    qs.length = leafStart;
    qs.push(...leafParts);
    turn(qs, leafStart, P, 0.5, (o.swingSouth ? 1 : -1) * o.open * Math.PI / 2);
  }
  if (o.hingeEast) mirrorX(qs, leafStart);
  if (!o.across) stand(qs);
  return qs;
}

/**
 * The grate over a boss floor's exit (LOCKED_EXIT): a plate over the whole cell with a skull lock; it swings up about its north edge as the
 * skeleton key opens it (`open` 0 to 1 is 0 to 100 degrees), and stands open over UNLOCKED_EXIT.
 */
export function grateQuads(kit: DoorKit, open: number): DoorQuad[] {
  const qs: DoorQuad[] = [];
  const G = kit.grate;
  box(qs, 'grate', 0, G.y, 0, 1, G.y + G.t, 1, { T: { pic: 'grate' }, S: { pic: 'grate_side' }, E: { pic: 'grate_side' }, W: { pic: 'grate_side' } });
  const a = open * (100 * Math.PI) / 180;
  if (a > 0) {
    const c = Math.cos(a), s = Math.sin(a);
    for (const q of qs) {
      for (let k = 0; k < 12; k += 3) {
        const y = q.p[k + 1]! - G.y, z = q.p[k + 2]!;
        q.p[k + 1] = G.y + y * c + z * s;
        q.p[k + 2] = -y * s + z * c;
      }
      q.n = [q.n[0], q.n[1] * c + q.n[2] * s, -q.n[1] * s + q.n[2] * c];
    }
  }
  return qs;
}

/**
 * The cracks of a secret door being found (stage 0, 1, 2), over the wall that hides it: on its top, and on its south face when the wall
 * runs east-west and is whole (the face the camera sees). A hair off the wall, so they lie over it.
 */
export function crackQuads(kit: DoorKit, stage: number, across: boolean, height: number): DoorQuad[] {
  const qs: DoorQuad[] = [];
  box(qs, 'crack', 0, height, 0, 1, height + 0.003, 1, { T: { pic: `crackcap${stage}` } });
  if (across) {
    // The face picture is 24 px (a whole wall, 1.5 cells); a cut wall shows its lower part.
    box(qs, 'crack', 0, 0, 1, 1, height, 1.003, { S: { pic: `crack${stage}`, flipV: false } });
  }
  if (!across) stand(qs);
  return qs;
}

/**
 * How tall a wall cell stands beside the doors: the cell just south of a door in a wall running north-south is lowered to a shoulder
 * (`heights.shoulder`), so the doorway is not hidden behind it; any other wall is as before (`height`).
 */
export function shoulderHeight(kit: DoorKit, height: number, doorNorthRunsNorthSouth: boolean): number {
  return doorNorthRunsNorthSouth ? Math.min(height, kit.heights.shoulder) : height;
}

/** The uv rect of a picture in a sheet of `w` x `h` pixels (0 to 1, v up, as three.js has it), mirrored as the quad says. */
export function uvOf(kit: DoorKit, q: DoorQuad, w: number, h: number, part?: { v0: number; v1: number }): [number, number, number, number] {
  const [x, y, pw, ph] = kit.atlas[q.pic]!;
  let u0 = x / w, u1 = (x + pw) / w;
  let vTop = 1 - y / h, vBottom = 1 - (y + ph) / h;
  if (part) {
    const t = vTop, b = vBottom;
    vTop = b + (t - b) * part.v1;
    vBottom = b + (t - b) * part.v0;
  }
  if (q.flipU) [u0, u1] = [u1, u0];
  if (q.flipV) [vTop, vBottom] = [vBottom, vTop];
  return [u0, vBottom, u1, vTop];
}
