/*
 * What the 3D view loads besides the game's own sheets: the world kit (hd2d-kit.json and the maps beside it), once, and each region's
 * glow, roughness and wall maps. The region's tiles, its walls, its glow and its roughness are laid on three canvases of the same
 * layout (256 x 256: the tiles' eight rows, then the walls' two), so one terrain material reads them all and the whole level is a
 * few draws. Pixel art: nearest, no mipmaps; colour and glow are sRGB, roughness is linear.
 */
import { CanvasTexture, NearestFilter, NoColorSpace, SRGBColorSpace, type Texture } from 'three';
import { paintDoorTiles } from './doorart';
import { type Kit, materialOf, parseKit } from './kit';
import { GOLD_ORE, GOLD_REGION, orePixels } from './ore';

declare const __BUILD__: { commit: string; date: string } | undefined;
const VERSION = typeof __BUILD__ !== 'undefined' ? __BUILD__.commit : 'dev';

export * from './tilemap';

export interface SharedImages {
  particles: HTMLImageElement;
  ripple: HTMLImageElement;
  itemsEmissive: HTMLImageElement;
}

export interface RegionImages {
  tiles: HTMLImageElement;
  emissive: HTMLImageElement;
  rough: HTMLImageElement;
  walls: HTMLImageElement;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${url}`));
    image.src = url;
  });
}

/** Where the kit's files are, from the game's assets address (ending in a slash). */
export const kitUrl = (base: string, file: string): string => `${base}hd2d/${file}?v=${VERSION}`;

let shared: Promise<{ kit: Kit; images: SharedImages }> | null = null;
const regions = new Map<number, Promise<RegionImages>>();

/** The kit and the pictures every region shares, fetched once. A failure is not kept: the next ask tries again. */
export function loadKit(base: string): Promise<{ kit: Kit; images: SharedImages }> {
  shared ??= (async () => {
    const [json, particles, ripple, itemsEmissive] = await Promise.all([
      fetch(kitUrl(base, 'hd2d-kit.json')).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`kit ${r.status}`)))) as Promise<unknown>,
      loadImage(kitUrl(base, 'particles.png')),
      loadImage(kitUrl(base, 'ripple.png')),
      loadImage(kitUrl(base, 'items-emissive.png')),
    ]);
    return { kit: parseKit(json), images: { particles, ripple, itemsEmissive } };
  })().catch((error: unknown) => {
    shared = null;
    throw error;
  });
  return shared;
}

/** A region's four maps, fetched once. */
export function loadRegion(base: string, region: number, tiles: HTMLImageElement): Promise<RegionImages> {
  let promise = regions.get(region);
  if (!promise) {
    promise = Promise.all([loadImage(kitUrl(base, `tiles${region}-emissive.png`)), loadImage(kitUrl(base, `tiles${region}-rough.png`)), loadImage(kitUrl(base, `walls${region}.png`))])
      .then(([emissive, rough, walls]) => ({ tiles, emissive, rough, walls }))
      .catch((error: unknown) => {
        regions.delete(region);
        throw error;
      });
    regions.set(region, promise);
  }
  return promise;
}

export interface TerrainTextures {
  color: Texture;
  emissive: Texture;
  rough: Texture;
  /** The metalness of the caves' gold ore (ore.ts), black elsewhere; null for a region with none. */
  metal: Texture | null;
  dispose(): void;
}

const canvasOf = (width: number, height: number): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D } => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, g: canvas.getContext('2d', { willReadFrequently: true })! };
};

const nearest = (texture: CanvasTexture, srgb: boolean): CanvasTexture => {
  texture.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  texture.magFilter = texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  return texture;
};

/** A glow map as three reads it: the glow colour times its strength (alpha), made opaque. */
export function premultiplied(image: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const { canvas, g } = canvasOf(width, height);
  g.drawImage(image, 0, 0);
  const data = g.getImageData(0, 0, width, height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3]! / 255;
    px[i] = px[i]! * a;
    px[i + 1] = px[i + 1]! * a;
    px[i + 2] = px[i + 2]! * a;
    px[i + 3] = 255;
  }
  g.putImageData(data, 0, 0);
  return canvas;
}

/** The region's maps on three canvases of one layout: the tiles, then the walls' sheet under them. */
export function buildTerrain(images: RegionImages, kit: Kit, region: number): TerrainTextures {
  const width = images.tiles.width;
  const color = canvasOf(width, width);
  color.g.drawImage(images.tiles, 0, 0);
  color.g.drawImage(images.walls, 0, images.tiles.height);
  const glow = canvasOf(width, width);
  glow.g.fillStyle = '#000';
  glow.g.fillRect(0, 0, width, width);
  glow.g.drawImage(premultiplied(images.emissive, images.emissive.width, images.emissive.height), 0, 0);
  // The wall tiles that glow (the prison's barred windows, the caves' gold ore) glow on their faces too: the deco face is the tile's own glow.
  glow.g.drawImage(premultiplied(images.emissive, images.emissive.width, images.emissive.height), 12 * 16, 0, 16, 16, 16, images.tiles.height + 16, 16, 16);
  // The doors' own pieces (frame wood, steel, the slab seen from above), after the walls' rows, with a faint warm glow of their own.
  paintDoorTiles(color.g, glow.g, images.tiles, width / 16);
  const rough = canvasOf(width, width);
  // The roughness of the tiles is in their map; the walls' sheet is as rough as the kit's wall material says.
  const gray = (value: number): string => `rgb(${Math.round(value * 255)},${Math.round(value * 255)},${Math.round(value * 255)})`;
  rough.g.fillStyle = gray(1);
  rough.g.fillRect(0, 0, width, width);
  rough.g.drawImage(images.rough, 0, 0);
  rough.g.fillStyle = gray(materialOf(kit, region, 'wall_top').roughness);
  rough.g.fillRect(0, images.tiles.height, width, 16);
  rough.g.fillStyle = gray(materialOf(kit, region, 'wall_face').roughness);
  rough.g.fillRect(0, images.tiles.height + 16, width, 16);
  // The caves' gold ore is metal, by the kit (ore.ts): the pixels the glow map lights on the deco face (and on tile 12 of the sheet) are
  // given the kit's roughness in the roughness map and its metalness in a map of their own; everything else stays as it was.
  let metal: CanvasTexture | null = null;
  if (region === GOLD_REGION) {
    const m = canvasOf(width, width);
    m.g.fillStyle = '#000';
    m.g.fillRect(0, 0, width, width);
    for (const [x, y] of [[16, images.tiles.height + 16], [(GOLD_ORE.tile % 16) * 16, Math.trunc(GOLD_ORE.tile / 16) * 16]] as const) {
      for (const i of orePixels(glow.g.getImageData(x, y, 16, 16).data)) {
        const px = x + (i % 16);
        const py = y + Math.trunc(i / 16);
        rough.g.fillStyle = gray(GOLD_ORE.roughness);
        rough.g.fillRect(px, py, 1, 1);
        m.g.fillStyle = gray(GOLD_ORE.metalness);
        m.g.fillRect(px, py, 1, 1);
      }
    }
    metal = nearest(new CanvasTexture(m.canvas), false);
  }
  const textures = { color: nearest(new CanvasTexture(color.canvas), true), emissive: nearest(new CanvasTexture(glow.canvas), true), rough: nearest(new CanvasTexture(rough.canvas), false) };
  return {
    ...textures,
    metal,
    dispose() {
      textures.color.dispose();
      textures.emissive.dispose();
      textures.rough.dispose();
      metal?.dispose();
    },
  };
}

/**
 * A prop that stands over the floor in PD's tiles (high grass, fungi, a signpost) cut out of its tile: what differs from the plain
 * floor beside it stays, the rest goes clear (`tolerance`: how far, summed over the three colour channels, a pixel may be from the floor's and still
 * be floor; a statue's tile is drawn on the exact floor tile, so a card prop is cut with a small one and keeps its grey pedestal). Returns the cut-out and, where the region makes it glow, its glow, 16 x 16 each.
 */
export function propCutout(images: RegionImages, tile: number, floorTile: number, tolerance = 40): { color: HTMLCanvasElement; glow: HTMLCanvasElement } {
  const cols = images.tiles.width / 16;
  const read = (image: HTMLImageElement, t: number): ImageData => {
    const { g } = canvasOf(image.width, image.height);
    g.drawImage(image, 0, 0);
    return g.getImageData((t % cols) * 16, Math.trunc(t / cols) * 16, 16, 16);
  };
  const prop = read(images.tiles, tile);
  const floor = read(images.tiles, floorTile);
  const glow = read(images.emissive, tile);
  const out = canvasOf(16, 16);
  const glowOut = canvasOf(16, 16);
  for (let i = 0; i < prop.data.length; i += 4) {
    const d = Math.abs(prop.data[i]! - floor.data[i]!) + Math.abs(prop.data[i + 1]! - floor.data[i + 1]!) + Math.abs(prop.data[i + 2]! - floor.data[i + 2]!);
    const on = d > tolerance;
    prop.data[i + 3] = on ? 255 : 0;
    const k = on ? glow.data[i + 3]! / 255 : 0;
    glow.data[i] = glow.data[i]! * k;
    glow.data[i + 1] = glow.data[i + 1]! * k;
    glow.data[i + 2] = glow.data[i + 2]! * k;
    glow.data[i + 3] = 255;
  }
  out.g.putImageData(prop, 0, 0);
  glowOut.g.putImageData(glow, 0, 0);
  return { color: out.canvas, glow: glowOut.canvas };
}
