/*
 * The blood that stays, in the 3D view: two canvases the splats are baked into (one for the floor, one for the faces of the walls), each
 * drawn as one mesh of a quad a cell, lit by the scene and dimmed by the fog of war like what it lies on. Nothing is made per frame: a
 * splat is a rectangle painted once, the canvas is sent to the card once a frame when something was added, and the meshes are two draws
 * (only while there is blood). The floor's canvas is 1 pixel to an art pixel (768 x 768), the walls' 16 across and 24 up a face for every
 * wall cell (768 x 1152): about 6 MB of memory for the two (`bytes`), however much blood falls.
 */
import {
  BufferAttribute, BufferGeometry, CanvasTexture, DoubleSide, MeshLambertMaterial, Mesh, NearestFilter, type Scene, SRGBColorSpace,
} from 'three';
import { HEIGHT, WIDTH } from '@pd/core';
import { faceShows, type GoreData, groundCell, POOL, type Splat, WALL } from '../gore';
import { type AirUniforms, withFog } from './fogofwar';

const CELL = 16;
const FACE = 24;
export const FLOOR_W = WIDTH * CELL;
export const FLOOR_H = HEIGHT * CELL;
export const WALL_W = WIDTH * CELL;
export const WALL_H_PX = HEIGHT * FACE;

/** How much memory the two canvases take (RGBA), bytes. */
export const GORE_BYTES = (FLOOR_W * FLOOR_H + WALL_W * WALL_H_PX) * 4;

const css = (rgb: number, a: number): string => `rgba(${(rgb >> 16) & 255}, ${(rgb >> 8) & 255}, ${rgb & 255}, ${a})`;
const ALPHA = 0.82;

class Sheet {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: CanvasTexture;
  dirty = false;
  constructor(w: number, h: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.magFilter = this.texture.minFilter = NearestFilter;
    this.texture.generateMipmaps = false;
  }
  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.dirty = true;
  }
  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.texture.needsUpdate = true;
  }
}

export class GoreLayer {
  private readonly floor = new Sheet(FLOOR_W, FLOOR_H);
  private readonly wall = new Sheet(WALL_W, WALL_H_PX);
  private floorMesh: Mesh | null = null;
  private wallMesh: Mesh | null = null;
  private readonly floorMaterial: MeshLambertMaterial;
  private readonly wallMaterial: MeshLambertMaterial;
  /** The `gore.version` the canvases hold. */
  private held = -1;
  private any = false;

  constructor(private readonly scene: Scene, air: AirUniforms) {
    const make = (sheet: Sheet): MeshLambertMaterial => {
      const m = new MeshLambertMaterial({ map: sheet.texture, transparent: true, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      withFog(m, air, 'attribute');
      return m;
    };
    this.floorMaterial = make(this.floor);
    this.wallMaterial = make(this.wall);
  }

  /** The meshes of a level: a quad on every cell that takes blood, and on every wall face that shows. */
  bindLevel(map: ArrayLike<number>, wallHeight: number): void {
    this.dropMeshes();
    const fl = new Quads();
    const wl = new Quads();
    for (let cell = 0; cell < map.length; cell++) {
      const x = cell % WIDTH;
      const z = Math.trunc(cell / WIDTH);
      const t = map[cell]!;
      if (groundCell(t)) fl.floor(x, z);
      else if (faceShows(map, cell)) wl.face(x, z, wallHeight);
    }
    this.floorMesh = fl.mesh(this.floorMaterial);
    this.wallMesh = wl.mesh(this.wallMaterial);
    this.floorMesh.renderOrder = 1;
    this.wallMesh.renderOrder = 1;
    this.scene.add(this.floorMesh, this.wallMesh);
    this.held = -1;
  }

  /** Paints the record again from the start (a depth bound, a level set). */
  replay(data: GoreData, version: number): void {
    this.floor.clear();
    this.wall.clear();
    this.any = false;
    for (const s of data.splats) this.paint(s);
    this.held = version;
  }

  get version(): number {
    return this.held;
  }

  paint(s: Splat): void {
    this.any = true;
    if (s.layer === WALL) {
      this.wall.ctx.fillStyle = css(s.rgb, ALPHA);
      this.wall.ctx.fillRect(s.x, s.y, s.w, s.h);
      this.wall.dirty = true;
    } else if (s.layer === POOL) {
      // An ellipse of rows, whole pixels, the edge a shade darker.
      const g = this.floor.ctx;
      const rows = Math.max(0, s.h);
      for (let j = -rows; j <= rows; j++) {
        const k = j / (rows + 0.5);
        const half = Math.round(s.w * Math.sqrt(1 - k * k));
        if (half <= 0) continue;
        g.fillStyle = css(s.rgb, ALPHA);
        g.fillRect(s.x - half, s.y + j, half * 2, 1);
      }
      this.floor.dirty = true;
    } else {
      this.floor.ctx.fillStyle = css(s.rgb, ALPHA);
      this.floor.ctx.fillRect(s.x, s.y, s.w, s.h);
      this.floor.dirty = true;
    }
  }

  /** Once a frame: sends what was painted, and shows the meshes only if anything has been. */
  update(): void {
    this.floor.flush();
    this.wall.flush();
    if (this.floorMesh) this.floorMesh.visible = this.any;
    if (this.wallMesh) this.wallMesh.visible = this.any;
  }

  private dropMeshes(): void {
    for (const m of [this.floorMesh, this.wallMesh]) {
      if (!m) continue;
      this.scene.remove(m);
      m.geometry.dispose();
    }
    this.floorMesh = this.wallMesh = null;
  }

  dispose(): void {
    this.dropMeshes();
    this.floorMaterial.dispose();
    this.wallMaterial.dispose();
    this.floor.texture.dispose();
    this.wall.texture.dispose();
  }
}

/** Quads a cell, static: positions, normals, uvs into the layer's canvas and the fog-of-war place each looks up. */
class Quads {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly uv: number[] = [];
  private readonly fog: number[] = [];
  private readonly index: number[] = [];

  private quad(p: number[], n: [number, number, number], u0: number, u1: number, vTop: number, vBottom: number, fx: number, fz: number, topIsFirst: boolean): void {
    const base = this.pos.length / 3;
    this.pos.push(...p);
    for (let i = 0; i < 4; i++) {
      this.nor.push(...n);
      this.fog.push(fx, fz);
    }
    // Vertices run: first-left, first-right, second-right, second-left; the first pair is the top of the picture.
    const v1 = topIsFirst ? vTop : vBottom;
    const v2 = topIsFirst ? vBottom : vTop;
    this.uv.push(u0, v1, u1, v1, u1, v2, u0, v2);
    this.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** The floor of a cell, just over the terrain. */
  floor(x: number, z: number): void {
    const y = 0.014;
    this.quad(
      [x, y, z, x + 1, y, z, x + 1, y, z + 1, x, y, z + 1], [0, 1, 0],
      (x * CELL) / FLOOR_W, ((x + 1) * CELL) / FLOOR_W, 1 - (z * CELL) / FLOOR_H, 1 - ((z + 1) * CELL) / FLOOR_H, (x + 0.5) / WIDTH, (z + 0.5) / HEIGHT, true,
    );
  }

  /** The south face of the wall at (x, z): a hair in front of the stone, as high as the wall. */
  face(x: number, z: number, h: number): void {
    const e = z + 1 + 0.004;
    this.quad(
      [x, h, e, x + 1, h, e, x + 1, 0, e, x, 0, e], [0, 0, 1],
      (x * CELL) / WALL_W, ((x + 1) * CELL) / WALL_W, 1 - (z * FACE) / WALL_H_PX, 1 - ((z + 1) * FACE) / WALL_H_PX, (x + 0.5) / WIDTH, (z + 1.5) / HEIGHT, true,
    );
  }

  mesh(material: MeshLambertMaterial): Mesh {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('aFog', new BufferAttribute(new Float32Array(this.fog), 2));
    g.setIndex(new BufferAttribute(new Uint32Array(this.index), 1));
    const m = new Mesh(g, material);
    m.frustumCulled = false;
    return m;
  }
}
