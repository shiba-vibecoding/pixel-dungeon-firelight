/* Firelight · the hero card (design part 7). The player "as dressed": the hero in the look worn (part 5 included), the hat, the pet,
   the style of the campfire behind, in the portrait frame, put together in code from the part 5 sheets by compete/anchors.json.
   A reference for the client (hero-card.ts in migration-p7.md): no DOM framework, a canvas per card, nearest, whole scales.

   worn = { cls: 'warrior'|'mage'|'rogue'|'ranger', skin?, hat?, pet?, fire?: 'classic'.., frame?: sku of a frame | 'league.<tier>' | 'season.<id>',
            nc?: name colour key, tt?: title sku, tier?: armour row 0..6 }
   A card is drawn once; the animated ones (top 1-3 and my row) go on one shared clock (tick). */

const A = '/assets/';
const imgs = {};
export const load = (src) => imgs[src] || (imgs[src] = new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src.startsWith('/') ? src : A + src; }));
export const loaded = () => Promise.all(Object.values(imgs));

let K = null;    // the kit: anchors, the part 5 catalogue, compete.json
export async function kit() {
  if (K) return K;
  const [anchors, cat, compete] = await Promise.all(['compete/anchors.json', 'mart/fl/catalog.json', 'compete/compete.json'].map((p) => fetch(A + p).then((r) => r.json())));
  const by = Object.fromEntries(cat.items.map((i) => [i.sku, i]));
  for (const t of compete.titles) by[t.sku] = t;
  by['fire.beacon'] = compete.fire.beacon;
  K = { anchors, cat, compete, by };
  return K;
}

/** The style of a fire by key: part 5's eight and the Beacon. */
function fireOf(key) { return K.anchors.fire.styles[key] || K.anchors.fire.styles.classic; }

/** The scene of a layout at time t (ms) in a context, at scale s (whole). */
export async function drawScene(g, L, worn, t = 0, s = 1) {
  const W = L.scene[0], H = L.scene[1]; const an = K.anchors; const st = fireOf(worn.fire || 'classic');
  g.imageSmoothingEnabled = false;
  const P = (v) => Math.round(v) * s;
  // the night and the ground, or the camp's own picture behind (share cards)
  if (L.bg) {
    const bg = await load(L.bg.sheet); const [cx, cy, cw, ch] = L.bg.crop; if (bg) g.drawImage(bg, cx, cy, cw, ch, 0, 0, cw * s, ch * s);
    g.fillStyle = `rgba(8,10,24,${L.bg.night})`; g.fillRect(0, 0, W * s, H * s);
  } else {
    const sky = g.createLinearGradient(0, 0, 0, H * s); sky.addColorStop(0, '#0f100d'); sky.addColorStop(1, '#1d1e19');
    g.fillStyle = sky; g.fillRect(0, 0, W * s, H * s);
    const gy = L.hero[1] - 2; g.fillStyle = '#16130e'; g.fillRect(0, gy * s, W * s, (H - gy) * s); g.fillStyle = '#2a241a'; g.fillRect(0, gy * s, W * s, s);
  }
  // the fire's light over everything behind the figures
  const [fx, fy] = L.fire; const r = (L.light || an.fire.light.radius);
  const grd = g.createRadialGradient(fx * s, (fy - 4) * s, 0, fx * s, (fy - 4) * s, r * s);
  grd.addColorStop(0, st.light + 'aa'); grd.addColorStop(0.5, st.light + '33'); grd.addColorStop(1, st.light + '00');
  g.globalCompositeOperation = 'lighter'; g.fillStyle = grd; g.fillRect(0, 0, W * s, H * s); g.globalCompositeOperation = 'source-over';
  // logs, flame, sparks
  const logs = await load(st.logs); if (logs) g.drawImage(logs, 0, 0, 16, 6, P(fx + an.fire.logsAt[0]), P(fy + an.fire.logsAt[1]), 16 * s, 6 * s);
  const fl = await load(st.flame.sheet); const ff = Math.floor(t / st.flame.ms) % st.flame.frames;
  if (fl) g.drawImage(fl, ff * 13, 0, 13, 17, P(fx + an.fire.flameAt[0]), P(fy + an.fire.flameAt[1]), 13 * s, 17 * s);
  const sp = await load(st.sparks.sheet);
  if (sp) for (const [dx, dy, k] of an.fire.sparksAt) {
    const age = (t / 120 + k * 1.7) % 6; const rise = Math.floor(age);
    if (dy - rise < -fy + 1) continue;
    g.drawImage(sp, ((k + rise) % 4) * 3, 0, 3, 3, P(fx + dx + (worn.fire === 'beacon' ? 0 : (rise % 2))), P(fy + dy - rise), 3 * s, 3 * s);
  }
  // the hero
  const [hx, hy] = L.hero; const cls = worn.cls || 'warrior'; const skin = worn.skin ? K.by[`skin.${cls}.${worn.skin}`] : null;
  const seq = an.hero.idle.seq; const f = seq[Math.floor(t / (1000 / an.hero.idle.fps)) % seq.length]; const tier = worn.tier ?? an.hero.tierDefault;
  g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(P(hx - 4), P(hy), 8 * s, s);
  if (skin && skin.legendary) {
    const au = await load(skin.aura.sheet); const k = Math.floor(t / skin.aura.ms) % skin.aura.frames;
    if (au) g.drawImage(au, k * 24, 0, 24, 28, P(hx - skin.aura.feet[0]), P(hy - skin.aura.feet[1]), 24 * s, 28 * s);
  }
  const sheet = await load(skin ? skin.sheet : an.hero.classes[cls].sheet);
  if (sheet) g.drawImage(sheet, f * 12, tier * 15, 12, 15, P(hx - 6), P(hy - 15), 12 * s, 15 * s);
  if (worn.hat) {
    const h = K.by[`hat.${worn.hat}`]; const hs = h && await load(h.sheets[cls]);
    if (hs) g.drawImage(hs, f * 16, tier * 22, 16, 22, P(hx - 6 - an.hat.heroAt[0]), P(hy - 15 - an.hat.heroAt[1]), 16 * s, 22 * s);
  }
  if (skin && skin.legendary && skin.glow) {
    const gl = await load(skin.glow); const p = skin.glowPulse; const a = p.min + (p.max - p.min) * (0.5 + 0.5 * Math.sin(t / 1000 * p.hz * 2 * Math.PI));
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = a * 0.7; if (gl) g.drawImage(gl, f * 12, tier * 15, 12, 15, P(hx - 6), P(hy - 15), 12 * s, 15 * s); g.restore();
  }
  // the pet, facing the hero
  if (worn.pet && L.pet) {
    const pd = an.pet.pets[worn.pet]; const im = pd && await load(pd.sheet);
    if (im) {
      const [px, py] = L.pet; const k = pd.idle[Math.floor(t / pd.ms) % pd.idle.length]; const lift = pd.fly ? an.pet.flyLift + (Math.floor(t / 400) % 2) : 0;
      g.fillStyle = `rgba(0,0,0,${pd.fly ? 0.3 : 0.45})`; const sw = pd.fly ? 4 : 6; g.fillRect(P(px - sw / 2), P(py), sw * s, s);
      g.save(); g.translate(P(px) + 6 * s, 0); g.scale(-1, 1);
      g.drawImage(im, k * pd.cell[0], 0, pd.cell[0], pd.cell[1], 0, P(py - pd.feet[1] - lift), pd.cell[0] * s, pd.cell[1] * s); g.restore();
    }
  }
}

/** The frame worn (a part 5 frame, a league frame or the season's) as border-image data: sprite, slice, animated sheet. */
export function frameOf(worn) {
  const k = worn.frame;
  if (!k) return null;
  if (k.startsWith('league.')) { const t = K.compete.leagues.tiers.find((x) => x.key === k.slice(7)); return t && t.frame; }
  if (k.startsWith('season.')) { const s = K.compete.season.seasons.find((x) => x.id === k.slice(7)); return s && s.frame; }
  const i = K.by[k]; return i && { sprite: i.sprite, slice: i.slice || 4, anim: i.anim };
}

const live = new Set();
let clock = null;
/** Animated cards share one clock; a frozen time (screenshots) is window.__t. */
function startClock() {
  if (clock || window.__still) return;
  const step = async (now) => { for (const c of live) await c.draw(now); clock = requestAnimationFrame(step); };
  clock = requestAnimationFrame(step);
}
export async function setTime(t) { for (const c of live) await c.draw(t); for (const f of document.querySelectorAll('[data-anim]')) frameStep(f, t); }

function frameStep(el, t) {
  if (!el._cells) return;
  const a = JSON.parse(el.dataset.anim); el.style.borderImageSource = `url(${el._cells[Math.floor(t / a.ms) % a.frames]})`;
}
async function cells(a) {
  const im = await load(a.sheet); const out = [];
  for (let k = 0; k < a.frames; k++) { const c = document.createElement('canvas'); c.width = im.height; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, k * im.height, 0, im.height, im.height, 0, 0, im.height, im.height); out.push(c.toDataURL()); }
  return out;
}

/**
 * A stage: the frame round the scene. kind = row | big | podium; o.animate draws on the clock; o.scale overrides the layout's.
 * Returns the element (div.fl-stage > canvas).
 */
export async function stage(kind, worn, o = {}) {
  await kit(); const L = K.anchors.layouts[kind]; const s = o.scale || (typeof L.scale === 'number' ? L.scale : (innerWidth >= 900 ? L.scale.monitor : L.scale.phone));
  const fs = o.frameScale || L.frame.scale;
  const box = document.createElement('div'); box.className = `fl-stage ${kind}`;
  const c = document.createElement('canvas'); c.width = L.scene[0] * s; c.height = L.scene[1] * s; c.style.width = `${c.width}px`; c.style.height = `${c.height}px`;
  box.append(c);
  const fr = frameOf(worn) || frameOf({ frame: `league.${worn.league || 'spark'}` });
  box.style.borderWidth = `${fr.slice * fs}px`; box.style.borderImageSource = `url(${A + fr.sprite})`; box.style.borderImageSlice = `${fr.slice} fill`; box.style.borderImageWidth = `${fr.slice * fs}px`;
  if (fr.anim && o.animate) { box.dataset.anim = JSON.stringify(fr.anim); box._cells = await cells(fr.anim); }
  const g = c.getContext('2d');
  const card = { draw: async (t) => { g.clearRect(0, 0, c.width, c.height); await drawScene(g, L, worn, t, s); } };
  const t0 = window.__t ?? 0;
  await card.draw(o.animate ? t0 : (o.still ?? 0));
  if (o.animate) { live.add(card); startClock(); if (box._cells) frameStep(box, t0); }
  return box;
}

/** A scene alone on a canvas of its own (share cards, notifications): the layout's scene at its scale. */
export async function scene(kind, worn, t = 0, s) {
  await kit(); const L = K.anchors.layouts[kind]; s = s || L.scale;
  const c = document.createElement('canvas'); c.width = L.scene[0] * s; c.height = L.scene[1] * s; await drawScene(c.getContext('2d'), L, worn, t, s); return c;
}
