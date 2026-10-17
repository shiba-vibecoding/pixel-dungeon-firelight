/*
 * The machine's wounds, drawn: from a sheet of DM-300 a copy for each stage of its wear (bosslook.ts damageStage), with scuffs and
 * dents, soot and rust, and at the last stage cracks that glow, laid on the same place of every frame (so they hold still as it moves).
 * Each stage keeps what the one before had, and nothing lands off the silhouette. The copy goes on the 3D atlas in place of the sheet;
 * the cracks' glow is a second canvas of the same layout, which the atlas keeps beside it (an emissive map). Made once for each sheet and
 * stage, the first time that stage is drawn; deterministic, so the same wear looks the same everywhere (test/bossdmg.test.ts).
 */

/** A small fast generator, the same numbers for the same seed. */
export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One mark on a frame: where, and what kind. */
export interface Mark {
  x: number;
  y: number;
  kind: 'dent' | 'crack' | 'soot' | 'rust';
  /** A crack's path, as steps from (x, y). */
  path?: Array<[number, number]>;
  r?: number;
}

/**
 * The marks a stage adds to a frame of `fw` by `fh`, in the order they are laid. The marks of the stage before are the same (the seed of
 * a stage is its own), so a worse stage is the better one with more.
 */
export function marksFor(stage: number, fw: number, fh: number): Mark[] {
  const marks: Mark[] = [];
  for (let s = 1; s <= stage; s++) {
    const rnd = mulberry(0xd300 + s * 7919);
    const at = (): { x: number; y: number } => ({ x: 1 + Math.floor(rnd() * (fw - 2)), y: 1 + Math.floor(rnd() * (fh - 2)) });
    // Dents: a short dark scratch with a bright edge, a few at the first stage and more after.
    for (let i = 0; i < 3 + s; i++) {
      const p = at();
      marks.push({ ...p, kind: 'dent' });
    }
    // Soot: patches, wider with each stage.
    for (let i = 0; i < s + 1; i++) {
      const p = at();
      marks.push({ ...p, kind: 'soot', r: 2 + s + Math.floor(rnd() * 2) });
    }
    if (s >= 2) {
      for (let i = 0; i < 2; i++) {
        const p = at();
        marks.push({ ...p, kind: 'rust', r: 2 + Math.floor(rnd() * 2) });
      }
      // Cracks: a jagged line that wanders down and across.
      for (let i = 0; i < s - 1 + (s === 3 ? 2 : 0); i++) {
        const p = at();
        const path: Array<[number, number]> = [];
        let dx = rnd() < 0.5 ? -1 : 1;
        for (let k = 0; k < 5 + Math.floor(rnd() * 5); k++) {
          if (rnd() < 0.35) dx = -dx;
          path.push([dx, rnd() < 0.7 ? 1 : 0]);
        }
        marks.push({ ...p, kind: 'crack', path });
      }
    }
  }
  return marks;
}

/** A pixel of the picture, read and written in place. */
function shade(d: Uint8ClampedArray, i: number, r: number, g: number, b: number): void {
  d[i] = Math.min(255, d[i]! * r);
  d[i + 1] = Math.min(255, d[i + 1]! * g);
  d[i + 2] = Math.min(255, d[i + 2]! * b);
}

/**
 * Lays the stage's marks on an RGBA picture of frames `fw` by `fh`, the same on each frame; `glow` gets the cracks' light (opaque orange
 * where a crack is, nothing elsewhere) if it is given. Only opaque pixels are touched.
 */
export function wound(color: Uint8ClampedArray, glow: Uint8ClampedArray | null, width: number, height: number, fw: number, fh: number, stage: number): void {
  const marks = marksFor(stage, fw, fh);
  const solid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < fw && y < fh;
  for (let oy = 0; oy + fh <= height; oy += fh) {
    for (let ox = 0; ox + fw <= width; ox += fw) {
      const px = (x: number, y: number): number => ((oy + y) * width + ox + x) * 4;
      const opaque = (x: number, y: number): boolean => solid(x, y) && color[px(x, y) + 3]! > 128;
      for (const m of marks) {
        if (m.kind === 'soot' || m.kind === 'rust') {
          const r = m.r!;
          for (let y = -r; y <= r; y++) {
            for (let x = -r; x <= r; x++) {
              const d = Math.hypot(x, y);
              if (d > r || !opaque(m.x + x, m.y + y)) continue;
              // Ragged: a hash of the place thins the edge.
              const edge = (((m.x + x) * 73856093) ^ ((m.y + y) * 19349663)) & 3;
              if (d > r - 1 && edge < 2) continue;
              if (m.kind === 'soot') shade(color, px(m.x + x, m.y + y), 0.55, 0.52, 0.5);
              else shade(color, px(m.x + x, m.y + y), 1.12, 0.78, 0.55);
            }
          }
        } else if (m.kind === 'dent') {
          // A dark scratch down and to one side, its lower neighbour light.
          for (let k = 0; k < 3; k++) {
            const x = m.x + (k >> 1);
            const y = m.y + k;
            if (opaque(x, y)) shade(color, px(x, y), 0.4, 0.4, 0.42);
            if (opaque(x + 1, y + 1)) shade(color, px(x + 1, y + 1), 1.35, 1.32, 1.28);
          }
        } else {
          let x = m.x;
          let y = m.y;
          for (const [dx, dy] of m.path ?? []) {
            x += dx;
            y += dy;
            if (!opaque(x, y)) continue;
            const i = px(x, y);
            if (glow) {
              // Orange in the picture and a light in the glow map.
              color[i] = 255;
              color[i + 1] = 120;
              color[i + 2] = 32;
              glow[i] = 255;
              glow[i + 1] = 140;
              glow[i + 2] = 40;
              glow[i + 3] = 255;
            } else shade(color, i, 0.25, 0.22, 0.22);
          }
        }
      }
    }
  }
}

/** A sheet's wounded copies: the picture and the glow, by the sheet (weak, so a sheet that goes takes them) and the stage. */
const made = new WeakMap<object, Map<string, { image: HTMLCanvasElement; glow: HTMLCanvasElement | undefined }>>();

/**
 * The sheet as it looks at a stage (1 to 3; stage 0 is the sheet itself): a canvas, with the cracks' glow map at the stage that has
 * them. Null while the sheet has not loaded.
 */
export function woundedSheet(
  source: HTMLImageElement | HTMLCanvasElement, fw: number, fh: number, stage: number,
): { image: HTMLCanvasElement; glow: HTMLCanvasElement | undefined } | null {
  if (stage <= 0) return null;
  const width = source.width;
  const height = source.height;
  if (!width || !height || ('complete' in source && !source.complete)) return null;
  let byStage = made.get(source);
  if (!byStage) {
    byStage = new Map();
    made.set(source, byStage);
  }
  const key = `${stage}:${fw}x${fh}`;
  const known = byStage.get(key);
  if (known) return known;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(source, 0, 0);
  const picture = g.getImageData(0, 0, width, height);
  let glowCanvas: HTMLCanvasElement | undefined;
  let glowData: ImageData | null = null;
  const cracked = stage >= 3;
  if (cracked) {
    glowCanvas = document.createElement('canvas');
    glowCanvas.width = width;
    glowCanvas.height = height;
    glowData = glowCanvas.getContext('2d', { willReadFrequently: true })!.createImageData(width, height);
  }
  wound(picture.data, glowData ? glowData.data : null, width, height, fw, fh, stage);
  g.putImageData(picture, 0, 0);
  if (glowCanvas && glowData) glowCanvas.getContext('2d')!.putImageData(glowData, 0, 0);
  const out = { image: canvas, glow: glowCanvas };
  byStage.set(key, out);
  return out;
}
