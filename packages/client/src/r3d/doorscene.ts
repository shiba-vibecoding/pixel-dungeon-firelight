/*
 * The doors of the level as the designer's part 10 draws them (doorkit.ts), and what happens to them: everything that is not fixed
 * geometry (levelgeom.ts writes the thresholds, frames and plaques once, with the walls).
 *
 *   - the leaves: a small instanced mesh for each look (shut, locked, vault, barricade, charred) in a cut wall line or not, an instance for
 *     each door, turned about its hinge by the swing (doorswing.ts); the light of the doors (a warm line under a shut leaf, a spill on the
 *     threshold when the room beyond is lit, cold at a locked door) is a small additive mesh, written again when it changes;
 *   - the boss floor's grate over its exit, the cracks of a secret door being found and the wall that sinks into the floor: a small mesh
 *     written again while they play; the key, the flames of a barricade, sparks and dust: cards in two more;
 *   - the holds: a secret door found, a door unlocked, the exit unlocked, a barricade burnt each play out before the geometry shows the new
 *     state. `display` is the map the geometry is made from: the real one, with the cells held as they were until their play is over.
 * Nothing here is a rule of the game; it is only what is drawn.
 */
import { BufferAttribute, BufferGeometry, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, type Material, type Mesh, type Scene } from 'three';
import { HEIGHT, LENGTH, T, WIDTH } from '@pd/core';
import { DoorSwing, writeLeafMatrix } from './doorswing';
import { crackQuads, type DoorKit, type DoorLook, doorQuads, grateQuads } from './doorkit';
import { DynamicQuads } from './dynquads';
import { atlasKit, type Buffers, doorLeafBuffers, type DoorInfo, type LevelGeom, writeDoorQuads } from './levelgeom';
import { LEAN, LEAN_STRETCH } from './project';
import { reflects } from './mirror';
import { still } from './quadbatch';

/** The materials the doors are drawn with (world3d.ts makes them from the region's textures). */
export interface DoorMaterials {
  /** The leaves: the terrain's textures on an instanced mesh, depth tested and not written (a figure in a doorway is never covered). */
  leaf: Material;
  /** Cut-out parts (the grate, the cracks, the sinking wall): the terrain's own material. */
  solid: Material;
  /** The light of the doors: the door sheet's glow map, added. */
  add: Material;
  /** The effects sheet, added (sparks, flames) and laid over (a key, dust). */
  fxAdd: Material;
  fxAlpha: Material;
}

/** What is asked of the world while the doors are drawn. */
export interface DoorWorld {
  geom: LevelGeom;
  /** Whether a cell is lit by a fire that stays, or by the hero's torch: the room beyond a door that glows warm under it. */
  lit(cell: number): boolean;
  /** The hero's cell, or -1. */
  hero(): number;
  /** The hero sees this cell now (reveal included). */
  seen(cell: number): boolean;
}

/** The plays: how long each stage lasts, ms. */
export const SECRET_STAGE_MS = 160;
export const SECRET_HOLD_MS = 480;
export const SECRET_SINK_MS = 220;
export const SECRET_DUST_MS = 400;
export const KEY_FRAME_MS = 90;
export const KEY_MS = 4 * KEY_FRAME_MS;
export const CHAR_MS = 600;
export const FLAME_FRAME_MS = 120;
export const GRATE_MS = 400;

type Play =
  | { kind: 'secret'; cell: number; start: number; across: boolean; height: number }
  | { kind: 'key'; cell: number; start: number; exit: boolean; across: boolean }
  | { kind: 'burn'; cell: number; start: number };

const SHEET_W = 128;
const SHEET_H = 48;
const CAPACITY = { lights: 400, solid: 120, fx: 64 } as const;

/** The colour the gas layer gives fire (view.ts). */
const FIRE_GAS = '255, 120, 30';

/** A leaf's mesh key: the look it has and whether its wall line is cut. */
const keyOf = (look: DoorLook, cut: boolean): string => `${look}|${cut ? 'cut' : 'full'}`;

export class DoorScene {
  readonly swing = new DoorSwing();
  /** The leaf meshes, with the cell of each of their instances (blood tints a leaf by its cell). */
  leafMeshes: Array<{ mesh: InstancedMesh; cells: number[] }> = [];
  /** Counts the times the leaf meshes were made again (the blood's tint is to be written again). */
  leavesVersion = 0;
  private readonly lights: DynamicQuads;
  private readonly solids: DynamicQuads;
  private readonly fxAdd: DynamicQuads;
  private readonly fxAlpha: DynamicQuads;
  private readonly plays: Play[] = [];
  /** The terrain as the map said last: a change is told from it. */
  private readonly lastReal = new Uint8Array(LENGTH);
  private readonly shown = new Uint8Array(LENGTH);
  /** Cells whose old state is still shown, and until when. */
  private readonly holds = new Map<number, { until: number; shows: number }>();
  /** The look a leaf has instead of its terrain's (a barricade charring). */
  private readonly looks = new Map<number, DoorLook>();
  /** An exit's grate opening, from when. */
  private readonly grates = new Map<number, number>();
  /** Cells of the barricades, and which of them burn now. */
  private barricades: number[] = [];
  private readonly burning = new Set<number>();
  private exits: number[] = [];
  private signature = '';
  private lightsDirty = true;
  private extrasDirty = true;
  private heroKey = -2;
  private fxLive = false;
  private begun = false;
  private world: DoorWorld | null = null;

  constructor(private readonly scene: Scene, readonly kit: DoorKit, private readonly materials: DoorMaterials, reduced: boolean) {
    this.swing.reduced = reduced;
    this.lights = new DynamicQuads(CAPACITY.lights, materials.add, 2);
    this.solids = new DynamicQuads(CAPACITY.solid, materials.solid, 0);
    this.fxAdd = new DynamicQuads(CAPACITY.fx, materials.fxAdd, 3);
    this.fxAlpha = new DynamicQuads(CAPACITY.fx, materials.fxAlpha, 3);
    for (const q of this.dynamic) scene.add(q.mesh);
  }

  private get dynamic(): DynamicQuads[] {
    return [this.lights, this.solids, this.fxAdd, this.fxAlpha];
  }

  /** Every mesh of the doors (the leaves and the rest). */
  get meshes(): Mesh[] {
    return [...this.leafMeshes.map((l) => l.mesh), ...this.dynamic.map((q) => q.mesh)];
  }

  /** A new floor, or the buffers made again (`keep`: the doors, and what plays on them, are kept). */
  reset(world: DoorWorld, real: ArrayLike<number>, keep = false): void {
    this.world = world;
    const g = world.geom;
    const across = (x: number, z: number): boolean => g.doorAcross(x, z);
    const passable = (x: number, z: number): boolean => g.passableAt(x, z);
    if (keep) this.swing.refresh(g.terrain, across, passable);
    else {
      this.plays.length = 0;
      this.holds.clear();
      this.looks.clear();
      this.grates.clear();
      this.burning.clear();
      for (let i = 0; i < LENGTH; i++) this.lastReal[i] = real[i]!;
      this.swing.reset(g.terrain, across, passable);
    }
    this.collect();
    this.makeLeaves(true);
    this.lightsDirty = this.extrasDirty = true;
  }

  /** Something is going on that wants frames: a leaf swinging, a play, a grate opening. */
  get moving(): boolean {
    return this.swing.moving > 0 || this.plays.length > 0 || this.grates.size > 0 || this.burning.size > 0;
  }

  /** The cells of the barricades and the exits, from the terrain the geometry has. */
  private collect(): void {
    const t = this.world!.geom.terrain;
    this.barricades = [];
    this.exits = [];
    for (let i = 0; i < LENGTH; i++) {
      if (t[i] === T.BARRICADE) this.barricades.push(i);
      else if (t[i] === T.LOCKED_EXIT || t[i] === T.UNLOCKED_EXIT) this.exits.push(i);
    }
  }

  /**
   * The map the geometry is made from. A change that is a play (a secret door found, a door unlocked, the exit unlocked, a barricade
   * burnt) in sight begins it, and the cell is shown as it was until the play is over; the rest of the map is the real one.
   */
  display(real: ArrayLike<number>, now: number): ArrayLike<number> {
    const world = this.world;
    const last = this.lastReal;
    if (!world) return real;
    const geom = world.geom;
    const holding = this.holds.size;
    for (let cell = 0; cell < LENGTH; cell++) {
      const was = last[cell]!;
      const is = real[cell]!;
      if (was === is) continue;
      last[cell] = is;
      if (!world.seen(cell)) continue;
      const x = cell % WIDTH;
      const z = Math.trunc(cell / WIDTH);
      if (was === T.SECRET_DOOR && (is === T.DOOR || is === T.OPEN_DOOR)) {
        this.plays.push({ kind: 'secret', cell, start: now, across: geom.doorAcross(x, z), height: geom.heightOf(cell) });
        this.holds.set(cell, { until: now + SECRET_HOLD_MS, shows: T.SECRET_DOOR });
      } else if (was === T.LOCKED_DOOR && (is === T.DOOR || is === T.OPEN_DOOR)) {
        this.plays.push({ kind: 'key', cell, start: now, exit: false, across: geom.doorAcross(x, z) });
        this.holds.set(cell, { until: now + KEY_MS, shows: T.LOCKED_DOOR });
      } else if (was === T.LOCKED_EXIT && is === T.UNLOCKED_EXIT) {
        this.plays.push({ kind: 'key', cell, start: now, exit: true, across: true });
        this.holds.set(cell, { until: now + KEY_MS, shows: T.LOCKED_EXIT });
      } else if (was === T.BARRICADE && is !== T.BARRICADE) {
        this.plays.push({ kind: 'burn', cell, start: now });
        this.holds.set(cell, { until: now + CHAR_MS, shows: T.BARRICADE });
        this.looks.set(cell, 'charred');
      }
    }
    if (this.holds.size !== holding) this.begun = true;
    if (this.holds.size === 0) return real;
    const shown = this.shown;
    for (let i = 0; i < LENGTH; i++) shown[i] = real[i]!;
    for (const [cell, hold] of this.holds) shown[cell] = hold.shows;
    return shown;
  }

  /** Whether a play has begun since this was last asked: the leaves are to be made again even if the geometry is the same. */
  takeBegun(): boolean {
    const begun = this.begun;
    this.begun = false;
    return begun;
  }

  /** The geometry has changed (a door found, burnt, locked or unlocked): the doors are collected again. */
  refresh(): void {
    const g = this.world?.geom;
    if (!g) return;
    this.swing.refresh(g.terrain, (x, z) => g.doorAcross(x, z), (x, z) => g.passableAt(x, z));
    this.collect();
    this.makeLeaves(false);
    this.lightsDirty = this.extrasDirty = true;
  }

  /** The map is as the geometry has it now: doors in sight that are open and were shut swing open, and the other way. Returns how many begin to. */
  sync(now: number): number {
    const world = this.world;
    if (!world) return 0;
    const began = this.swing.sync(world.geom.terrain, (cell) => world.seen(cell), now);
    if (began > 0) this.lightsDirty = true;
    return began;
  }

  private infoOf(cell: number): DoorInfo {
    const info = this.world!.geom.doorInfo(cell);
    const look = this.looks.get(cell);
    return look ? { ...info, look } : info;
  }

  /** The leaf meshes for the doors there are now: one per look and cut, made again only if which doors have which has changed. */
  private makeLeaves(force: boolean): boolean {
    if (!this.world) return false;
    const groups = new Map<string, { look: DoorLook; cut: boolean; cells: number[] }>();
    for (const leaf of this.swing.leaves) {
      const info = this.infoOf(leaf.cell);
      const key = keyOf(info.look, info.cut);
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { look: info.look, cut: info.cut, cells: [] }));
      g.cells.push(leaf.cell);
    }
    const signature = [...groups.entries()].map(([k, g]) => `${k}:${g.cells.join(',')}`).sort().join(';');
    if (!force && signature === this.signature) return false;
    this.dropLeaves();
    this.signature = signature;
    for (const g of groups.values()) {
      const b = doorLeafBuffers(this.kit, g.look, g.cut, 16, 16);
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(b.pos.slice(0, b.verts * 3), 3));
      geometry.setAttribute('normal', new BufferAttribute(b.normal.slice(0, b.verts * 3), 3));
      geometry.setAttribute('uv', new BufferAttribute(b.uv.slice(0, b.verts * 2), 2));
      geometry.setAttribute('color', new BufferAttribute(b.color.slice(0, b.verts * 3), 3));
      geometry.setIndex(new BufferAttribute(b.index.slice(0, b.indices), 1));
      const n = g.cells.length;
      // The picture's own coordinates are in the geometry: every instance maps them whole.
      const whole = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { whole[i * 4 + 2] = 1; whole[i * 4 + 3] = 1; }
      geometry.setAttribute('aUv', new InstancedBufferAttribute(whole, 4));
      const mesh = new InstancedMesh(geometry, this.materials.leaf, n);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      // (With its colour from the start: blood on a door tints it, and a mesh that takes a colour later is another program.)
      mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3).setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.renderOrder = 1;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      reflects(mesh);
      still(mesh);
      this.scene.add(mesh);
      this.leafMeshes.push({ mesh, cells: g.cells });
    }
    this.leavesVersion++;
    this.writeLeaves();
    return true;
  }

  /** The leaves' meshes are given back (the doors themselves are kept: DoorSwing). */
  dropLeaves(): void {
    for (const { mesh } of this.leafMeshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.dispose();
    }
    this.leafMeshes = [];
    this.signature = '';
  }

  /** The leaves' matrices, from their angles. */
  private writeLeaves(): void {
    for (const { mesh, cells } of this.leafMeshes) {
      const m = mesh.instanceMatrix.array as Float32Array;
      for (let i = 0; i < cells.length; i++) {
        const leaf = this.swing.leafAt(cells[i]!);
        if (leaf) writeLeafMatrix(m, i * 16, leaf.px, leaf.pz, leaf.angle, 1);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** Whether the room beyond a door, from the hero's side, is lit: the cell on the far side of the doorway from the hero. */
  private warm(info: DoorInfo, door: number, w: DoorWorld): boolean {
    const a = info.across ? door - WIDTH : door - 1;
    const b = info.across ? door + WIDTH : door + 1;
    const hero = w.hero();
    if (hero < 0) return w.lit(a) || w.lit(b);
    const d = (c: number): number => Math.abs((hero % WIDTH) - (c % WIDTH)) + Math.abs(Math.trunc(hero / WIDTH) - Math.trunc(c / WIDTH));
    return w.lit(d(a) > d(b) ? a : b);
  }

  /** The additive light of every shut door (a warm line, a glow, a spill; cold at a locked one). */
  private writeLights(): void {
    const world = this.world!;
    const b = this.lights.begin();
    const kit = atlasKit(this.kit);
    for (const leaf of this.swing.leaves) {
      if (leaf.open || leaf.moving) continue;
      if (!world.seen(leaf.cell) || this.holds.has(leaf.cell)) continue;
      const info = this.infoOf(leaf.cell);
      if (info.look === 'barricade' || info.look === 'charred') continue;
      const light = info.look === 'locked' || info.look === 'vault' ? 'cold' : this.warm(info, leaf.cell, world) ? 'warm' : null;
      if (!light || !this.lights.has(4)) continue;
      const qs = doorQuads(kit, { across: info.across, cut: info.cut, look: info.look, open: 0, hingeEast: info.hingeEast, swingSouth: info.swingSouth, light })
        .filter((q) => q.part === 'light');
      writeDoorQuads(b, qs, leaf.cell % WIDTH, Math.trunc(leaf.cell / WIDTH), kit);
    }
    this.lights.end();
  }

  /** The cut-out extras: the exits' grates, the cracks of a secret door, the wall that sinks. */
  private writeSolids(now: number): void {
    const g = this.world!.geom;
    const b = this.solids.begin();
    const kit = atlasKit(this.kit);
    for (const cell of this.exits) {
      const t = g.terrain[cell]!;
      let k = t === T.UNLOCKED_EXIT ? 1 : 0;
      const from = this.grates.get(cell);
      if (from !== undefined) {
        const u = Math.min(1, Math.max(0, (now - from) / GRATE_MS));
        k = 1 - (1 - u) * (1 - u);
      }
      if (this.solids.has(8)) writeDoorQuads(b, grateQuads(kit, k), cell % WIDTH, Math.trunc(cell / WIDTH), kit);
    }
    for (const play of this.plays) {
      if (play.kind !== 'secret' || !this.solids.has(16)) continue;
      const t = now - play.start;
      const x = play.cell % WIDTH;
      const z = Math.trunc(play.cell / WIDTH);
      if (t < SECRET_HOLD_MS) {
        writeDoorQuads(b, crackQuads(kit, Math.min(2, Math.floor(t / SECRET_STAGE_MS)), play.across, play.height), x, z, kit);
      } else if (t < SECRET_HOLD_MS + SECRET_SINK_MS) {
        // The wall sinks into the floor: a block of plain wall, lower and lower.
        const k = (t - SECRET_HOLD_MS) / SECRET_SINK_MS;
        g.wallBlock(play.cell, b, play.height * (1 - k * k));
      }
    }
    this.solids.end();
  }

  /** A card standing up (leaned back, like a sprite), centred on (x, y, z), of a frame of an effects strip. */
  private card(b: Buffers, name: 'sparks' | 'dust' | 'key' | 'flame', frame: number, x: number, y: number, z: number, size: number): void {
    const f = this.kit.fx[name];
    const k = Math.min(f.frames - 1, Math.max(0, frame));
    const w = (size * f.w) / 8;
    const h = (size * f.h) / 8;
    const sh = h * LEAN_STRETCH;
    const dy = sh * Math.cos(LEAN);
    const dz = -sh * Math.sin(LEAN);
    const y0 = y - dy / 2;
    const z0 = z - dz / 2;
    const u0 = (k * f.w + 0.01) / SHEET_W;
    const u1 = ((k + 1) * f.w - 0.01) / SHEET_W;
    const v1 = 1 - (f.row + 0.01) / SHEET_H;
    const v0 = 1 - (f.row + f.h - 0.01) / SHEET_H;
    const v = b.verts;
    const c = [x - w / 2, y0, z0, x + w / 2, y0, z0, x + w / 2, y0 + dy, z0 + dz, x - w / 2, y0 + dy, z0 + dz];
    for (let i = 0; i < 4; i++) {
      const p = (v + i) * 3;
      b.pos[p] = c[i * 3]!; b.pos[p + 1] = c[i * 3 + 1]!; b.pos[p + 2] = c[i * 3 + 2]!;
      b.normal[p] = 0; b.normal[p + 1] = Math.sin(LEAN); b.normal[p + 2] = Math.cos(LEAN);
      b.color[p] = b.color[p + 1] = b.color[p + 2] = 1;
      b.fog[(v + i) * 2] = x / WIDTH;
      b.fog[(v + i) * 2 + 1] = z / HEIGHT;
    }
    const t = v * 2;
    b.uv[t] = u0; b.uv[t + 1] = v0; b.uv[t + 2] = u1; b.uv[t + 3] = v0; b.uv[t + 4] = u1; b.uv[t + 5] = v1; b.uv[t + 6] = u0; b.uv[t + 7] = v1;
    const i = b.indices;
    b.index[i] = v; b.index[i + 1] = v + 1; b.index[i + 2] = v + 2; b.index[i + 3] = v; b.index[i + 4] = v + 2; b.index[i + 5] = v + 3;
    b.verts += 4;
    b.indices += 6;
  }

  /** Sparks, dust, a key in its lock, flames: cards over the doors that play. */
  private writeEffects(now: number): void {
    const add = this.fxAdd.begin();
    const alpha = this.fxAlpha.begin();
    for (const play of this.plays) {
      if (!this.fxAdd.has(8) || !this.fxAlpha.has(8)) break;
      const t = now - play.start;
      const x = play.cell % WIDTH;
      const z = Math.trunc(play.cell / WIDTH);
      if (play.kind === 'secret') {
        if (t >= 2 * SECRET_STAGE_MS && t < SECRET_HOLD_MS) {
          const frame = Math.floor((t - 2 * SECRET_STAGE_MS) / 70);
          const spots = play.across ? [[0.15, 1.02, 0], [0.85, 1.02, 1], [0.5, 1.05, 2]] : [[1.02, 0.15, 0], [1.02, 0.85, 1], [1.05, 0.5, 2]];
          for (const [dx, dz, f] of spots) this.card(add, 'sparks', frame + f!, x + dx!, 0.4 + (play.across ? dz! : dx!) * 0.6, z + dz!, 0.5);
        } else if (t >= SECRET_HOLD_MS + SECRET_SINK_MS && t < SECRET_HOLD_MS + SECRET_SINK_MS + SECRET_DUST_MS) {
          const base = Math.floor((t - SECRET_HOLD_MS - SECRET_SINK_MS) / 150);
          for (const [dx, dz, f] of [[0.2, 1.05, 1], [0.8, 1.1, 2], [0.5, 1.2, 0]] as const) this.card(alpha, 'dust', Math.min(3, f + base), x + dx, 0.15, z + dz, 0.6);
        }
      } else if (play.kind === 'key') {
        if (t >= KEY_MS) continue;
        const frame = Math.floor(t / KEY_FRAME_MS);
        if (play.exit) this.card(alpha, 'key', frame, x + 0.5, 0.25, z + 0.55, 0.7);
        else if (play.across) this.card(alpha, 'key', frame, x + 0.69, 0.62, z + 0.8, 0.5);
        else this.card(alpha, 'key', frame, x + 1.0, 0.62, z + 0.69, 0.5);
      }
    }
    // A barricade that burns: the flames over its boards, in step.
    const f = Math.floor(now / FLAME_FRAME_MS);
    for (const cell of this.burning) this.flames(add, cell, f);
    this.fxAdd.end();
    this.fxAlpha.end();
  }

  private flames(b: Buffers, cell: number, f: number): void {
    if (!this.fxAdd.has(4)) return;
    const x = cell % WIDTH;
    const z = Math.trunc(cell / WIDTH);
    const across = this.world!.geom.doorAcross(x, z);
    const spots = [0.3, 0.55, 0.75];
    for (let g = 0; g < 3; g++) {
      const d = spots[g]!;
      this.card(b, 'flame', (g + f) % 3, across ? x + d : x + 0.5, 0.55 + g * 0.15, across ? z + 0.62 : z + d, 0.55);
    }
  }

  /** Which barricades burn now: the ones with fire on them (the gas layer's fire cells). */
  setBurning(gas: ReadonlyArray<{ pos: number; color: string }> | undefined): void {
    if (this.barricades.length === 0 && this.burning.size === 0) return;
    const before = this.burning.size;
    this.burning.clear();
    if (gas) for (const g of gas) if (g.color === FIRE_GAS && this.barricades.includes(g.pos)) this.burning.add(g.pos);
    if (before !== this.burning.size) this.fxLive = true;
  }

  /** The light of the fires or the hero's place has changed: the light of the doors is worked out again. */
  relight(): void {
    this.lightsDirty = true;
  }

  /**
   * Once a frame: the plays' stages, the swings, and what is drawn from them. Returns whether a hold has run out (the geometry is to be
   * made again from the real map).
   */
  frame(now: number): boolean {
    const world = this.world;
    if (!world) return false;
    let released = false;
    for (const [cell, hold] of this.holds) {
      if (now < hold.until) continue;
      this.holds.delete(cell);
      this.looks.delete(cell);
      released = true;
      // The exit's grate opens now that the key has turned.
      if (hold.shows === T.LOCKED_EXIT) this.grates.set(cell, now);
    }
    if (this.plays.length > 0) {
      let kept = 0;
      for (const p of this.plays) if (now - p.start < playLength(p)) this.plays[kept++] = p;
      this.plays.length = kept;
    }
    for (const [cell, from] of this.grates) if (now - from >= GRATE_MS) { this.grates.delete(cell); this.extrasDirty = true; }
    if (this.swing.step(now)) { this.writeLeaves(); this.lightsDirty = true; }
    const hero = world.hero();
    if (hero !== this.heroKey) { this.heroKey = hero; this.lightsDirty = true; }
    if (this.lightsDirty) {
      this.writeLights();
      this.lightsDirty = false;
    }
    const solidLive = this.grates.size > 0 || this.plays.some((p) => p.kind === 'secret');
    if (this.extrasDirty || solidLive) {
      this.writeSolids(now);
      this.extrasDirty = solidLive;
    }
    const live = this.plays.length > 0 || this.burning.size > 0;
    if (live || this.fxLive) {
      this.writeEffects(now);
      this.fxLive = live;
    }
    return released;
  }

  dispose(): void {
    this.dropLeaves();
    for (const q of this.dynamic) {
      this.scene.remove(q.mesh);
      q.dispose();
    }
  }
}

/** How long a play lasts from its start, ms. */
function playLength(p: Play): number {
  if (p.kind === 'secret') return SECRET_HOLD_MS + SECRET_SINK_MS + SECRET_DUST_MS;
  if (p.kind === 'key') return KEY_MS;
  return CHAR_MS;
}
