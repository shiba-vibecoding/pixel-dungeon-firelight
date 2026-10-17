/* Firelight · part 10: doors in 3D, as the game draws them (orthographic, pitch 70, no yaw), from assets/doors/doors.json and the region's
   door sheets through doorkit.js (packages/client/src/r3d/doorkit.ts, bundled). A small room round one door, or a whole room of them.
   ?r=0..4  &o=a (an east-west wall, its face to the camera) | b (the same in a cut wall, seen from its back) | c (a north-south wall)
   &s=closed|open|locked|vault|barricade|burning|charred|secret0|secret1|secret2|sink|found|exit|exitkey|exitopen  &open=0..1 (the swing)
   &light=torch|dark  &ctx=corner|torch|corridor|water|grass  &scene=room  &cells=N (the width that fits)  &old=1 (the door before part 10)
   &noshoulder=1  &key=0..3 (the key's frame)  window.__frame(ms) for the swings (&anim=open|close|secret|key|burn|exit). */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { doorQuads, grateQuads, crackQuads, uvOf } from './doorkit.js';

const Q = new URLSearchParams(location.search);
const R = +(Q.get('r') || 0), NAMES = ['sewers', 'prison', 'caves', 'city', 'halls'], RN = NAMES[R];
const O = Q.get('o') || 'a', S0 = Q.get('s') || 'closed', LIGHT = Q.get('light') || 'torch', CTX = Q.get('ctx') || '', OLD = Q.has('old');
const kit = await (await fetch('hd2d/hd2d-kit.json')).json();
const DK = await (await fetch('assets/doors/doors.json')).json();
const reg = kit.regions[RN];
const DARK = LIGHT === 'dark';

/* ---------- the maps: rows north to south. # wall  t wall with a torch  . floor  D the door  ~ water  G high grass  > the exit  H the hero (light) */
const MAPS = {
  a: ['#######', '##...##', '###.###', '##tD###', '#.....#', '#.....#', '#..H..#', '#######'],
  b: ['#######', '#.....#', '#.....#', '#t...##', '###D###', '###.###', '###H###', '#######'],
  c: ['#########', '#t..#...#', '#...#...#', '#...D...#', '#...#...#', '#.H.#...#', '#########'],
  corner: ['#######', '#...###', '#...###', '#.D####', '#...t.#', '#.....#', '#..H..#', '#######'],
  torch: ['#######', '###.###', '###.###', '##tDt##', '#.....#', '#.....#', '#..H..#', '#######'],
  corridor: ['###########', '#####.#####', '#####.#####', '#####D#####', '#.........#', '###########', '###########'],
  water: ['#######', '###~###', '###~###', '##tD###', '#~~~~~#', '#~~~..#', '#..H..#', '#######'],
  grass: ['#######', '###G###', '###G###', '##tD###', '#GGGG.#', '#GG...#', '#..H..#', '#######'],
  exit: ['#######', '#t....#', '#.....#', '#..>..#', '#.....#', '#..H..#', '#######'],
  // whole rooms: D shut, L locked, O open, V a vault's, B a barricade (a phone's is tall, a monitor's wide)
  room: ['################', '####.#####.#####', '###tD####tL###t#', '##......#......#', '##......O..H...#', '##......#......#', '###.....#......#',
    '###L######B#####', '###.....#......#', '##..H...V......#', '##......#......#', '###D######D#####', '###.######.#####', '################'],
  roomp: ['#########', '#####.###', '##t##D###', '#.......#', '#..H....#', '####L####', '#.......#', '#..#....#', '#..O..H.#', '#..#....#',
    '#.......#', '###D##B##', '###.##.##', '#########'],
};
const ROOM = Q.get('scene') === 'room';
const rows = MAPS[ROOM ? (innerWidth / innerHeight < 0.8 ? 'roomp' : 'room') : CTX || (S0.startsWith('exit') ? 'exit' : O)];
const W = Math.max(...rows.map((r) => r.length)), H = rows.length;
const ch = (x, y) => (y < 0 || y >= H || x < 0 || x >= W) ? '#' : (rows[y][x] || '#');
const isWall = (c) => c === '#' || c === 't';
const isDoorC = (c) => 'DLOVB'.includes(c);
const LETTER = { D: 'closed', L: 'locked', O: 'open', V: 'vault', B: 'barricade' };
const open = (x, y) => !isWall(ch(x, y));
let hero = null, door = null;
const heroes = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (ch(x, y) === 'H') { hero = hero || [x, y]; heroes.push([x, y]); } if (isDoorC(ch(x, y)) || ch(x, y) === '>') door = door || [x, y]; }
const SECRET = /^secret/.test(S0) || S0 === 'sink';

/* ---------- textures ---------- */
const loadImg = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
const nearest = (t, srgb = true) => { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; };
const [tilesImg, wallsImg, itemsImg, doorImg, doorGlowImg, fxImg, waterImg] = await Promise.all([`assets/tiles${R}.png`, `hd2d/walls${R}.png`, 'assets/items.png',
  `assets/doors/doors-${RN}.png`, `assets/doors/doors-${RN}-glow.png`, 'assets/doors/doors-fx.png', `assets/water${R}.png`].map(loadImg));
const texTiles = nearest(new THREE.Texture(tilesImg)), texWalls = nearest(new THREE.Texture(wallsImg));
const texDoor = nearest(new THREE.Texture(doorImg)), texDoorGlow = nearest(new THREE.Texture(doorGlowImg)), texFx = nearest(new THREE.Texture(fxImg));
const cellTexture = (img, x, y, w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h); return nearest(new THREE.CanvasTexture(c)); };

/* ---------- renderer, camera: orthographic, pitch 70, as the game ---------- */
const vw = innerWidth, vh = innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(vw, vh);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.NeutralToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const fogC = new THREE.Color(reg.fog.color); scene.background = fogC.clone().multiplyScalar(DARK ? 0.5 : 1);
const pitch = THREE.MathUtils.degToRad(70);
const cells = +(Q.get('cells') || 5);
const camera = new THREE.OrthographicCamera(-cells / 2, cells / 2, cells / 2 * vh / vw, -cells / 2 * vh / vw, 0.1, 100);
const focus = ROOM ? [W / 2, H / 2 - 0.2] : [door[0] + 0.5, door[1] + 0.5 + (O === 'b' ? 0.2 : 0.35)];
const target = new THREE.Vector3(focus[0] + +(Q.get('dx') || 0), 0.5, focus[1] + +(Q.get('dz') || 0));
camera.position.copy(target).add(new THREE.Vector3(0, Math.sin(pitch) * 30, Math.cos(pitch) * 30)); camera.lookAt(target);

/* ---------- geometry ---------- */
class Batch {
  constructor() { this.p = []; this.uv = []; this.n = []; this.c = []; this.i = []; }
  quad(a, b, c, d, uv, normal, shade = 1) {
    const o = this.p.length / 3;
    for (const v of [a, b, c, d]) { this.p.push(...v); this.n.push(...normal); this.c.push(shade, shade, shade); }
    const [u0, v0, u1, v1] = uv; this.uv.push(u0, v0, u1, v0, u1, v1, u0, v1); this.i.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  mesh(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setIndex(this.i);
    return new THREE.Mesh(g, material);
  }
}
const E = 0.5 / 256;
const tileUV = (i, rowsN = 8) => { const cx = i % 16, cy = Math.floor(i / 16); return [cx / 16 + E, 1 - (cy + 1) / rowsN + E, (cx + 1) / 16 - E, 1 - cy / rowsN - E]; };
const kitUV = (col, row, v0 = 0, v1 = 1) => { const [a, b, c, d] = tileUV(col + row * 16, 2); return [a, b + (d - b) * v0, c, b + (d - b) * v1]; };
const UP = [0, 1, 0];
const WH = DK.heights.wall, CUT = DK.heights.cut;

/** A door here and which way it stands (doorAcross in levelgeom.ts): across when it has floor north or south, or none east and west. */
const across = (x, y) => open(x, y - 1) || open(x, y + 1) || !(open(x - 1, y) || open(x + 1, y));
const doorAt = (x, y) => isDoorC(ch(x, y));
/** The wall's height: cut (floor north, wall south: levelgeom isCut), a shoulder south of a north-south door, or whole. */
function wallH(x, y) {
  if (!isWall(ch(x, y))) return 0;
  if (!Q.has('noshoulder') && !OLD && doorAt(x, y - 1) && !across(x, y - 1)) return DK.heights.shoulder;
  const solid = (cx, cy) => isWall(ch(cx, cy));
  if (y > 0 && !solid(x, y - 1) && (y + 1 >= H || solid(x, y + 1))) return CUT;
  return WH;
}
const floorB = new Batch(), capB = new Batch(), faceB = new Batch(), aoB = new Batch(), waterB = new Batch();
const torches = [];
const wallBoxes = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const c = ch(x, y);
  if (isWall(c)) {
    const hh = wallH(x, y);
    // a secret door is this wall until found: it is drawn apart, to crack and sink
    if (SECRET && door && x === door[0] && y === door[1]) continue;
    const nO = open(x, y - 1), eO = open(x + 1, y), sO = open(x, y + 1), wO = open(x - 1, y);
    const mask = (nO ? 1 : 0) | (eO ? 2 : 0) | (sO ? 4 : 0) | (wO ? 8 : 0);
    let near = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (open(x + dx, y + dy)) near = 1;
    capB.quad([x, hh, y + 1], [x + 1, hh, y + 1], [x + 1, hh, y], [x, hh, y], kitUV(mask, 0), UP, mask ? 1 : (near ? 0.55 : 0.18));
    for (const [ok, a, b, n] of [[sO, [x, 0, y + 1], [x + 1, 0, y + 1], [0, 0, 1]], [nO, [x + 1, 0, y], [x, 0, y], [0, 0, -1]],
      [eO, [x + 1, 0, y + 1], [x + 1, 0, y], [1, 0, 0]], [wO, [x, 0, y], [x, 0, y + 1], [-1, 0, 0]]]) {
      if (!ok) continue;
      const side = n[2] === 1 ? 1 : (n[2] === -1 ? 0.7 : 0.85);
      const lo = Math.min(1, hh);
      faceB.quad(a, b, [b[0], lo, b[2]], [a[0], lo, a[2]], kitUV(0, 1, 0, lo), n, side);
      if (hh > 1) faceB.quad([a[0], 1, a[2]], [b[0], 1, b[2]], [b[0], hh, b[2]], [a[0], hh, a[2]], kitUV(2, 1, 0.5, 0.5 + (hh - 1)), n, side);
    }
    if (c === 't' && sO) torches.push([x + 0.5, y + 1]);
    wallBoxes.push([x, y, hh]);
    continue;
  }
  const t = c === '>' ? 8 : c === 'G' ? 2 : 1;
  if (c === '~') waterB.quad([x, -0.04, y + 1], [x + 1, -0.04, y + 1], [x + 1, -0.04, y], [x, -0.04, y], [0, 0, 1, 1], UP);
  else floorB.quad([x, 0, y + 1], [x + 1, 0, y + 1], [x + 1, 0, y], [x, 0, y], tileUV(t), UP);
  for (const [dx, dy, col] of [[0, -1, 8], [1, 0, 9], [0, 1, 10], [-1, 0, 11]]) if (isWall(ch(x + dx, y + dy)) && c !== '~')
    aoB.quad([x, 0.004, y + 1], [x + 1, 0.004, y + 1], [x + 1, 0.004, y], [x, 0.004, y], kitUV(col, 1), UP);
}
scene.add(Object.assign(floorB.mesh(new THREE.MeshStandardMaterial({ map: texTiles, roughness: 0.9, vertexColors: true })), { receiveShadow: true }));
const caps = capB.mesh(new THREE.MeshStandardMaterial({ map: texWalls, roughness: 0.9, vertexColors: true, alphaTest: 0.5 })); caps.receiveShadow = true; caps.castShadow = true; scene.add(caps);
const faces = faceB.mesh(new THREE.MeshStandardMaterial({ map: texWalls, roughness: 0.85, vertexColors: true })); faces.receiveShadow = true; faces.castShadow = true; scene.add(faces);
scene.add(aoB.mesh(new THREE.MeshBasicMaterial({ map: texWalls, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 })));
if (waterB.p.length) {
  const tw = nearest(new THREE.Texture(waterImg)); tw.wrapS = tw.wrapT = THREE.RepeatWrapping;
  scene.add(waterB.mesh(new THREE.MeshStandardMaterial({ map: tw, color: new THREE.Color(reg.water.surface).multiplyScalar(1.6), roughness: 0.3, emissive: new THREE.Color(reg.water.surface), emissiveMap: tw, emissiveIntensity: 0.6 })));
}
// high grass: cards standing on its cells, as the viewer draws them
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ch(x, y) === 'G') {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.9), new THREE.MeshStandardMaterial({ map: cellTexture(tilesImg, 15 * 16, 0, 16, 16), alphaTest: 0.5, side: THREE.DoubleSide }));
  m.geometry.translate(0, 0.45, 0); m.rotation.x = -0.38; m.position.set(x + 0.5, 0, y + 0.6); scene.add(m);
}
// the walls cast their shadows: a hidden solid block per wall
for (const [x, y, hh] of wallBoxes) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, hh, 1), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  m.position.set(x + 0.5, hh / 2, y + 0.5); m.castShadow = true; scene.add(m);
}

/* ---------- the doors ---------- */
const solidMat = new THREE.MeshStandardMaterial({ map: texDoor, emissiveMap: texDoorGlow, emissive: 0xffffff, emissiveIntensity: 1.5, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, vertexColors: true });
const crackMat = new THREE.MeshStandardMaterial({ map: texDoor, emissiveMap: texDoorGlow, emissive: 0xffffff, emissiveIntensity: 0.55, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 });
const addMat = new THREE.MeshBasicMaterial({ map: texDoorGlow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: 0xffffff });
const [SW, SH] = DK.sheets.size;
/** Shade of a face as the walls are shaded: the faces the camera sees square lighter, the sides and the backs darker. */
const shadeOf = (n) => (n[1] > 0.5 ? 1 : n[2] > 0.5 ? 1 : n[2] < -0.5 ? 0.7 : 0.85);
const doorMeshes = [];
function addQuads(qs, ox, oz, opts = {}) {
  const sb = new Batch(), ab = new Batch();
  for (const q of qs) {
    const p = q.p; const pts = [0, 3, 6, 9].map((k) => [p[k] + ox, p[k + 1], p[k + 2] + oz]);
    const part = q.part === 'crack' && q.n[1] < 0.5 && opts.wallH ? { v0: 0, v1: opts.wallH / 1.5 } : undefined;
    const uv = uvOf(DK, q, SW, SH, part);
    (q.blend === 'add' ? ab : sb).quad(pts[0], pts[1], pts[2], pts[3], uv, q.n, shadeOf(q.n));
  }
  const ms = [];
  if (sb.p.length) { const m = sb.mesh(opts.mat || solidMat); m.castShadow = true; m.receiveShadow = true; m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: texDoor, alphaTest: 0.5 }); scene.add(m); ms.push(m); }
  if (sb.p.length === 0 && ab.p.length === 0) return ms;
  if (ab.p.length) { const m = ab.mesh(addMat); m.renderOrder = 5; scene.add(m); ms.push(m); }
  doorMeshes.push(...ms); return ms;
}
const fxSprites = [];
function fx(name, frame, x, y, z, size = 0.5, add = true) {
  const f = DK.fx[name]; const tex = cellTexture(fxImg, frame * f.w, f.row, f.w, f.h);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }));
  s.scale.set(size * f.w / 8, size * f.h / 8, 1); s.position.set(x, y, z); scene.add(s); fxSprites.push(s); return s;
}
/** Whether a door's cell is cut (its neighbours in the wall line are cut walls: levelgeom doorScale). */
const doorCut = (x, y) => across(x, y) && [x - 1, x + 1].some((cx) => isWall(ch(cx, y)) && wallH(cx, y) === CUT);
/** Which way it swings (doorswing poseOf): across, into the room on the camera's side if it can; north-south, to the open side. */
const pose = (x, y) => {
  const a = across(x, y);
  return a ? { hingeEast: ((x + y) & 1) === 1, swingSouth: open(x, y + 1) || !open(x, y - 1) } : { hingeEast: false, swingSouth: open(x + 1, y) };
};
const STATE_LOOK = { closed: 'closed', open: 'closed', locked: 'locked', vault: 'vault', barricade: 'barricade', burning: 'barricade', charred: 'charred', found: 'closed', sink: 'closed' };
function buildDoor(x, y, state, openK) {
  const a = across(x, y), cut = doorCut(x, y), ps = pose(x, y);
  const look = STATE_LOOK[state] || 'closed';
  // light through the gaps: cold at a locked door; warm at a shut one when the room beyond is lit (&beyond=dark: none)
  const light = state === 'locked' || state === 'vault' ? 'cold' : state === 'closed' && Q.get('beyond') !== 'dark' ? 'warm' : null;
  const qs = doorQuads(DK, { across: a, cut, look, open: openK, hingeEast: ps.hingeEast, swingSouth: ps.swingSouth, light });
  return addQuads(qs, x, y);
}
/** The door as the game drew it before part 10: a plank leaf 0.18 thick in the gap, the walls beside as its jambs. */
function oldDoor(x, y, state, openK) {
  const a = across(x, y); const cut = doorCut(x, y); const h = cut ? CUT : WH;
  const g = new THREE.BoxGeometry(1, h, 0.18); const tile = state === 'locked' ? 10 : 5;
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: cellTexture(tilesImg, tile * 16 + 3, 3, 10, 12), roughness: 0.9 }));
  const piv = new THREE.Group(); piv.position.set(x + (a ? 0.09 : 0.5), 0, y + (a ? 0.5 : 0.09)); m.position.set(a ? 0.41 : 0, h / 2, a ? 0 : 0.41);
  if (!a) m.rotation.y = Math.PI / 2;
  piv.rotation.y = -openK * Math.PI / 2; piv.add(m); scene.add(piv); m.castShadow = true;
}
const states = ROOM ? null : S0;
const animName = Q.get('anim');
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (!doorAt(x, y)) continue;
  if (states === null) {
    // the room: a door of each kind
    const k = LETTER[ch(x, y)];
    if (OLD) oldDoor(x, y, k, k === 'open' ? 1 : 0); else buildDoor(x, y, k, k === 'open' ? 1 : 0);
    continue;
  }
  if (animName) continue;
  if (OLD) { oldDoor(x, y, S0, S0 === 'open' ? +(Q.get('open') ?? 1) : 0); continue; }
  if (SECRET && S0 !== 'sink') continue;
  const k = S0 === 'open' ? +(Q.get('open') ?? 1) : 0;
  buildDoor(x, y, S0, k);
  if (S0 === 'burning') for (const [dx, f] of [[0.3, 0], [0.55, 1], [0.75, 2]]) { const A = across(x, y); fx('flame', f, x + (A ? dx : 0.5), 0.55 + f * 0.15, y + (A ? 0.62 : dx), 0.55); }
  if (S0 === 'found') for (const [dx, dz, f] of [[0.2, 1.05, 1], [0.8, 1.1, 2], [0.5, 1.2, 0]]) fx('dust', f, x + dx, 0.15, y + dz, 0.6, false);
}
// a secret door being found: the wall, its cracks, sparks; or sinking
const secretWall = [];
function secretAt(stage, sink) {
  const [x, y] = door; const a = across(x, y); const hh = WH * (1 - sink);
  const sb = new Batch();
  const nO = open(x, y - 1), eO = open(x + 1, y), sO = open(x, y + 1), wO = open(x - 1, y);
  const mask = (nO ? 1 : 0) | (eO ? 2 : 0) | (sO ? 4 : 0) | (wO ? 8 : 0);
  sb.quad([x, hh, y + 1], [x + 1, hh, y + 1], [x + 1, hh, y], [x, hh, y], kitUV(mask, 0), UP, 1);
  for (const [ok, aa, b, n] of [[sO, [x, 0, y + 1], [x + 1, 0, y + 1], [0, 0, 1]], [eO, [x + 1, 0, y + 1], [x + 1, 0, y], [1, 0, 0]], [wO, [x, 0, y], [x, 0, y + 1], [-1, 0, 0]]]) {
    if (!ok) continue; const lo = Math.min(1, hh);
    sb.quad(aa, b, [b[0], lo, b[2]], [aa[0], lo, aa[2]], kitUV(0, 1, 0, lo), n, n[2] ? 1 : 0.85);
    if (hh > 1) sb.quad([aa[0], 1, aa[2]], [b[0], 1, b[2]], [b[0], hh, b[2]], [aa[0], hh, aa[2]], kitUV(2, 1, 0.5, 0.5 + (hh - 1)), n, n[2] ? 1 : 0.85);
  }
  const m = sb.mesh(new THREE.MeshStandardMaterial({ map: texWalls, roughness: 0.85, vertexColors: true })); scene.add(m); secretWall.push(m);
  if (stage >= 0 && sink === 0) secretWall.push(...addQuads(crackQuads(DK, stage, a, hh), x, y, { wallH: hh, mat: crackMat }));
  if (stage === 2) for (const [dx, dz, f] of [[0.15, 1.02, 0], [0.85, 1.02, 1], [0.5, 1.05, 2], [0.3, 0.5, 1]]) secretWall.push(fx('sparks', f, x + (a ? dx : 1.02), 0.4 + dz * 0.6, y + (a ? dz : dx), 0.5));
}
if (SECRET && !animName) {
  if (S0 === 'sink') secretAt(-1, 0.55); else secretAt(+S0.slice(6), 0);
}
// the boss floor's exit
if (S0.startsWith('exit') && !animName) {
  const [x, y] = door; addQuads(grateQuads(DK, S0 === 'exitopen' ? 1 : 0), x, y);
  if (S0 === 'exitkey') fx('key', +(Q.get('key') ?? 1), x + 0.5, 0.25, y + 0.55, 0.7, false);
}
// the key in a padlock (a short insert): &key=0..3 over a locked door
if (S0 === 'locked' && Q.has('key')) {
  const [x, y] = door; const A = across(x, y); fx('key', +Q.get('key'), x + (A ? 0.69 : 1.0), 0.62, y + (A ? 0.8 : 0.69), 0.5, false);
}

/* ---------- light ---------- */
const amb = DARK ? 0.35 : 1;
scene.add(new THREE.AmbientLight(reg.ambient.color, reg.ambient.intensity * kit.three.ambientScale * amb));
scene.add(new THREE.HemisphereLight(reg.hemi.sky, reg.hemi.ground, reg.hemi.intensity * kit.three.hemiScale * amb));
for (const hero of heroes) { const hl = kit.hero_light; const L = new THREE.PointLight(hl.color, hl.intensity * (DARK ? 1.1 : 0.8), hl.distance, hl.decay); L.position.set(hero[0] + 0.5, 0.9, hero[1] + 0.6); scene.add(L); }
const tk = reg.torch; const torchTex = cellTexture(itemsImg, 4 * 16, 10 * 16, 16, 16);
if (!DARK) torches.forEach(([x, z], i) => {
  const L = new THREE.PointLight(tk.color, tk.intensity, tk.distance, tk.decay + kit.three.torchDecayAdd);
  L.position.set(x, 1.35, z + 0.95); if (i < 2) { L.castShadow = true; L.shadow.mapSize.set(512, 512); L.shadow.bias = -0.004; L.shadow.camera.near = 0.1; }
  scene.add(L);
  const s = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: torchTex, alphaTest: 0.5 })); s.position.set(x, 0.92, z + 0.03); s.rotation.z = -0.72; scene.add(s);
});
// a lit room beyond a shut door (its warm light through the gaps): a small light past it, as the game's light of a lit room would be
if (!DARK && !OLD && door && (S0 === 'closed' || S0 === 'open')) {
  const [x, y] = door; const a = across(x, y); const L = new THREE.PointLight(tk.color, tk.intensity * 0.35, 3.5, 1.6);
  L.position.set(x + (a ? 0.5 : -1.2), 0.9, y + (a ? -1.2 : 0.5)); scene.add(L);
}

/* ---------- animations (window.__frame(ms)) ---------- */
window.__frame = null;
if (animName && door) {
  const [x, y] = door; const cache = {};
  const showOnly = (key, mk) => { for (const k in cache) for (const m of cache[k]) m.visible = false; if (!cache[key]) { const before = doorMeshes.length + fxSprites.length + secretWall.length; mk(); cache[key] = [...doorMeshes.splice(0), ...fxSprites.splice(0), ...secretWall.splice(0)]; } for (const m of cache[key]) m.visible = true; };
  const LOOP = { open: 1600, close: 1600, secret: 2000, key: 1500, burn: 1500, exit: 1800 }[animName];
  window.__frame = async (ms) => {
    const t = ms % LOOP;
    if (animName === 'open' || animName === 'close') {
      // shut 500 ms, swing (240 ms opening with a little overshoot, as doorswing.ts), open 600, swing back (200 ms), shut
      const st = S0 === 'locked' ? 'locked' : 'closed';
      let k = 0;
      if (t < 500) k = 0; else if (t < 740) { const u = (t - 500) / 240 - 1; k = 1 + 2.05 * u * u * u + 1.05 * u * u; } else if (t < 1340) k = 1; else if (t < 1540) { const u = (t - 1340) / 200; k = 1 - u * u; } else k = 0;
      k = Math.round(k * 12) / 12;
      showOnly(`d${k}`, () => buildDoor(x, y, st, Math.max(0, k)));
    } else if (animName === 'secret') {
      const stage = t < 350 ? -1 : t < 600 ? 0 : t < 850 ? 1 : t < 1100 ? 2 : -2;
      const sink = t < 1100 ? 0 : Math.min(1, (t - 1100) / 220);
      const key = `s${stage}-${Math.round(sink * 5)}`;
      showOnly(key, () => { if (sink < 1) secretAt(stage, sink); if (sink > 0) { buildDoor(x, y, 'closed', 0); if (sink === 1) for (const [dx, dz, f] of [[0.2, 1.05, 1], [0.8, 1.1, 2], [0.5, 1.2, 0]]) fx('dust', Math.min(3, f + Math.floor((t - 1320) / 150)), x + dx, 0.15, y + dz, 0.6, false); } });
    } else if (animName === 'key') {
      // the key to the padlock, in, turned, a spark; the padlock and chain gone: the door is plain, it opens
      const f = Math.floor(t / 180);
      if (f < 4) showOnly(`k${f}`, () => { buildDoor(x, y, 'locked', 0); const A = across(x, y); fx('key', f, x + (A ? 0.69 : 1.0), 0.62, y + (A ? 0.8 : 0.69), 0.5, false); });
      else if (t < 1000) showOnly('plain', () => buildDoor(x, y, 'closed', 0));
      else { const u = Math.min(1, (t - 1000) / 240); const k = Math.round(u * 6) / 6; showOnly(`o${k}`, () => buildDoor(x, y, 'closed', k)); }
    } else if (animName === 'burn') {
      const f = Math.floor(t / 120) % 3; const phase = t < 1000 ? 'burning' : 'charred';
      showOnly(`${phase}${phase === 'burning' ? f : ''}`, () => { buildDoor(x, y, phase, 0); if (phase === 'burning') for (const [dx, g] of [[0.3, 0], [0.55, 1], [0.75, 2]]) { const A = across(x, y); fx('flame', (g + f) % 3, x + (A ? dx : 0.5), 0.55 + g * 0.15, y + (A ? 0.62 : dx), 0.55); } });
    } else if (animName === 'exit') {
      const f = Math.floor(t / 180);
      if (f < 4) showOnly(`e${f}`, () => { addQuads(grateQuads(DK, 0), x, y); fx('key', f, x + 0.5, 0.25, y + 0.55, 0.7, false); });
      else { const u = Math.min(1, (t - 720) / 400); const k = Math.round(u * 6) / 6; showOnly(`g${k}`, () => addQuads(grateQuads(DK, k), x, y)); }
    }
    composer.render();
  };
}

/* ---------- render ---------- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.setPixelRatio(Math.min(devicePixelRatio, 2));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(vw, vh), kit.bloom.strength * 0.8, kit.bloom.radius, kit.bloom.threshold));
composer.addPass(new OutputPass());
if (window.__frame) await window.__frame(+(Q.get('ms') || 0));
composer.render(); composer.render();
window.__ready = true;
