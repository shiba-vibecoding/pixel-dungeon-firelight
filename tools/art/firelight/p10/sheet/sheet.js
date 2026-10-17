/* Firelight · part 10 «doors you can read from any side»: the rules sheet. The system (four signs: threshold, frame, leaf top, light),
   the hard case (a wall running north-south), before and after; each region's every state in every orientation by a torch and in the
   dark; the animations frame by frame. The pictures are 3D frames of tools/art/firelight/hd2d-viewer/doors.html (camera 70°, orthographic).
   ?p=rule|region|anim &r=0..4 &lang=en|ru */
const Q = new URLSearchParams(location.search); const L = Q.get('lang') || 'en', P = Q.get('p') || 'rule', R = +(Q.get('r') || 0), WIDE = innerWidth >= 900;
const D = await (await fetch('assets/doors/doors.json')).json();
const NAMES = ['sewers', 'prison', 'caves', 'city', 'halls'];
const T = {
  en: { title: 'Doors you can read from any side', sub: 'camera 70°, orthographic · walls 1.5, cut 0.95 · 16 px a cell',
    region: ['Sewers', 'Prison', 'Caves', 'Dwarven city', 'Demon halls'],
    signs: 'Four signs, from above and from every side', signsText: [
      '<b>Threshold</b> — a plate on the floor of the doorway, a lighter worn path down the middle, lipping out ⅛ cell into both rooms: its planks or slabs run the way through. Seen from above in every orientation.',
      '<b>Frame</b> — two posts lining the doorway and two lintel beams across its faces, in the region\'s own frame material (not the wall\'s), a pixel proud of the wall, their tops faintly lit: from above a bright rectangle round the gap, even in the dark.',
      '<b>Leaf</b> — lower than the wall (1.25 of 1.5), so it reads as a door in a gap; its top is planks with a hinge knuckle and a ring (a chain when locked): a bar across the frame when shut, along its side when open.',
      '<b>Light</b> — a warm line under the leaf, a glow over it and a spill on the threshold when the room beyond is lit; cold blue at a locked door, with a padlock on both faces and a keyhole plaque on both lintels.'],
    hard: 'The hard case: a wall running north–south', hardText: [
      'The camera sees only the top of such a door: its face is edge-on. So it is read by the top: the threshold\'s plate across the wall line, the frame\'s rectangle, the leaf\'s bar, the light spilling out both ways.',
      'The wall cell just south of it is lowered to a <b>shoulder</b> (0.6): a notch in the wall line that shows where the door is and hides none of the doorway.',
      'Open, its leaf turns to face the camera: the clearest «open» of all.'],
    before: 'Before and after', beforeText: 'The same rooms: the door as the game draws it now (a plank leaf in the gap, the walls beside as jambs) and part 10.',
    o: { a: 'east–west wall, its face to the camera', b: 'a cut wall, seen from behind', c: 'north–south wall' }, ob: { a: 'a', b: 'b', c: 'c' },
    lights: { torch: 'by a torch', dark: 'in the dark (the hero\'s light)' }, old: 'now', new: 'part 10', phone: 'phone 375 × 812', noShoulder: 'without the shoulder', withShoulder: 'with the shoulder',
    s: { closed: 'shut', open33: 'opening 30°', open66: '60°', open: 'open', locked: 'locked', vault: 'vault', barricade: 'barricade', burning: 'burning', charred: 'burnt',
      secret1: 'secret: cracks', secret2: 'sparks', sink: 'the wall sinks', found: 'found', exit: 'exit, locked', exitkey: 'skull key', exitopen: 'exit, open', key: 'key in the padlock' },
    ctx: { corner: 'in a corner', torch: 'between torches', corridor: 'dark corridor', water: 'in water', grass: 'in high grass' },
    states: 'Every state in every orientation', exits: 'The boss floor\'s exit and the key', ctxT: 'Places', rooms: 'A room of doors', anims: 'Animations, frame by frame',
    sizes: 'Sizes (cells)', mat: 'Materials',
    animRows: { open: 'open and shut (doorswing.ts: 240 ms, a little overshoot; 200 ms back)', secret: 'a secret door found: cracks, sparks, the wall sinks, dust', key: 'the key: to the lock, in, turned, the lock gone', exit: 'the skull key: the grate lifts' } },
  ru: { title: 'Двери, понятные с любой стороны', sub: 'камера 70°, ортографическая · стены 1,5, срезанные 0,95 · 16 px на клетку',
    region: ['Канализация', 'Тюрьма', 'Пещеры', 'Город гномов', 'Демонические залы'],
    signs: 'Четыре признака — сверху и с любой стороны', signsText: [
      '<b>Порог</b> — плита на полу проёма, посередине светлая протоптанная дорожка, выступает на ⅛ клетки в обе комнаты; доски или плиты идут вдоль прохода. Виден сверху при любой ориентации.',
      '<b>Рама</b> — два косяка вдоль проёма и две перемычки на его лицевых сторонах, из своего материала региона (не стены), на пиксель выше стены, с чуть светящимся верхом: сверху — яркий прямоугольник вокруг проёма, даже в темноте.',
      '<b>Створка</b> — ниже стены (1,25 из 1,5), поэтому читается как дверь в проёме; её верх — доски с петлёй и кольцом (у запертой — цепь): закрытая — поперечная планка в раме, открытая — вдоль её края.',
      '<b>Свет</b> — тёплая полоска под створкой, свечение над ней и пятно на пороге, если за дверью освещённая комната; у запертой — холодный синий, навесной замок на обеих сторонах и табличка-скважина на обеих перемычках.'],
    hard: 'Самый трудный случай: стена «север–юг»', hardText: [
      'Такую дверь камера видит только сверху: её лицо повёрнуто ребром. Поэтому она читается по верху: плита порога поперёк линии стены, прямоугольник рамы, планка створки, свет в обе стороны.',
      'Клетка стены сразу к югу от неё опущена до <b>плеча</b> (0,6): выемка в линии стены показывает, где дверь, и не закрывает проём.',
      'Открытая — её створка поворачивается лицом к камере: самое ясное «открыто».'],
    before: 'Было и стало', beforeText: 'Одни и те же комнаты: дверь, как её рисует игра сейчас (дощатая створка в разрыве, соседние стены — косяки), и часть 10.',
    o: { a: 'стена «восток–запад», лицом к камере', b: 'срезанная стена, вид со спины', c: 'стена «север–юг»' }, ob: { a: 'а', b: 'б', c: 'в' },
    lights: { torch: 'у факела', dark: 'в темноте (свет героя)' }, old: 'сейчас', new: 'часть 10', phone: 'телефон 375 × 812', noShoulder: 'без плеча', withShoulder: 'с плечом',
    s: { closed: 'закрыта', open33: 'открывается 30°', open66: '60°', open: 'открыта', locked: 'заперта', vault: 'хранилище', barricade: 'баррикада', burning: 'горит', charred: 'сгорела',
      secret1: 'потайная: трещины', secret2: 'искры', sink: 'стена уходит', found: 'найдена', exit: 'выход заперт', exitkey: 'ключ-череп', exitopen: 'выход открыт', key: 'ключ в замке' },
    ctx: { corner: 'в углу', torch: 'между факелами', corridor: 'тёмный коридор', water: 'в воде', grass: 'в траве' },
    states: 'Все состояния во всех ориентациях', exits: 'Выход с этажа босса и ключ', ctxT: 'Места', rooms: 'Комната с дверьми', anims: 'Анимации по кадрам',
    sizes: 'Размеры (в клетках)', mat: 'Материалы',
    animRows: { open: 'открыть и закрыть (doorswing.ts: 240 мс с небольшим перелётом, 200 мс обратно)', secret: 'потайная найдена: трещины, искры, стена уходит, пыль', key: 'ключ: к замку, в скважину, поворот, замка нет', exit: 'ключ-череп: решётка поднимается' } },
}[L];
const MAT = {
  en: ['dark oak with a slot window (PD\'s), tarred timber frame, worn stone sill', 'PD\'s arched oak, dark iron frame, iron and stone sill', 'rough planks with a Z brace, pale pine pit-props, plank sill',
    'blue-grey steel with amber slits (PD\'s), brass frame, slate sill', 'black iron with green runes (PD\'s), bone frame, dark stone sill'],
  ru: ['тёмный дуб со смотровой щелью (как в PD), просмолённая балка, истёртый каменный порог', 'арочная дубовая дверь PD, тёмная железная рама, железо и камень на пороге', 'грубые доски с раскосом, светлые сосновые стойки, дощатый порог',
    'сине-серая сталь с янтарными щелями (как в PD), латунная рама, сланцевый порог', 'чёрное железо с зелёными рунами (как в PD), костяная рама, тёмный каменный порог'],
}[L];
const el = (t, c, ...k) => { const e = document.createElement(t); if (c) e.className = c; for (const x of k) if (x != null) e.append(x); return e; };
const html = (t, c, s) => { const e = el(t, c); e.innerHTML = s; return e; };
const card = (title, sm, ...kids) => el('div', 'card', el('h2', '', title, sm ? el('small', '', sm) : null), ...kids);
const imgs = [];
const pic = (src, w, label, hl) => { const i = new Image(); i.src = src; i.style.cssText = `width:${w}px;height:auto;display:block;image-rendering:pixelated`; imgs.push(new Promise((ok) => { i.onload = ok; i.onerror = ok; }));
  const f = el('figure', '', i, label ? html('figcaption', '', label) : null); f.style.cssText = `margin:0;display:flex;flex-direction:column;gap:2px;width:${w}px`; if (hl) f.style.outline = '2px solid #ff9a3a'; return f; };
const row = (...k) => { const r = el('div', 'row', ...k); r.style.gap = '6px'; return r; };
const style = document.createElement('style'); style.textContent = 'figcaption{font:12px/1.3 G9;color:#b0b5a3;max-width:100%} figcaption b{color:#ffcc66;font-weight:400} table{border-collapse:collapse;font:13px G9;color:#b0b5a3} td,th{padding:3px 8px;border-bottom:1px solid #282a24;text-align:left} th{color:#ffcc66;font-weight:400}';
document.head.append(style);
const STATES = ['closed', 'open33', 'open66', 'open', 'locked', 'vault', 'barricade', 'burning', 'charred', 'secret1', 'secret2', 'sink', 'found'];
const V = (r, l, o, s) => `vig/${r}-${l}-${o}-${s}.png`;

async function rule() {
  const ul = el('ul'); for (const t of T.signsText) ul.append(html('li', '', t));
  const w = WIDE ? 150 : 94;
  const sample = row(...['closed', 'open', 'locked'].flatMap((s) => ['a', 'c'].map((o) => pic(V(0, 'torch', o, s), w, `${T.s[s]} · ${T.ob[o]}`))));
  app.append(card(T.signs, 'doors.json · doorkit.ts', ul, sample));
  // the hard case
  const ul2 = el('ul'); for (const t of T.hardText) ul2.append(html('li', '', t));
  const w2 = WIDE ? 200 : 94;
  app.append(card(T.hard, `${T.ob.c} · ${T.o.c}`, ul2, row(pic(V(0, 'torch', 'c', 'old'), w2, `<b>${T.old}</b>`), pic('vig/0-torch-c-noshoulder.png', w2, `${T.new}, ${T.noShoulder}`), pic(V(0, 'torch', 'c', 'closed'), w2, `<b>${T.new}</b>, ${T.withShoulder}`),
    pic(V(0, 'dark', 'c', 'old'), w2, `${T.old} · ${T.lights.dark}`), pic(V(0, 'dark', 'c', 'closed'), w2, `${T.new} · ${T.lights.dark}`), pic(V(0, 'torch', 'c', 'open'), w2, `${T.new} · ${T.s.open}`))));
  // before and after, each orientation
  const ba = [];
  for (const o of ['a', 'b', 'c']) for (const l of ['torch', 'dark']) ba.push(pic(V(4, l, o, 'old'), WIDE ? 140 : 94, `${T.ob[o]} · ${T.old}`), pic(V(4, l, o, 'closed'), WIDE ? 140 : 94, `${T.ob[o]} · <b>${T.new}</b>`));
  const ph = row(pic('rooms/1-torch-old-375x812.png', WIDE ? 190 : 150, `${T.old} · ${T.phone}`), pic('rooms/1-torch-375x812.png', WIDE ? 190 : 150, `<b>${T.new}</b> · ${T.phone}`),
    pic('rooms/1-dark-old-375x812.png', WIDE ? 190 : 150, `${T.old} · ${T.lights.dark}`), pic('rooms/1-dark-375x812.png', WIDE ? 190 : 150, `<b>${T.new}</b> · ${T.lights.dark}`));
  app.append(card(T.before, T.region[4] + ' · ' + T.region[1], html('p', '', T.beforeText), row(...ba), ph));
  // sizes
  const tb = el('table'); const add = (k, v) => tb.append(el('tr', '', el('th', '', k), el('td', '', v)));
  add(L === 'ru' ? 'стена / срезанная / плечо' : 'wall / cut / shoulder', `${D.heights.wall} / ${D.heights.cut} / ${D.heights.shoulder}`);
  add(L === 'ru' ? 'верх рамы' : 'frame top', `${D.heights.frameTop.full} / ${D.heights.frameTop.cut}`);
  add(L === 'ru' ? 'косяк (ширина × глубина)' : 'post (width × depth)', `${D.post.w} × 1`);
  add(L === 'ru' ? 'перемычка (высота × толщина)' : 'lintel (height × depth)', `${D.lintel.h} × ${D.lintel.d}`);
  add(L === 'ru' ? 'створка (ширина × толщина × высота)' : 'leaf (width × thickness × height)', `${D.leaf.w} × ${D.leaf.t} × ${D.leaf.h.full} / ${D.leaf.h.cut}, +${D.leaf.lift}`);
  add(L === 'ru' ? 'порог (ширина × длина × высота)' : 'threshold (width × length × height)', `${D.threshold.w} × ${D.threshold.l} × ${D.threshold.h}`);
  add(L === 'ru' ? 'замок / табличка' : 'padlock / plaque', `${D.padlock.w} × ${D.padlock.h} × ${D.padlock.d} / ${D.plaque.w} × ${D.plaque.h}`);
  add(L === 'ru' ? 'листы' : 'sheets', `doors-<region>.png, -glow.png ${D.sheets.size.join(' × ')} · doors-fx.png`);
  app.append(card(T.sizes, 'assets/doors/doors.json', tb));
}

async function region() {
  const r = R; app.append(card(T.region[r], NAMES[r], html('p', '', `<b>${T.mat}:</b> ${MAT[r]}`)));
  for (const l of ['torch', 'dark']) {
    const w = WIDE ? 78 : 94; const blocks = [];
    if (WIDE) {
      for (const o of ['a', 'b', 'c']) blocks.push(el('div', '', html('p', '', `<b>${T.ob[o]}</b> — ${T.o[o]}`), row(...STATES.map((s) => pic(V(r, l, o, s), w, T.s[s])), pic(V(r, l, o, 'old'), w, `<i>${T.old}</i>`))));
    } else {
      blocks.push(row(...['a', 'b', 'c'].map((o) => html('p', '', `<b>${T.ob[o]}</b> — ${T.o[o]}`))));
      for (const s of [...STATES, 'old']) blocks.push(row(...['a', 'b', 'c'].map((o) => pic(V(r, l, o, s), w, s === 'old' ? `<i>${T.old}</i>` : T.s[s]))));
    }
    app.append(card(`${T.states} · ${T.lights[l]}`, `${T.region[r]}`, ...blocks));
  }
  const w = WIDE ? 120 : 94;
  app.append(card(T.exits, '', row(...['torch', 'dark'].flatMap((l) => [pic(V(r, l, 'x', 'exit'), w, `${T.s.exit} · ${T.lights[l].split(' ')[0]}`), pic(V(r, l, 'x', 'exitkey'), w, T.s.exitkey), pic(V(r, l, 'x', 'exitopen'), w, T.s.exitopen), pic(V(r, l, 'a', 'key'), w, T.s.key)]))));
  app.append(card(T.ctxT, '', row(...['torch', 'dark'].flatMap((l) => ['corner', 'torch', 'corridor', 'water', 'grass'].map((c) => pic(`vig/${r}-${l}-ctx-${c}.png`, w, `${T.ctx[c]} · ${T.lights[l].split(' ')[0]}`))))));
  const pw = WIDE ? 180 : 150;
  app.append(card(T.rooms, T.phone, row(pic(`rooms/${r}-torch-old-375x812.png`, pw, `${T.old} · ${T.lights.torch}`), pic(`rooms/${r}-torch-375x812.png`, pw, `<b>${T.new}</b> · ${T.lights.torch}`),
    pic(`rooms/${r}-dark-old-375x812.png`, pw, `${T.old} · ${T.lights.dark}`), pic(`rooms/${r}-dark-375x812.png`, pw, `<b>${T.new}</b> · ${T.lights.dark}`))));
}

async function anim() {
  const w = WIDE ? 120 : 94;
  const rows_ = [
    ['open', ['closed', 'open33', 'open66', 'open'].flatMap((s) => [V(0, 'torch', 'a', s), V(0, 'torch', 'c', s)])],
    ['secret', ['secret1', 'secret2', 'sink', 'found'].map((s) => V(3, 'torch', 'a', s)).concat(['secret1', 'secret2', 'sink', 'found'].map((s) => V(4, 'dark', 'c', s)))],
    ['key', [V(0, 'torch', 'a', 'locked'), V(0, 'torch', 'a', 'key'), V(0, 'torch', 'a', 'closed'), V(0, 'torch', 'a', 'open'), V(3, 'torch', 'x', 'exit'), V(3, 'torch', 'x', 'exitkey'), V(3, 'torch', 'x', 'exitopen')]],
  ];
  for (const [k, list] of rows_) app.append(card(T.animRows[k] || k, '', row(...list.map((src) => pic(src, w, '')))));
  app.append(card(T.animRows.exit, '', row(...[0, 1, 2, 3, 4].map((r) => pic(V(r, 'torch', 'x', 'exitopen'), w, T.region[r])))));
}

const app = document.getElementById('app');
app.append(el('div', 'top', el('h1', '', { rule: T.title, region: `${T.title} · ${T.region[R]}`, anim: T.anims }[P]), el('span', '', T.sub)));
await document.fonts.load('12px G9'); await document.fonts.load('20px G11');
await ({ rule, region, anim })[P]();
await Promise.all(imgs); await document.fonts.ready; window.__ready = true;
