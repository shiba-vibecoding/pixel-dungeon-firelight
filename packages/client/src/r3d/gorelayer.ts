/*
 * The blood that stays, in the 3D view: two canvases the splats are baked into (one for the floor, one for the faces of the walls), each
 * drawn as one mesh of a quad a cell, lit by the scene and dimmed by the fog of war like what it lies on. Nothing is made per frame: a
 * splat is a rectangle painted once, the canvas is sent to the card once a frame when something was added, and the meshes are two draws
 * (only while there is blood). The floor's canvas is 1 pixel to an art pixel (768 x 768), the walls' 16 across and 24 up a face for every
 * wall cell (768 x 1152): about 6 MB of memory for the two (`bytes`), however much blood falls.
 */
import {
  BufferAttribute, BufferGeometry, CanvasTexture, DataTexture, DoubleSide, MeshLambertMaterial, Mesh, NearestFilter, RGBAFormat, type Scene,
  SRGBColorSpace, UnsignedByteType, Vector2, type WebGLRenderer,
} from 'three';
import { HEIGHT, WIDTH } from '@pd/core';
import { CHUNK, chunkPixels, faceShows, type GoreData, groundCell, POOL, shade, type Splat, WALL } from '../gore';
import { seeded } from './bodyart';
import { type AirUniforms, withFog } from './fogofwar';
import { subImage } from './texsub';
import { still } from './quadbatch';

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

/**
 * A canvas the blood is painted on and the texture of it on the card. Only what was painted is sent: the box of this frame's splats (the
 * union of them, grown by a pixel) goes up with one `copyTextureToTexture`, a few KB for a blow; the whole canvas goes up only when it
 * has been cleared and repainted (a level, a reload), and that once.
 */
class Sheet {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: CanvasTexture;
  /** The card has the canvas once the whole of it has gone up. */
  private onCard = false;
  private whole = true;
  /** The box painted since the last upload, in canvas pixels; empty while x1 < x0. */
  private x0 = 1e9;
  private y0 = 1e9;
  private x1 = -1;
  private y1 = -1;
  /**
   * What a copy reads from: the pixels of the box, read out of the canvas into a data texture (a canvas is not read by region: the
   * browser ignores the skip of rows and pixels for a picture source). The array is kept and grown, not made again.
   */
  private readonly source = new DataTexture(new Uint8Array(4), 1, 1, RGBAFormat, UnsignedByteType);
  private staging = new Uint8Array(64 * 64 * 4);
  private readonly at = new Vector2();
  /** Bytes sent to the card since the start (tests, the perf overlay). */
  uploaded = 0;
  /** Debug: send the whole canvas for every painted frame, as the first version did (to measure what the boxes save). */
  forceFull = false;
  constructor(w: number, h: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.magFilter = this.texture.minFilter = NearestFilter;
    this.texture.generateMipmaps = false;
    // (The texture is not sent until it is first drawn: this first send is the whole of it, empty.)
    this.texture.needsUpdate = true;
  }

  /** Notes a painted rectangle (canvas pixels). */
  mark(x: number, y: number, w: number, h: number): void {
    this.x0 = Math.min(this.x0, x - 1);
    this.y0 = Math.min(this.y0, y - 1);
    this.x1 = Math.max(this.x1, x + w + 1);
    this.y1 = Math.max(this.y1, y + h + 1);
  }

  get dirty(): boolean {
    return this.whole || this.x1 >= this.x0;
  }

  /** Wiped: all of it is to go up again. */
  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.whole = true;
  }

  /** Sends what was painted (once a frame). */
  flush(renderer: WebGLRenderer): void {
    if (this.whole || !this.onCard || (this.forceFull && this.x1 >= this.x0)) {
      this.whole = false;
      this.onCard = true;
      this.x0 = 1e9;
      this.y0 = 1e9;
      this.x1 = -1;
      this.y1 = -1;
      this.texture.needsUpdate = true;
      this.uploaded += this.canvas.width * this.canvas.height * 4;
      return;
    }
    if (this.x1 < this.x0) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const x0 = Math.max(0, Math.floor(this.x0));
    const y0 = Math.max(0, Math.floor(this.y0));
    const x1 = Math.min(w, Math.ceil(this.x1));
    const y1 = Math.min(h, Math.ceil(this.y1));
    this.x0 = 1e9;
    this.y0 = 1e9;
    this.x1 = -1;
    this.y1 = -1;
    if (x1 <= x0 || y1 <= y0) return;
    // (The texture is stored flipped, as a canvas texture is: the box that lies y0..y1 down the canvas lies h - y1 up from the bottom.)
    const bw = x1 - x0;
    const bh = y1 - y0;
    const pixels = this.ctx.getImageData(x0, y0, bw, bh).data;
    if (this.staging.length < pixels.length) this.staging = new Uint8Array(pixels.length);
    this.staging.set(pixels);
    const image = this.source.image as { data: Uint8Array; width: number; height: number };
    image.data = this.staging;
    image.width = bw;
    image.height = bh;
    this.source.unpackAlignment = 1;
    // (The texture is stored flipped, as a canvas texture is: the box that lies y0..y1 down the canvas lies h - y1 up from the bottom.)
    this.at.set(x0, h - y1);
    if (!subImage(renderer, this.texture, x0, h - y1, bw, bh, this.staging)) renderer.copyTextureToTexture(this.source, this.texture, null, this.at);
    this.uploaded += (x1 - x0) * (y1 - y0) * 4;
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
    still(this.floorMesh);
    still(this.wallMesh);
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

  /** The two meshes of the level (for the warm-up, which draws them once even when there is no blood). */
  get meshes(): Mesh[] {
    return [this.floorMesh, this.wallMesh].filter((m): m is Mesh => m !== null);
  }

  /** The two canvases' textures. */
  get textures(): CanvasTexture[] {
    return [this.floor.texture, this.wall.texture];
  }

  /** Bytes sent to the card so far for the floor and the walls (tests, the perf overlay). */
  /** Debug: the whole canvas on every painted frame (see Sheet.forceFull). */
  set forceFull(on: boolean) {
    this.floor.forceFull = this.wall.forceFull = on;
  }

  get uploaded(): number {
    return this.floor.uploaded + this.wall.uploaded;
  }

  get version(): number {
    return this.held;
  }

  paint(s: Splat): void {
    this.any = true;
    if (s.layer === WALL) {
      this.wall.ctx.fillStyle = css(s.rgb, ALPHA);
      this.wall.ctx.fillRect(s.x, s.y, s.w, s.h);
      this.wall.mark(s.x, s.y, s.w, s.h);
    } else if (s.layer === POOL) {
      // A blob: three or four ellipses of rows about the point, each a little off the last and of its own size (the same every replay,
      // from the place), so a pool is irregular and fills out as hits add to it. Whole pixels; overlaps darken.
      const g = this.floor.ctx;
      const rnd = seeded(((s.x * 73856093) ^ (s.y * 19349663) ^ (s.w * 83492791)) >>> 0);
      const lobes = 3 + Math.floor(rnd() * 2);
      g.fillStyle = css(s.rgb, 0.7);
      for (let n = 0; n < lobes; n++) {
        const a = rnd() * Math.PI * 2;
        const off = n === 0 ? 0 : s.w * (0.25 + rnd() * 0.4);
        const cx = Math.round(s.x + Math.cos(a) * off);
        const cy = Math.round(s.y + Math.sin(a) * off * 0.6);
        const rx = Math.max(2, Math.round(s.w * (n === 0 ? 0.85 : 0.5 + rnd() * 0.4)));
        const ry = Math.max(1, Math.round(s.h * (n === 0 ? 0.85 : 0.5 + rnd() * 0.4)));
        for (let j = -ry; j <= ry; j++) {
          const k = j / (ry + 0.5);
          const half = Math.round(rx * Math.sqrt(1 - k * k));
          if (half > 0) g.fillRect(cx - half, cy + j, half * 2, 1);
        }
      }
      this.floor.mark(s.x - s.w * 2, s.y - s.h * 2, s.w * 4, s.h * 4 + 1);
    } else if (s.layer === CHUNK) {
      // A piece of meat, bone or stone: its body, a darker edge, a glint, flat on the floor.
      const g = this.floor.ctx;
      const dark = css(shade(s.rgb, 0.5), 1);
      const light = css(shade(s.rgb, 1.75), 1);
      const body = css(shade(s.rgb, 1.15), 1);
      for (const [dx, dy, tone] of chunkPixels(s.w, s.h)) {
        g.fillStyle = tone === 1 ? dark : tone === 2 ? light : body;
        g.fillRect(s.x + dx, s.y + dy, 1, 1);
      }
      this.floor.mark(s.x - 4, s.y - 4, 9, 9);
    } else {
      this.floor.ctx.fillStyle = css(s.rgb, ALPHA);
      this.floor.ctx.fillRect(s.x, s.y, s.w, s.h);
      this.floor.mark(s.x, s.y, s.w, s.h);
    }
  }

  /** Once a frame: sends what was painted, and shows the meshes only if anything has been. */
  update(renderer: WebGLRenderer): void {
    this.floor.flush(renderer);
    this.wall.flush(renderer);
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
