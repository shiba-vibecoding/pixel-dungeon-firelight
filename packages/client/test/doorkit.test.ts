import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { crackQuads, type DoorKit, type DoorLook, type DoorOptions, doorQuads, grateQuads, shoulderHeight, uvOf } from '../src/r3d/doorkit';

const assets = (path: string): string => fileURLToPath(new URL(`../public/assets/${path}`, import.meta.url));
const kit = JSON.parse(readFileSync(assets('doors/doors.json'), 'utf8')) as DoorKit & { regions: Record<string, unknown>; sheets: { size: [number, number] } };
const LOOKS: DoorLook[] = ['closed', 'locked', 'vault', 'barricade', 'charred'];
const base: DoorOptions = { across: true, cut: false, look: 'closed', open: 0, hingeEast: false, swingSouth: true, light: 'warm' };

/** Width and height of a PNG, from its header. */
function size(path: string): [number, number] {
  const head = readFileSync(assets(path)).subarray(16, 24);
  return [head.readUInt32BE(0), head.readUInt32BE(4)];
}
const bounds = (qs: { p: number[] }[]): number[] => {
  const xs = qs.flatMap((q) => [q.p[0]!, q.p[3]!, q.p[6]!, q.p[9]!]), zs = qs.flatMap((q) => [q.p[2]!, q.p[5]!, q.p[8]!, q.p[11]!]);
  return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
};

describe('the doors of part 10', () => {
  it('has a colour and a glow sheet for every region, 16-pixel multiples, and the shared effects', () => {
    for (const r of Object.keys(kit.regions)) {
      for (const f of [`doors/doors-${r}.png`, `doors/doors-${r}-glow.png`]) {
        expect(existsSync(assets(f)), f).toBe(true);
        expect(size(f)).toEqual(kit.sheets.size);
        expect(size(f).every((v) => v % 16 === 0)).toBe(true);
      }
    }
    expect(existsSync(assets('doors/doors-fx.png'))).toBe(true);
  });

  it('draws every picture it names from the sheet, inside it', () => {
    const [w, h] = kit.sheets.size;
    for (const look of LOOKS) for (const cut of [false, true]) for (const across of [true, false]) for (const light of ['warm', 'cold', null] as const) {
      for (const q of doorQuads(kit, { ...base, look, cut, across, light })) {
        const r = kit.atlas[q.pic];
        expect(r, q.pic).toBeDefined();
        expect(r![0] + r![2] <= w && r![1] + r![3] <= h, q.pic).toBe(true);
        for (const v of uvOf(kit, q, w, h)) expect(v >= 0 && v <= 1).toBe(true);
      }
    }
    for (const q of [...grateQuads(kit, 0), ...crackQuads(kit, 2, true, 1.5)]) expect(kit.atlas[q.pic], q.pic).toBeDefined();
  });

  it('keeps a shut door in its cell (the threshold lips out an eighth into each room) and a whole-wall frame a pixel over the wall', () => {
    const qs = doorQuads(kit, base);
    const [x0, x1, z0, z1] = bounds(qs);
    expect([x0, x1]).toEqual([0, 1]);
    expect(z0).toBeCloseTo(-0.125, 5);
    expect(z1).toBeCloseTo(1.125, 5);
    const top = Math.max(...qs.filter((q) => q.part === 'frame').flatMap((q) => [q.p[1]!, q.p[4]!, q.p[7]!, q.p[10]!]));
    expect(top).toBeCloseTo(kit.heights.wall + 1 / 16, 5);
    const cutTop = Math.max(...doorQuads(kit, { ...base, cut: true }).filter((q) => q.part === 'frame').flatMap((q) => [q.p[1]!, q.p[7]!]));
    expect(cutTop).toBeCloseTo(kit.heights.frameTop.cut, 5);
  });

  it('turns a door in a north-south wall a quarter: its threshold runs east-west', () => {
    const t = (across: boolean) => doorQuads(kit, { ...base, across, light: null }).find((q) => q.part === 'threshold' && q.n[1] === 1)!;
    const [ax0, ax1, az0, az1] = bounds([t(true)]);
    const [bx0, bx1, bz0, bz1] = bounds([t(false)]);
    expect(az1 - az0).toBeCloseTo(kit.threshold.l, 5);
    expect(ax1 - ax0).toBeCloseTo(kit.threshold.w, 5);
    expect(bx1 - bx0).toBeCloseTo(kit.threshold.l, 5);
    expect(bz1 - bz0).toBeCloseTo(kit.threshold.w, 5);
  });

  it('swings the leaf a quarter about its hinge, into the room, and puts the light out once it opens', () => {
    const open = doorQuads(kit, { ...base, open: 1 });
    expect(open.some((q) => q.part === 'light')).toBe(false);
    const leaf = open.filter((q) => q.part === 'leaf');
    const [x0, x1, z0, z1] = bounds(leaf);
    expect(x1 - x0).toBeCloseTo(kit.leaf.t, 5);                        // edge-on along the post
    expect(z1 - z0).toBeCloseTo(kit.leaf.w, 5);
    expect(z0).toBeCloseTo(0.5, 5);                                    // from the pin in the wall line, into the room
    expect(z1).toBeCloseTo(0.5 + kit.leaf.w, 5);
    expect(x0).toBeGreaterThanOrEqual(kit.post.w - kit.leaf.t);
    const north = bounds(doorQuads(kit, { ...base, open: 1, swingSouth: false }).filter((q) => q.part === 'leaf'));
    expect(north[3]).toBeLessThanOrEqual(0.5 + kit.leaf.t);
  });

  it('marks a locked door: padlocks on both faces, plaques on both lintels, cold light', () => {
    const qs = doorQuads(kit, { ...base, look: 'locked', light: 'cold' });
    expect(qs.filter((q) => q.pic === 'padlock')).toHaveLength(2);
    expect(qs.filter((q) => q.pic === 'plaque')).toHaveLength(2);
    expect(qs.filter((q) => q.part === 'light').every((q) => q.pic.endsWith('_cold'))).toBe(true);
  });

  it('lifts the grate of a boss floor\'s exit about its north edge', () => {
    const shut = bounds(grateQuads(kit, 0)), up = grateQuads(kit, 1);
    expect(shut).toEqual([0, 1, 0, 1]);
    const ys = up.flatMap((q) => [q.p[1]!, q.p[4]!, q.p[7]!, q.p[10]!]);
    expect(Math.max(...ys)).toBeGreaterThan(0.9);
  });

  it('lowers the wall south of a north-south door to a shoulder and leaves the others', () => {
    expect(shoulderHeight(kit, 1.5, true)).toBe(kit.heights.shoulder);
    expect(shoulderHeight(kit, 0.95, true)).toBe(Math.min(0.95, kit.heights.shoulder));
    expect(shoulderHeight(kit, 1.5, false)).toBe(1.5);
  });
});
