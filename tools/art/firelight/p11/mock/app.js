// Firelight · part 11 mock screens. ?s=<screen>&v=A|B|C&lang=en|ru[&t=ms]: one screen of one variant, phone below 700 px wide.
import { Q, freeze, stamp, G } from './kit.js';
const S = Q.get('s') || 'levelup', V = Q.get('v') || 'A';
const AREAS = {
  levelup: ['growth', './s-hero.js'], strength: ['strength', './s-hero.js'], passport: ['passport', './s-hero.js'], ceremony: ['ceremony', './s-hero.js'],
  bag: ['slot', './s-bag.js'], item: ['card', './s-bag.js'], truth: ['truth', './s-bag.js'],
  catalog: ['catalog', './s-know.js'], bestiary: ['bestiary', './s-know.js'], chronicle: ['chronicle', './s-know.js'],
  mechanic: ['mechanic', './s-mech.js'], mechanics: ['mechanic', './s-mech.js'], end: ['end', './s-end.js'],
};
const [area, mod] = AREAS[S];
const m = await import(mod);
await m[S](V);
await document.fonts.ready;
if (!Q.has('nostamp')) stamp(S, V, G.variants[area][V]);
await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
freeze(Q.has('t') ? +Q.get('t') : null);
window.__ready = true;
window.__at = (ms) => freeze(ms);
