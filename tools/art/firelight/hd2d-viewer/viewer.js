/* Firelight HD-2D kit viewer: builds a sample room of a region from the PD 1.9 tiles and hd2d/ kit,
   lights it from hd2d-kit.json and renders a mood frame. ?r=0..4 region, &boss=1 the boss arena,
   &t=seconds the frozen time of flicker and particles, &cells=N the width that fits the screen. */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { MAPS, BOSS_MAPS, MOBS, BOSSES, CLOSE, CLOSE_MOBS } from './maps.js';

const Q = new URLSearchParams(location.search);
const R = +(Q.get('r') || 0);
const BOSS = Q.get('boss') === '1';
const T = +(Q.get('t') || 1.7);
const NAMES = ['sewers', 'prison', 'caves', 'city', 'halls'];
const RN = NAMES[R];
const kit = await (await fetch('hd2d/hd2d-kit.json')).json();
const reg = kit.regions[RN];
const env = BOSS ? { ...reg, ambient: reg.boss.ambient, fog: reg.boss.fog, particles: [...reg.particles.slice(0, 1), ...reg.boss.particles] } : reg;
const mat = (k) => ({ ...kit.materials[k], ...(reg.override?.[k] || {}) });

// a seeded random, so a frame renders the same every time
let seed = 1234 + R * 77 + (BOSS ? 999 : 0);
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/* ---------- map ---------- */
const CL = Q.has('close');
const rows = CL ? CLOSE[RN] : (BOSS ? BOSS_MAPS : MAPS)[RN];
const RULES = Q.get('rules') !== '0'; // the sprite rules: lean 20 deg, stretch, rim, shadow offset
const PAD = 7;
const W = 16, H = rows.length + PAD * 2;
const ch = (x, y) => (y < PAD || y >= H - PAD || x < 0 || x >= W) ? '#' : (rows[y - PAD][x] || '#');
const isWall = (c) => c === '#' || c === '+' || c === 't';
const isDoor = (c) => c === 'D';
const isChasm = (c) => c === 'C';
const isWater = (c) => c === '~';
const solid = (x, y) => isWall(ch(x, y));
const open = (x, y) => { const c = ch(x, y); return !isWall(c) && !isChasm(c); };
const TILE = { '.': 1, ',': 24, '_': 14, G: 2, h: 15, '~': 63, C: 0, D: 5, '>': 8, '<': 7, e: 9, S: 35, P: 11, g: 29, x: 17, y: 32, H: 1, M: 1, K: 1, a: 1, b: 1, c: 1 };
let hero = [8, 10], mob = null, boss = null; const extra = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const c = ch(x, y);
  if (c === 'H') hero = [x, y];
  if (c === 'M') mob = [x, y];
  if (c === 'K') boss = [x, y];
  if (CL && 'abc'.includes(c)) extra.push([c, x, y]);
}

/* ---------- textures ---------- */
const loadImg = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
const nearest = (t, srgb = true) => {
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
};
const canvasOf = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0); return c; };
const [tilesImg, emImg, roughImg, wallsImg, waterImg, partImg, rippleImg, itemsImg] = await Promise.all([
  `assets/tiles${R}.png`, `hd2d/tiles${R}-emissive.png`, `hd2d/tiles${R}-rough.png`, `hd2d/walls${R}.png`,
  `assets/water${R}.png`, 'hd2d/particles.png', 'hd2d/ripple.png', 'assets/items.png'].map(loadImg));

// the emissive map: glow colour premultiplied by its alpha (three reads RGB only)
const emCanvas = canvasOf(emImg);
{ const g = emCanvas.getContext('2d'), d = g.getImageData(0, 0, emCanvas.width, emCanvas.height);
  for (let i = 0; i < d.data.length; i += 4) { const a = d.data[i + 3] / 255; d.data[i] *= a; d.data[i + 1] *= a; d.data[i + 2] *= a; d.data[i + 3] = 255; }
  g.putImageData(d, 0, 0); }
const texTiles = nearest(new THREE.Texture(tilesImg)); texTiles.needsUpdate = true;
const texEm = nearest(new THREE.CanvasTexture(emCanvas));
const texRough = nearest(new THREE.Texture(roughImg), false); texRough.needsUpdate = true;
const texWalls = nearest(new THREE.Texture(wallsImg)); texWalls.needsUpdate = true;

// props drawn over the floor in PD (statues, high grass, fungi...): cut out from the floor tile to stand up as cards
function propTexture(idx) {
  const c = document.createElement('canvas'); c.width = 16; c.height = 16; const g = c.getContext('2d');
  const tc = canvasOf(tilesImg).getContext('2d');
  const a = tc.getImageData((idx % 16) * 16, Math.floor(idx / 16) * 16, 16, 16), f = tc.getImageData(16, 0, 16, 16);
  const ea = canvasOf(emImg).getContext('2d').getImageData((idx % 16) * 16, Math.floor(idx / 16) * 16, 16, 16);
  const em = g.createImageData(16, 16);
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.abs(a.data[i] - f.data[i]) + Math.abs(a.data[i + 1] - f.data[i + 1]) + Math.abs(a.data[i + 2] - f.data[i + 2]);
    a.data[i + 3] = d > 40 ? 255 : 0;
    const k = ea.data[i + 3] / 255; em.data[i] = ea.data[i] * k; em.data[i + 1] = ea.data[i + 1] * k; em.data[i + 2] = ea.data[i + 2] * k; em.data[i + 3] = 255;
  }
  g.putImageData(a, 0, 0);
  const c2 = document.createElement('canvas'); c2.width = 16; c2.height = 16; c2.getContext('2d').putImageData(em, 0, 0);
  return { map: nearest(new THREE.CanvasTexture(c)), em: nearest(new THREE.CanvasTexture(c2)) };
}
function cellTexture(img, x, y, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h);
  return nearest(new THREE.CanvasTexture(c));
}

/* ---------- renderer ---------- */
const vw = innerWidth, vh = innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(vw, vh);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const fogC = new THREE.Color(env.fog.color);
scene.background = fogC.clone();

const cam = kit.camera;
const camera = new THREE.PerspectiveCamera(cam.fov, vw / vh, 1, 200);
const cells = +(Q.get('cells') || (vw / vh < 0.8 ? 9 : 12));
const hTan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * (vw / vh);
const dist = (cells / 2) / hTan;
const target = new THREE.Vector3(hero[0] + 0.5 + (+(Q.get('dx') || 0)), 0.5, hero[1] + 0.5 + (+(Q.get('dz') || 0)) - (CL ? 0.3 : (vw / vh < 0.8 ? 3 : 2)));
const pitch = THREE.MathUtils.degToRad(+(Q.get('pitch') || cam.pitch));
camera.position.copy(target).add(new THREE.Vector3(0, Math.sin(pitch) * dist, Math.cos(pitch) * dist));
camera.lookAt(target);
scene.fog = new THREE.Fog(fogC, env.fog.near + dist, env.fog.far + dist);

/* ---------- geometry builders ---------- */
class Batch {
  constructor() { this.p = []; this.uv = []; this.n = []; this.c = []; this.i = []; }
  quad(a, b, c, d, uv, normal, shade = 1) { // a b c d counter-clockwise seen from the front; uv = [u0,v0,u1,v1]
    const o = this.p.length / 3;
    for (const v of [a, b, c, d]) { this.p.push(...v); this.n.push(...normal); this.c.push(shade, shade, shade); }
    const [u0, v0, u1, v1] = uv;
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    this.i.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  mesh(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    return new THREE.Mesh(g, material);
  }
}
const E = 0.5 / 256; // a half-texel inset against bleeding
const tileUV = (i, rowsN = 8) => { const cx = i % 16, cy = Math.floor(i / 16);
  return [cx / 16 + E, 1 - (cy + 1) / rowsN + E, (cx + 1) / 16 - E, 1 - cy / rowsN - E]; };
const kitUV = (col, row, part = null) => { // walls sheet 16 x 2
  let [u0, v0, u1, v1] = tileUV(col + row * 16, 2);
  if (part === 'top') v0 = (v0 + v1) / 2; // the upper half of the cell (texture v grows up)
  return [u0, v0, u1, v1];
};

const floorB = new Batch(), waterTileB = new Batch(), capB = new Batch(), faceB = new Batch(), aoB = new Batch(), edgeB = new Batch();
const WH = mat('wall_face').height; // 1.5
const UP = [0, 1, 0];
const props = [], torches = [], emitters = [];

for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const c = ch(x, y);
  if (isWall(c)) {
    const nOpen = open(x, y - 1) || isChasm(ch(x, y - 1)), eOpen = open(x + 1, y) || isChasm(ch(x + 1, y)),
      sOpen = open(x, y + 1) || isChasm(ch(x, y + 1)), wOpen = open(x - 1, y) || isChasm(ch(x - 1, y));
    const mask = (nOpen ? 1 : 0) | (eOpen ? 2 : 0) | (sOpen ? 4 : 0) | (wOpen ? 8 : 0);
    // rock far from any floor sinks into the dark
    let near = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (open(x + dx, y + dy)) near = 1;
    const shade = mask ? 1 : (near ? 0.55 : 0.18);
    capB.quad([x, WH, y + 1], [x + 1, WH, y + 1], [x + 1, WH, y], [x, WH, y], kitUV(mask, 0), UP, shade);
    const faceCol = c === '+' ? 1 : 0;
    const faces = [
      [sOpen, [x, 0, y + 1], [x + 1, 0, y + 1], [0, 0, 1]],
      [nOpen, [x + 1, 0, y], [x, 0, y], [0, 0, -1]],
      [eOpen, [x + 1, 0, y + 1], [x + 1, 0, y], [1, 0, 0]],
      [wOpen, [x, 0, y], [x, 0, y + 1], [-1, 0, 0]],
    ];
    for (const [ok, a, b, n] of faces) {
      if (!ok) continue;
      const side = n[2] === 1 ? 1 : (n[2] === -1 ? 0.7 : 0.85);
      faceB.quad(a, b, [b[0], 1, b[2]], [a[0], 1, a[2]], kitUV(n[2] === 1 ? faceCol : 0, 1), n, side);
      faceB.quad([a[0], 1, a[2]], [b[0], 1, b[2]], [b[0], WH, b[2]], [a[0], WH, a[2]], kitUV(2, 1, 'top'), n, side);
    }
    if (c === 't' && sOpen) torches.push([x + 0.5, y + 1]);
    continue;
  }
  if (isChasm(c)) {
    // edge faces down into the dark where the floor ends
    const sides = [[0, -1, [x + 1, 0, y], [x, 0, y], [0, 0, 1]], [0, 1, [x, 0, y + 1], [x + 1, 0, y + 1], [0, 0, -1]],
      [1, 0, [x + 1, 0, y + 1], [x + 1, 0, y], [-1, 0, 0]], [-1, 0, [x, 0, y], [x, 0, y + 1], [1, 0, 0]]];
    for (const [dx, dy, a, b, n] of sides) {
      if (!open(x + dx, y + dy)) continue;
      // the face points into the chasm: wind the quad so its front looks away from the floor
      edgeB.quad([b[0], -1, b[2]], [a[0], -1, a[2]], a, b, kitUV(4 + ((x + y) & 1), 1), n, 1);
      edgeB.quad([b[0], -3, b[2]], [a[0], -3, a[2]], [a[0], -1, a[2]], [b[0], -1, b[2]], kitUV(5, 1), n, 0.25);
    }
    continue;
  }
  // floor-like cells
  let t = TILE[c] ?? 1;
  const under = (c === 'S' || c === 'P' && false) ? 1 : t;
  if (isWater(c)) {
    // as Level.java: a bit per side that needs no shore (water, walls, doors, chasms are UNSTITCHABLE); floor gets a shore
    let m = 0; [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy], j) => { const n = ch(x + dx, y + dy); if (isWater(n) || isWall(n) || isDoor(n) || isChasm(n)) m |= 1 << j; });
    waterTileB.quad([x, 0.002, y + 1], [x + 1, 0.002, y + 1], [x + 1, 0.002, y], [x, 0.002, y], tileUV(48 + m), UP);
  } else if (isDoor(c)) {
    floorB.quad([x, 0, y + 1], [x + 1, 0, y + 1], [x + 1, 0, y], [x, 0, y], tileUV(1), UP);
    props.push({ kind: 'door', x, y });
  } else {
    const base = (c === 'h') ? (RN === 'caves' || RN === 'halls' ? 1 : 2) : (c === 'S' ? 1 : t);
    floorB.quad([x, 0, y + 1], [x + 1, 0, y + 1], [x + 1, 0, y], [x, 0, y], tileUV(base), UP);
    if (c === 'h') props.push({ kind: 'card', tile: 15, x, y, h: 1 });
    if (c === 'S') props.push({ kind: 'card', tile: 35, x, y, h: mat('statue').height });
  }
  // contact shadows along the walls
  if (!isWater(c)) {
    const ao = [[0, -1, 8], [1, 0, 9], [0, 1, 10], [-1, 0, 11]];
    for (const [dx, dy, col] of ao) if (solid(x + dx, y + dy))
      aoB.quad([x, 0.004, y + 1], [x + 1, 0.004, y + 1], [x + 1, 0.004, y], [x, 0.004, y], kitUV(col, 1), UP);
  }
  const emTiles = Object.keys(reg.emissive).filter((k) => k !== 'traps').map(Number);
  if (emTiles.includes(t) || (t === 17 || t === 32)) emitters.push({ x, y, t });
}

const fm = mat('floor');
const floorMat = new THREE.MeshStandardMaterial({ map: texTiles, emissiveMap: texEm, emissive: 0xffffff, emissiveIntensity: 1.0,
  roughnessMap: texRough, roughness: 1, metalness: 0, vertexColors: true });
scene.add(Object.assign(floorB.mesh(floorMat), { receiveShadow: true }));
const wf = mat('wall_face');
const capMat = new THREE.MeshStandardMaterial({ map: texWalls, roughness: mat('wall_top').roughness, vertexColors: true, alphaTest: 0.5 });
const wallEm = document.createElement('canvas'); wallEm.width = 256; wallEm.height = 32;
{ const g = wallEm.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 256, 32);
  if (reg.emissive['12']) g.drawImage(emCanvas, 12 * 16, 0, 16, 16, 16, 16, 16, 16); }
const faceMat = new THREE.MeshStandardMaterial({ emissiveMap: nearest(new THREE.CanvasTexture(wallEm)), emissive: 0xffffff, emissiveIntensity: 1.2, map: texWalls, roughness: wf.roughness, metalness: RN === 'caves' ? 0.15 : 0, vertexColors: true });
const caps = capB.mesh(capMat); caps.castShadow = true; caps.receiveShadow = true; scene.add(caps);
const facesM = faceB.mesh(faceMat); facesM.castShadow = true; facesM.receiveShadow = true; scene.add(facesM);
scene.add(edgeB.mesh(new THREE.MeshStandardMaterial({ map: texWalls, roughness: 0.95, vertexColors: true })));
const aoMat = new THREE.MeshBasicMaterial({ map: texWalls, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
scene.add(aoB.mesh(aoMat));
// the walls cast their shadows even as backfaces: a hidden solid block per wall cell
{
  const g = new THREE.BoxGeometry(1, WH, 1); const m = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const inst = new THREE.InstancedMesh(g, m, W * H); let k = 0; const o = new THREE.Object3D();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (solid(x, y) && [[0, 1], [1, 0], [0, -1], [-1, 0]].some(([dx, dy]) => open(x + dx, y + dy))) {
    o.position.set(x + 0.5, WH / 2, y + 0.5); o.updateMatrix(); inst.setMatrixAt(k++, o.matrix);
  }
  inst.count = k; inst.castShadow = true; scene.add(inst);
}
// below a chasm: darkness that the fog swallows
{
  const g = new THREE.PlaneGeometry(W + 20, H + 20); g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: fogC.clone().multiplyScalar(0.35) }));
  m.position.set(W / 2, -3.01, H / 2); scene.add(m);
}

/* ---------- water ---------- */
const wcells = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isWater(ch(x, y))) wcells.push([x, y]);
const wk = reg.water;
if (wcells.length) {
  const waterB = new Batch();
  for (const [x, y] of wcells) waterB.quad([x, 0, y + 1], [x + 1, 0, y + 1], [x + 1, 0, y], [x, 0, y], [x / 2, -(y + 1) / 2, (x + 1) / 2, -y / 2], UP);
  const tw = nearest(new THREE.Texture(waterImg)); tw.needsUpdate = true; tw.wrapS = tw.wrapT = THREE.RepeatWrapping;
  tw.offset.set(wk.scroll[0] * T * 60, wk.scroll[1] * T * 60);
  const lava = !!wk.emissive;
  const wm = new THREE.MeshStandardMaterial({ map: tw, color: lava ? 0xffffff : new THREE.Color(wk.surface).multiplyScalar(1.6),
    roughness: mat('water').roughness, metalness: mat('water').metalness, transparent: !lava, opacity: lava ? 1 : 1 - wk.reflectStrength * 0.6,
    emissive: lava ? new THREE.Color(wk.emissive) : new THREE.Color(wk.surface), emissiveMap: tw, emissiveIntensity: lava ? wk.emissiveIntensity : 1.0 });
  const wmesh = waterB.mesh(wm); wmesh.position.y = mat('water').height; wmesh.receiveShadow = !lava; scene.add(wmesh);
  if (!lava && wk.reflect) {
    let x0 = 99, x1 = -1, y0 = 99, y1 = -1; for (const [x, y] of wcells) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const rf = new Reflector(new THREE.PlaneGeometry(x1 - x0 + 1, y1 - y0 + 1), { textureWidth: vw * Math.min(devicePixelRatio, 2), textureHeight: vh * Math.min(devicePixelRatio, 2), color: new THREE.Color(wk.reflect) });
    rf.rotation.x = -Math.PI / 2; rf.position.set((x0 + x1 + 1) / 2, mat('water').height - 0.01, (y0 + y1 + 1) / 2); scene.add(rf);
    // floor between pools must hide the mirror: the pools are separate in some rooms, so mask with dark plates
    const blocker = new Batch();
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!isWater(ch(x, y)))
      blocker.quad([x, -0.005, y + 1], [x + 1, -0.005, y + 1], [x + 1, -0.005, y], [x, -0.005, y], [0, 0, 1, 1], UP);
    scene.add(blocker.mesh(new THREE.MeshBasicMaterial({ color: 0 })));
  }
  // ripples
  const rc = new THREE.Color(wk.ripple);
  for (let i = 0; i < Math.min(7, Math.ceil(wcells.length / 5)); i++) {
    const [x, y] = wcells[Math.floor(rnd() * wcells.length)]; const f = Math.floor(rnd() * 6);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: cellTexture(rippleImg, f * 16, 0, 16, 16),
      color: rc, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.set(x + 0.5, 0.01, y + 0.5); scene.add(m);
  }
  scene.add(Object.assign(waterTileB.mesh(new THREE.MeshStandardMaterial({ map: texTiles, transparent: true, roughness: 0.6, vertexColors: true,
    emissiveMap: texEm, emissive: 0xffffff })), { receiveShadow: true }));
}

/* ---------- standing props ---------- */
const pitchTilt = -THREE.MathUtils.degToRad(cam.pitch) * 0.55; // cards lean back towards the camera
const propCache = {};
for (const p of props) {
  if (p.kind === 'door') {
    const g = new THREE.PlaneGeometry(1, mat('door').height);
    const tex = cellTexture(tilesImg, 5 * 16, 0, 16, 16);
    const emt = cellTexture(emCanvas, 5 * 16, 0, 16, 16);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: mat('door').roughness, emissiveMap: emt, emissive: 0xffffff, emissiveIntensity: 1.6 }));
    m.position.set(p.x + 0.5, mat('door').height / 2, p.y + 0.5); m.receiveShadow = true; scene.add(m);
    const l = new THREE.Mesh(new THREE.BoxGeometry(1, WH - mat('door').height, 1), new THREE.MeshStandardMaterial({ map: cellTexture(wallsImg, 32, 16, 16, 8), roughness: 0.9 }));
    l.position.set(p.x + 0.5, (WH + mat('door').height) / 2, p.y + 0.5); l.castShadow = true; scene.add(l);
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: cellTexture(wallsImg, 5 * 16, 0, 16, 16), roughness: 0.95 }));
    cap.rotation.x = -Math.PI / 2; cap.position.set(p.x + 0.5, WH + 0.001, p.y + 0.5); scene.add(cap);
    continue;
  }
  const pt = propCache[p.tile] || (propCache[p.tile] = propTexture(p.tile));
  const glow = !!reg.emissive[p.tile];
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, p.h), new THREE.MeshStandardMaterial({ map: pt.map, alphaTest: 0.5, side: THREE.DoubleSide,
    roughness: 0.9, emissiveMap: pt.em, emissive: glow ? 0xffffff : 0x000000, emissiveIntensity: RN === 'caves' ? 0.45 : 1.0 }));
  m.geometry.translate(0, p.h / 2, 0); m.rotation.x = pitchTilt; m.position.set(p.x + 0.5, 0, p.y + 0.62);
  m.castShadow = true; m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: pt.map, alphaTest: 0.5 });
  scene.add(m);
}

/* ---------- characters ---------- */
// Sprite rules (kit.sprites): an upright quad, feet at the bottom middle, leaned back LEAN toward the camera and stretched
// 1 / cos(pitch - lean) so it keeps the proportions of its art; lit like the floor (the region tints it), never darker than
// its self light; a rim of the strongest light nearby on the silhouette's side that faces it; a soft blob under the feet.
const SP = kit.sprites;
const LEAN = THREE.MathUtils.degToRad(SP.lean);
const STRETCH = 1 / Math.cos(pitch - LEAN);
const sheetCache = {};
const figures = [];
function rimMaterial(tex, fw, fh) {
  const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: 1, emissiveMap: tex, emissive: 0xffffff,
    emissiveIntensity: RULES ? SP.selfLight : 0.12, side: THREE.DoubleSide });
  m.userData.u = { uRimDir: { value: new THREE.Vector2(0, 1) }, uRimColor: { value: new THREE.Color(0) }, uTexel: { value: new THREE.Vector2(1 / fw, 1 / fh) } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.u);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uRimDir; uniform vec3 uRimColor; uniform vec2 uTexel;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { // the rim: this texel is solid, the one toward the light is empty (or off the sprite)
          vec2 q = vMapUv + uRimDir * uTexel;
          float out_ = (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) ? 1.0 : step(texture2D(map, q).a, 0.5);
          totalEmissiveRadiance += uRimColor * out_;
        }`);
  };
  return m;
}
async function charSprite(name, fw, fh, frame, row, at, scale = 1, fly = false) {
  const img = sheetCache[name] || (sheetCache[name] = await loadImg(`assets/${name}.png`));
  const cols = Math.floor(img.width / fw);
  const tex = cellTexture(img, (frame % cols) * fw, row * fh + Math.floor(frame / cols) * fh, fw, fh);
  const w = fw / 16 * scale, h = fh / 16 * scale * (RULES ? STRETCH : 1);
  const g = new THREE.PlaneGeometry(w, h); g.translate(0, h / 2, 0);
  const mat_ = rimMaterial(tex, fw, fh);
  const m = new THREE.Mesh(g, mat_);
  const hover = fly ? SP.fly.hover : 0;
  m.rotation.x = RULES ? -LEAN : -pitch * 0.85; m.position.set(at[0] + 0.5, 0.02 + hover, at[1] + 0.5 + SP.feet);
  m.castShadow = !!SP.castShadow; m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 });
  scene.add(m);
  const sw = w * SP.shadow.width * (fly ? SP.fly.shadowScale : 1);
  const s = new THREE.Mesh(new THREE.CircleGeometry(sw / 2, 20), new THREE.MeshBasicMaterial({ map: blobTex, color: 0, transparent: true,
    opacity: SP.shadow.opacity * (fly ? SP.fly.shadowFade : 1), depthWrite: false }));
  s.rotation.x = -Math.PI / 2; s.scale.y = SP.shadow.squash; s.position.set(at[0] + 0.5, 0.012, at[1] + 0.5 + SP.feet + 0.02); scene.add(s);
  figures.push({ m, s, at: new THREE.Vector3(at[0] + 0.5, hover + h * 0.5, at[1] + 0.5 + SP.feet), mat: mat_ });
  return m;
}
const blobTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, '#fff'); gr.addColorStop(0.55, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const MOBDIM = { gnoll: [12, 15], skeleton: [12, 15], bat: [15, 15], monk: [15, 14], succubus: [12, 15],
  goo: [20, 14], tengu: [14, 16], dm300: [22, 20], king: [16, 16], yog: [20, 19] };
await charSprite('warrior', 12, 15, 0, 1, hero);
if (mob) await charSprite(MOBS[R], ...MOBDIM[MOBS[R]], 0, 0, mob, 1, MOBS[R] === 'bat');
if (boss) await charSprite(BOSSES[R], ...MOBDIM[BOSSES[R]], 0, 0, boss, BOSSES[R] === 'yog' ? 1.6 : 1.25);
for (const [k, x, y] of extra) { const [n, fw, fh, f] = CLOSE_MOBS[RN][k]; await charSprite(n, fw, fh, 0, 0, [x, y], 1, f === 'fly'); }
const rimLights = [];

/* ---------- light ---------- */
scene.add(new THREE.AmbientLight(env.ambient.color, env.ambient.intensity * kit.three.ambientScale));
scene.add(new THREE.HemisphereLight(reg.hemi.sky, reg.hemi.ground, reg.hemi.intensity * kit.three.hemiScale));
const hl = kit.hero_light;
const heroL = new THREE.PointLight(hl.color, hl.intensity, hl.distance, hl.decay); heroL.position.set(hero[0] + 0.5, RULES ? kit.sprites.heroLightY ?? 1.8 : 0.9, hero[1] + 0.6); scene.add(heroL);
const tk = reg.torch; const torchTex = cellTexture(itemsImg, 4 * 16, 10 * 16, 16, 16);
const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
let shadowsLeft = 3;
torches.forEach(([x, z], i) => {
  const fl = 1 + tk.flicker.amp * Math.sin(T * tk.flicker.hz * 6.283 + i * 2.1) * 0.8;
  const L = new THREE.PointLight(tk.color, tk.intensity * fl, tk.distance, tk.decay + kit.three.torchDecayAdd);
  L.position.set(x, 1.35, z + 0.95);
  if (tk.shadows && shadowsLeft-- > 0) { L.castShadow = true; L.shadow.mapSize.set(512, 512); L.shadow.bias = -0.004; L.shadow.camera.near = 0.1; }
  if (!Q.has('notorch')) scene.add(L);
  const s = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: torchTex, alphaTest: 0.5, color: 0xffffff }));
  s.position.set(x, 0.92, z + 0.03); s.rotation.z = -0.72; scene.add(s);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(tk.color).multiplyScalar(2.2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  halo.scale.set(0.9, 0.9, 1); halo.position.set(x, 1.2, z + 0.1); scene.add(halo);
});
// glowing tiles carry small lights of their own
for (const Ld of reg.lights || []) {
  const list = Ld.tile === 63 ? wcells.map(([x, y]) => ({ x, y })) : emitters.filter((e) => e.t === Ld.tile).concat(props.filter((p) => p.tile === Ld.tile)).concat(Ld.tile === 5 ? props.filter((p) => p.kind === 'door') : []);
  const step = Ld.tile === 63 ? 6 : (Ld.tile === 5 ? 1 : 3);
  list.filter((_, i) => i % step === 0).forEach((e) => {
    const L = new THREE.PointLight(Ld.color, Ld.intensity, Ld.distance * 1.3, 1.4);
    L.position.set(e.x + 0.5, Ld.tile === 5 ? 0.8 : 0.45, e.y + (Ld.tile === 5 ? 1.2 : 0.5)); scene.add(L);
  });
}
// prison windows: cold moonlight falling in
if (reg.emissive['12'] && RN === 'prison') {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ch(x, y) === '+' && open(x, y + 1)) {
    const L = new THREE.SpotLight(reg.emissive['12'], 9, 7, 0.5, 0.6, 1.2); L.position.set(x + 0.5, 1.3, y + 1.05); L.target.position.set(x + 0.5, 0, y + 3.2);
    scene.add(L, L.target);
  }
}
if (BOSS && boss) {
  const a = reg.boss.accent; const pulse = BOSSES[R] === 'yog' ? 1 + 0.4 * Math.sin(T * 3.14) : 1;
  const L = new THREE.PointLight(a.color, a.intensity * 2.2 * pulse, 7, 1.2); L.position.set(boss[0] + 0.5, 2.2, boss[1] + 1.2);
  if (RN === 'prison' || RN === 'city') { L.castShadow = true; L.shadow.mapSize.set(512, 512); L.shadow.bias = -0.004; }
  scene.add(L);
}

/* ---------- effects of part 6 (fx/fx.json): a scene of them in the room ---------- */
const FXS = Q.get('fx');
const tints = [];
if (FXS) {
  const FX = await (await fetch('fx/fx.json')).json();
  const imgCache = {};
  const sheetImg = async (src) => imgCache[src] || (imgCache[src] = await loadImg(src));
  const [hxp, hzp] = hero;
  /** one frame of an effect at a cell (x, z in cells, may be fractional): flat on the floor or standing, with its light */
  async function put(id, frame, x, z, o = {}) {
    const e = FX.fx[id]; const img = await sheetImg(e.sheet);
    const tex = cellTexture(img, frame * e.w, (o.row ?? e.row) * e.h, e.w, e.h);
    const sc = o.scale || 1; const w = e.w / 16 * sc, h = e.h / 16 * sc;
    const add = e.blend === 'add';
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), add
      ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: id.startsWith('gas.') ? new THREE.Color(0.9, 0.9, 0.9) : (e.w >= 48 ? new THREE.Color(1, 1, 1) : new THREE.Color(1.4, 1.4, 1.4)) })
      : new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: id.startsWith('gas.') ? 0.78 : 1, depthWrite: false, roughness: 1, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.25 }));
    const flat = (o.at || (e.anchor === 'floor' || e.anchor === 'feet-floor' ? 'floor' : 'stand')) === 'floor';
    if (flat) { m.rotation.x = -Math.PI / 2; m.position.set(x, (e.lift ?? 0.02) + (o.y || 0), z); }
    else {
      m.rotation.x = -LEAN; if (o.rot) m.rotation.z = o.rot;
      const up = e.anchor === 'feet' ? h / 2 + (e.rise || 0) : 0.55 + (o.y || 0);
      m.position.set(x, up * STRETCH ** (e.anchor === 'feet' ? 1 : 0), z + 0.1); if (e.anchor === 'feet') m.scale.y = STRETCH;
    }
    m.renderOrder = 5; scene.add(m);
    if (o.light !== false && e.light) {
      const L_ = e.light; const k = o.lk ?? 1;
      const pl = new THREE.PointLight(L_.color, L_.intensity * k, L_.radius, 1.4); pl.position.set(x, flat ? 0.5 : 0.8, z + 0.2); scene.add(pl);
    }
    if (o.tint && e.tint) tints.push(e.tint);
    return m;
  }
  const along = async (id, x0, z, x1, frame0 = 0, o = {}) => { for (let x = x0, i = 0; x < x1; x += 1, i++) await put(id, (frame0 + i) % FX.fx[id].frames, x + 0.5, z, { light: false, ...o }); };
  const S = {
    bolts: async () => {    // sewers close: a firebolt at the gnoll, a magic missile, lightning from the hero to the crab and its strike
      await put('bolt.fire', 1, hxp + 2.3, hzp - 0.6, { rot: 0.45, scale: 1 });
      await put('bolt.fire.hit', 2, hxp + 1.6 + 1.6, hzp - 1.2, { light: false });
      await put('bolt.magic', 2, hxp - 1.4, hzp - 1.6, { rot: 2.4 });
      for (let i = 0; i < 2; i++) await put('bolt.lightning', (i + 1) % 4, hxp - 0.2 - i * 1, hzp + 0.7 + i * 0.25, { rot: -2.9, light: i === 0 });
      await put('bolt.lightning.strike', 1, hxp - 2.5, hzp + 1.3);
    },
    rays: async () => {     // caves close: disintegration across the cave, poison and teleport bolts
      await put('bolt.beam.start', 1, hxp + 1, hzp + 0.1, { light: false }); await along('bolt.beam', hxp + 1.5, hzp + 0.1, hxp + 4, 0, {});
      await put('bolt.beam', 0, hxp + 3, hzp + 0.1, { light: true }); await put('bolt.beam.end', 2, hxp + 4.5, hzp + 0.1);
      await put('bolt.poison', 1, hxp - 1.6, hzp - 1.3, { rot: 2.6 }); await put('bolt.teleport', 2, hxp - 2.2, hzp + 1.1);
      await put('bolt.regrowth', 1, hxp + 0.4, hzp - 2, { rot: 1.4 });
    },
    waves: async () => {    // city: the challenge's roar round the hero, two rings, specks, the red tint
      await put('wave.challenge', 5, hxp + 0.5, hzp + 0.5, { scale: 3, tint: true }); await put('wave.challenge', 2, hxp + 0.5, hzp + 0.5, { scale: 2, light: false });
      for (let i = 0; i < 8; i++) await put('wave.challenge.specks', i % 4, hxp + 0.5 + Math.cos(i * 0.8) * 2.4, hzp + 0.5 + Math.sin(i * 0.8) * 2, { light: false });
    },
    terror: async () => { await put('wave.terror', 4, hxp + 0.5, hzp + 0.5, { scale: 3, tint: true }); for (let i = 0; i < 6; i++) await put('wave.terror.specks', i % 4, hxp + 0.5 + Math.cos(i) * 2.2, hzp + Math.sin(i) * 1.6, { light: false }); },
    lullaby: async () => { await put('wave.lullaby', 5, hxp + 0.5, hzp + 0.5, { scale: 3, tint: true }); await put('wave.lullaby', 2, hxp + 0.5, hzp + 0.5, { scale: 2, light: false }); for (let i = 0; i < 6; i++) await put('wave.lullaby.specks', i % 4, hxp + 0.5 + Math.cos(i * 1.1) * 2, hzp + Math.sin(i * 1.1) * 1.6, { light: false }); },
    psionic: async () => { await put('wave.psionic', 5, hxp + 0.5, hzp + 0.5, { scale: 3, tint: false }); for (let i = 0; i < 8; i++) await put('wave.psionic.specks', i % 4, hxp + 0.5 + Math.cos(i * 0.8) * 2.8, hzp + Math.sin(i * 0.8) * 2.2, { light: false }); },
    gas: async () => {      // sewers close: a cloud of toxic gas, a paralytic one, a crimson flask broken, flames
      const cloud = async (id, cx, cz, wdt, hgt) => { for (let z = 0; z < hgt; z++) for (let x = 0; x < wdt; x++) {
        const d = (x > 0 && x < wdt - 1 && z > 0 && z < hgt - 1) ? 2 : ((x > 0 && x < wdt - 1) || (z > 0 && z < hgt - 1) ? 1 : 0);
        await put(id, (x + z) % 4, cx + x + 0.5, cz + z + 0.5, { row: d, light: false }); } };
      await cloud('gas.toxic', hxp + 1, hzp - 2, 4, 3); await cloud('gas.paralytic', hxp - 4, hzp - 1, 3, 3);
      await put('potion.splash.crimson', 3, hxp - 1.5, hzp + 2, {}); await put('potion.splash.turquoise', 5, hxp + 2.5, hzp + 2.2, { light: false });
      for (let i = 0; i < 3; i++) await put('gas.fire', i, hxp + 2.5 + i, hzp + 1, { row: 2 - (i % 2), light: i === 1 });
    },
    traps: async () => {    // prison: four traps going off along the corridor
      await put('trap.fire', 2, hxp - 2.5, hzp + 0.5); await put('trap.lightning', 1, hxp + 2.5, hzp + 0.5, { tint: false });
      await put('trap.summoning', 4, hxp + 0.5, hzp + 2.5); await put('trap.alarm', 1, hxp - 2.5, hzp + 2.5);
      await put('trap.toxic', 3, hxp + 4.5, hzp + 2.5); await put('trap.poison', 2, hxp + 0.5, hzp - 1.5);
    },
    hero: async () => {     // city: a level gained, a critical blow on the monk, a miss, healing
      await put('hero.levelup', 3, hxp + 0.5, hzp + 0.55, { scale: 1 });
      await put('hit.crit', 1, hxp + 3.5, hzp - 0.5); await put('hit.miss', 2, hxp + 2.8, hzp - 0.2, { light: false });
      await put('hit', 1, hxp - 1.5, hzp + 1);
    },
    ankh: async () => { await put('hero.ankh', 4, hxp + 0.5, hzp + 0.55, { tint: true }); },
    amulet: async () => { await put('hero.amulet', 3, hxp + 0.5, hzp + 0.55, { tint: false }); },
  };
  await S[FXS]?.();
}

/* ---------- the rim of the strongest light on each figure ---------- */
if (RULES && SP.rim.on && !Q.has('norim')) {
  const lights = []; scene.traverse((o) => { if (o.isPointLight || o.isSpotLight) lights.push(o); });
  const up = new THREE.Vector3(0, Math.cos(LEAN), -Math.sin(LEAN));
  for (const f of figures) {
    let best = null, bw = 0;
    for (const L of lights) {
      const d = L.position.clone().sub(f.at); const len = d.length();
      if (len < 0.45 || len > (L.distance || 8)) continue;
      const w = L.intensity * Math.pow(1 - len / (L.distance || 8), 2) / Math.max(len, 0.6);
      if (w > bw) { bw = w; best = { L, d }; }
    }
    if (!best) continue;
    let u = best.d.x, v = best.d.dot(up); const n = Math.hypot(u, v) || 1; u /= n; v /= n;
    f.mat.userData.u.uRimDir.value.set(Math.abs(u) > 0.38 ? Math.sign(u) : 0, Math.abs(v) > 0.38 ? Math.sign(v) : 0);
    const k = Math.min(SP.rim.max, bw * SP.rim.strength);
    f.mat.userData.u.uRimColor.value.copy(best.L.color).multiplyScalar(k);
    // the blob slips a little away from that light
    const away = new THREE.Vector2(-best.d.x, -best.d.z).normalize().multiplyScalar(SP.shadow.offset);
    f.s.position.x += away.x; f.s.position.z += away.y;
  }
}

/* ---------- mist ---------- */
const mist = env.fog.mist;
if (mist && !Q.has('nomist')) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  for (let i = 0; i < 70; i++) { const x = rnd() * 256, y = rnd() * 256, r = 20 + rnd() * 50;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 3);
  for (let k = 0; k < 2; k++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex, color: mist.color, transparent: true, opacity: mist.density * (k ? 0.45 : 0.7), depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
    m.rotation.x = -Math.PI / 2; m.position.set(W / 2, mist.height * (k ? 1.6 : 0.6), H / 2); tex.offset.set(T * 0.01 * (k + 1), k * 0.37); scene.add(m);
  }
}

/* ---------- particles ---------- */
const PF = { drip: 0, mist: 1, dust: 2, ember: 3, ash: 4, spore: 5, steam: 6, spark: 7, bubble: 8, magic: 9, fly: 10, smoke: 11 };
const GLOW = new Set(['ember', 'spore', 'spark', 'magic']);
const floorCells = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (open(x, y) && !isDoor(ch(x, y))) floorCells.push([x, y]);
const near = (cx, cy, r) => floorCells.filter(([x, y]) => Math.abs(x - cx) + Math.abs(y - cy) <= r);
for (const p of env.particles) {
  const SOFT = p.type === 'mist';
  const frame = SOFT ? glowTex : cellTexture(partImg, PF[p.type] * 8, 0, 8, 8);
  const n = Math.round(p.rate * (BOSS ? 18 : 16));
  let pool = floorCells;
  if (p.type === 'spore') pool = props.filter((q) => q.tile === 15).map((q) => [q.x, q.y]);
  if (p.type === 'bubble') pool = wcells.length ? wcells : floorCells;
  if (p.type === 'steam' || p.type === 'magic' || p.type === 'spark') pool = boss ? near(boss[0], boss[1], 4) : floorCells;
  if (p.type === 'drip') pool = floorCells.filter(([x, y]) => solid(x, y - 1));
  if (!pool.length) pool = floorCells;
  for (let i = 0; i < n; i++) {
    const [cx, cy] = pool[Math.floor(rnd() * pool.length)];
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: frame, color: new THREE.Color(p.color).multiplyScalar(GLOW.has(p.type) ? 1.5 : 1),
      transparent: true, depthWrite: false, blending: GLOW.has(p.type) ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: GLOW.has(p.type) ? 1 : (SOFT ? 0.18 : 0.7) }));
    const sz = { mist: 1.6, steam: 0.5, smoke: 0.5, bubble: 0.3 }[p.type] || 0.3;
    s.scale.set(sz, sz, 1);
    const yy = { drip: 0.3 + rnd() * 1.1, bubble: 0.08, mist: 0.2 + rnd() * 0.3, steam: 0.3 + rnd() * 1.5, smoke: 0.3 + rnd() * 1.6 }[p.type] ?? 0.2 + rnd() * 2.0;
    s.position.set(cx + rnd(), yy, cy + (p.type === 'drip' ? 0.15 : rnd()));
    scene.add(s);
  }
}

/* ---------- render ---------- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bl = kit.bloom;
composer.setPixelRatio(Math.min(devicePixelRatio, 2));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(vw, vh), bl.strength, bl.radius, bl.threshold));
composer.addPass(new OutputPass());
composer.render();
composer.render();
for (const t of tints) { const d = document.createElement('div'); d.style.cssText = `position:fixed;inset:0;pointer-events:none;background:${t.color};opacity:${t.alpha * 0.6};mix-blend-mode:screen`; document.body.append(d); }
window.__ready = true;
