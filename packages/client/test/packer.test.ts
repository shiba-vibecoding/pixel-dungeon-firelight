import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RectPacker } from '../src/r3d/packer';

const W = 2048;
const H = 1024;

/** A small deterministic generator. */
function lcg(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const assets = (path: string): string => fileURLToPath(new URL(`../public/assets/${path}`, import.meta.url));

/** The size of a PNG, from its header. */
function pngSize(path: string): [number, number] {
  const head = readFileSync(assets(path)).subarray(0, 24);
  return [head.readUInt32BE(16), head.readUInt32BE(20)];
}

describe('the sprite atlas packer', () => {
  it('puts rectangles inside the area without overlap, and says no when there is no room', () => {
    const random = lcg(7);
    const packer = new RectPacker(256, 256);
    const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
    let refused = 0;
    for (let i = 0; i < 400; i++) {
      const w = 4 + Math.floor(random() * 60);
      const h = 4 + Math.floor(random() * 60);
      const spot = packer.place(w, h);
      if (!spot) {
        refused++;
        continue;
      }
      expect(spot.x).toBeGreaterThanOrEqual(0);
      expect(spot.y).toBeGreaterThanOrEqual(0);
      expect(spot.x + w).toBeLessThanOrEqual(256);
      expect(spot.y + h).toBeLessThanOrEqual(256);
      for (const other of placed) {
        const apart = spot.x >= other.x + other.w || other.x >= spot.x + w || spot.y >= other.y + other.h || other.y >= spot.y + h;
        expect(apart).toBe(true);
      }
      placed.push({ ...spot, w, h });
    }
    expect(refused).toBeGreaterThan(0);
    expect(placed.length).toBeGreaterThan(40);
    expect(new RectPacker(10, 10).place(11, 1)).toBeNull();
    expect(new RectPacker(10, 10).place(10, 10)).toEqual({ x: 0, y: 0 });
  });

  it('places the same sizes the same way every time', () => {
    const run = (): Array<{ x: number; y: number } | null> => {
      const packer = new RectPacker(W, H);
      return [[256, 128], [256, 16], [128, 256], [336, 154], [96, 12]].map(([w, h]) => packer.place(w!, h!));
    };
    expect(run()).toEqual(run());
  });

  it('holds every sheet the game can draw, and a hero in all her views, looks and hats, in any order of arrival', () => {
    // Every sheet of the original that goes on the atlas (the monsters, the heroes, the items, the plants) and the props cut from the tiles.
    const sheets: Array<[number, number]> = readdirSync(assets('.'))
      .filter((file) => file.endsWith('.png') && !/^(avatars|badges|banner|buffs|icons|tiles|ui-|water|stones)/.test(file))
      .map((file) => pngSize(file));
    for (const file of ['chests', 'doors0', 'glint', 'splash', 'grass0', 'ambient3', 'feedback']) sheets.push(pngSize(`world/${file}.png`));
    sheets.push([16, 16], [16, 16]);
    // Part 8: the class sheet in two more views, three looks in three views (a legendary one's glow shares the place of its body), three
    // hats in three views, a pet in three views, a trail, a kill and a grave effect, the legendary aura.
    const hero = pngSize('warrior.png');
    const hat = pngSize('mart/fl/hats/warrior-straw.png');
    const pet = pngSize('mart/fl/pets/rat.png');
    const dirs: Array<[number, number]> = [];
    for (let i = 0; i < 2 + 3 * 3; i++) dirs.push(hero);
    for (let i = 0; i < 3 * 3; i++) dirs.push(hat);
    for (let i = 0; i < 3; i++) dirs.push(pet);
    dirs.push([192, 24], [192, 24], [192, 24], pngSize('mart/fl/legendary/warrior-forgeborn-aura.png'));
    const random = lcg(42);
    for (let trial = 0; trial < 300; trial++) {
      const packer = new RectPacker(W, H);
      for (const [w, h] of shuffled([...sheets, ...dirs], random)) expect(packer.place(w, h)).not.toBeNull();
    }
  });
});
