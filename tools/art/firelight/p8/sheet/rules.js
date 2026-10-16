/* Firelight · facings (design part 8). The rules sheet: how a facing is picked, the frames of every facing,
   stage 1 the heroes (armour tiers, the Pixel-Mart looks, hats and pets in the new facings), stage 2 the monsters, and the plan.
   ?p=rule|heroes|looks|hats|pets|monsters|mframes|mobs &cls=warrior|mage|rogue|ranger &kind=<monster> &lang=en|ru */
const Q = new URLSearchParams(location.search); const L = Q.get('lang') || 'en', P = Q.get('p') || 'rule', WIDE = innerWidth >= 900;
const D = await (await fetch('assets/dirs/dirs.json')).json();
const T = {
  en: { title: 'Facings · stage 1: heroes', sub: 'front · side · back, camera 70°, sprite leaned 20°, stretched ×1.56', side: 'side', front: 'front', back: 'back', left: 'left = side mirrored',
    rule: 'How the game picks a facing', ruleText: ['A step with any sideways part (→ ← and the diagonals) shows the <b>side</b>; to the left it is mirrored, as now.', 'A step straight down the screen, towards the camera (↓), shows the <b>front</b>; straight up, away from it (↑), the <b>back</b>.', 'Standing keeps the last facing; a hero who has not moved yet faces the front. An attack or a zap turns to its target by the same rule.', 'A facing holds at least 120 ms, so a zigzag of single steps does not flicker. The tomb (die, 8-12) is the same skull from every side.'],
    layout: 'Layout of a facing sheet', layoutText: 'One sheet per facing, in the layout of the class sheet: 21 frames × 7 armour rows of 12 × 15. The frame numbers and the animations are PD\'s own.',
    groups: { idle: 'idle', run: 'run', die: 'die (tomb)', attack: 'attack / zap', operate: 'operate', fly: 'fly', read: 'read' },
    how: 'How they are made', howText: ['<b>front:</b> PD\'s own front head (operate 16-17 looks down at the hands: what a 70° camera sees) on the side sheet\'s body, which PD draws square to the viewer.', '<b>back:</b> the back of the head drawn over the same outline in the class\'s hair (the rogue\'s hood, the huntress\'s braid); the armour without its front details.', '<b>run:</b> the legs lift in turn, the opposite arm swings, the body rises mid-stride. <b>attack:</b> the right fist up by the head, then at the camera (front) or off over the shoulder (back). PD draws no weapon in the hand: the blow is the arm.'],
    heroes: { warrior: 'Warrior', mage: 'Mage', rogue: 'Rogue', ranger: 'Huntress' }, frames: 'All frames', tiers: 'Armour tiers (idle)',
    looks: 'Pixel-Mart looks in the new facings', looksText: 'Part 5\'s own recolour run on the facing sheets; the legendary looks with their glow mask (the aura is the same in every facing).',
    hats: 'Hats from the front and the back', hatsText: 'Part 5\'s hats.py fits every hat to every frame of the facing sheets. From behind: no cockade on the tricorn, no star on the stargazer\'s cap; the eyepatch is its strap.',
    pets: 'Pets', petRule: 'A pet takes the facing of its own step behind the hero (the same rule). Frames: idle 0, walk 4 and 5.', sym: 'symmetric', sameFront: 'front = side', drawn: 'new front and back', mobs: 'Stages 2 and 3', stage2: 'Stage 2 · the frequent monsters', stage3: 'Stage 3 · the rest', bosses: 'Bosses', symmetric: 'Symmetric: no new views', symText: 'Drawn facing the camera or round: the same from every side.',
    s2title: 'Facings · stage 2: monsters', lineup: 'Each monster four ways', lineupText: 'Idle frame 0: left (the side mirrored), front, back, right. The bee and the bat hover over their own shadow.',
    mrule: 'The same rule as the heroes', mruleText: ['A step with a sideways part shows the <b>side</b> (to the left mirrored), straight down the <b>front</b>, straight up the <b>back</b>. An attack turns the monster to its target by the same rule.', 'A monster that has not moved yet faces the side, as PD draws it. Standing keeps the last facing; a facing holds at least 120 ms.', 'One sheet per facing in the layout of PD\'s own sheet: the same frame numbers and animations, so the game only swaps the sheet. Die frames are PD\'s: the fall is the same from every side.', 'The fetid rat uses the rat\'s sheets, as in PD. The albino rat and the bandit are the second row of the rat and thief sheets, in the colours PD swaps.'],
    mhow: 'How they are made', mframes: 'All frames of the monsters', done: 'done', anims: { idle: 'idle', run: 'run', attack: 'attack', zap: 'zap', die: 'die' },
    mnote: { humanoids: 'gnoll, shaman, skeleton', variants: 'albino, bandit', die: 'die' } },
  ru: { title: 'Направления · этап 1: герои', sub: 'спереди · сбоку · со спины, камера 70°, спрайт откинут на 20°, растянут ×1,56', side: 'бок', front: 'спереди', back: 'со спины', left: 'влево = бок отражён',
    rule: 'Как игра выбирает направление', ruleText: ['Шаг, в котором есть движение вбок (→ ← и диагонали), — <b>вид сбоку</b>; влево — отражение, как сейчас.', 'Шаг строго вниз по экрану, к камере (↓), — <b>вид спереди</b>; строго вверх, от камеры (↑), — <b>вид со спины</b>.', 'Стоя герой сохраняет последнее направление; если он ещё не ходил — смотрит вперёд. Удар и зап поворачивают к цели по тому же правилу.', 'Направление держится не меньше 120 мс — зигзаг одиночных шагов не мерцает. Гибель (кадры 8–12) — череп, одинаковый со всех сторон.'],
    layout: 'Раскладка листа направления', layoutText: 'По листу на направление, в раскладке листа класса: 21 кадр × 7 рядов брони по 12 × 15. Номера кадров и анимации — как в PD.',
    groups: { idle: 'стоит', run: 'бег', die: 'гибель (череп)', attack: 'удар / зап', operate: 'действие', fly: 'полёт', read: 'чтение' },
    how: 'Как они сделаны', howText: ['<b>Спереди:</b> голова — собственная фронтальная голова PD (действие 16–17 смотрит на руки — так и видит камера под 70°), тело — с листа бока: PD рисует его к зрителю.', '<b>Со спины:</b> затылок нарисован по тому же контуру волосами класса (капюшон разбойника, коса охотницы); доспех без передних деталей.', '<b>Бег:</b> ноги поднимаются по очереди, противоположная рука качается, тело поднимается в середине шага. <b>Удар:</b> правый кулак у головы, затем в камеру (спереди) или через плечо вперёд (со спины). Оружия в руке PD не рисует — удар это рука.'],
    heroes: { warrior: 'Воин', mage: 'Маг', rogue: 'Разбойник', ranger: 'Охотница' }, frames: 'Все кадры', tiers: 'Уровни брони (стоит)',
    looks: 'Облики Пиксель-Марта в новых видах', looksText: 'Та же перекраска части 5 на листах направлений; легендарные — с маской свечения (аура одна для всех направлений).',
    hats: 'Шапки спереди и со спины', hatsText: 'hats.py части 5 сажает шапку на каждый кадр листов направлений. Сзади: у треуголки нет кокарды, у колпака — звезды; от повязки видна завязка.',
    pets: 'Питомцы', petRule: 'Питомец берёт направление своего шага за героем (то же правило). Кадры: стоит 0, идёт 4 и 5.', sym: 'симметричный', sameFront: 'спереди = бок', drawn: 'новые виды спереди и сзади', mobs: 'Этапы 2 и 3', stage2: 'Этап 2 · частые монстры', stage3: 'Этап 3 · остальные', bosses: 'Боссы', symmetric: 'Симметричные: новые виды не нужны', symText: 'Нарисованы к камере или круглые — одинаковы со всех сторон.',
    s2title: 'Направления · этап 2: монстры', lineup: 'Каждый монстр в четырёх направлениях', lineupText: 'Кадр 0 (стоит): влево (бок отражён), спереди, со спины, вправо. Пчела и летучая мышь висят над своей тенью.',
    mrule: 'Правило то же, что у героев', mruleText: ['Шаг с движением вбок — <b>бок</b> (влево — отражение), строго вниз — <b>спереди</b>, строго вверх — <b>со спины</b>. Удар поворачивает монстра к цели по тому же правилу.', 'Монстр, который ещё не ходил, стоит боком, как его рисует PD. Стоя он сохраняет последнее направление; направление держится не меньше 120 мс.', 'По листу на направление в раскладке листа PD: те же номера кадров и анимации, код меняет только лист. Кадры гибели — как в PD: падение одинаково со всех сторон.', 'Зловонная крыса берёт листы крысы, как и в PD. Крыса-альбинос и бандит — второй ряд листов крысы и вора, в цветах, которые PD меняет между рядами.'],
    mhow: 'Как они сделаны', mframes: 'Все кадры монстров', done: 'готово', anims: { idle: 'стоит', run: 'бег', attack: 'удар', zap: 'зап', die: 'гибель' },
    mnote: { humanoids: 'гнолл, шаман, скелет', variants: 'альбинос, бандит', die: 'гибель' } },
}[L];
const POSE_RU = {
  gnoll: 'голова гиены повёрнута к камере (уши торчком, морда с чёрным носом к зрителю) на теле PD; со спины — грива по затылку, мех без светлой груди',
  shaman: 'красная маска через глаза, светлая морда под ней; со спины — завязка маски поверх меха',
  skeleton: 'череп прямо к камере, глазницы по сторонам от середины; со спины — круглый затылок, позвоночник и лопатки. Стоя 1–3 — череп PD крутится, со спины в обратную сторону',
  thief: 'лицо в середине капюшона, руки с добычей у груди; со спины — капюшон и плащ. Удар — клинок выходит из рук в камеру',
  rat: 'сидит столбиком, мордой к камере, уши по бокам, лапки у груди, хвост завивается вбок; со спины — уши, спина и хвост между лапами. Укус — рывок на пиксель к камере (со спины — от неё), бег — прыжками',
  bee: 'камера смотрит на пчелу сверху: летит к нам — ближе всего голова и глаза, полосатое брюшко поднимается позади между крыльями; от нас — ближе брюшко с жалом. Крылья прозрачные и машут; высота над тенью — как в PD',
  sheep: 'морда PD (она нарисована анфас у правого края шерсти) посередине руна и жуёт, как в кадрах PD; со спины — шерсть и белый хвостик, который виляет',
  spinner: 'уже смотрит в камеру: спереди = бок; со спины — та же картинка без глаз',
  bat: 'уже смотрит в камеру: спереди = бок; со спины — та же картинка без красных глаз и пасти',
  variants: 'виды крысы и вора в цветах второго ряда PD (палитра, которую PD меняет между рядами)',
  humanoids: 'PD рисует тело к зрителю и поворачивает только голову, поэтому спереди — фронтальная голова в палитре листа на теле бока. При ходьбе ноги поднимаются по очереди; удар — на пиксель к камере, со спины — от неё',
  die: 'как в PD: падение тела одинаково со всех сторон' };
const MOBNAME = { en: {}, ru: { rat: 'крыса', albino: 'крыса-альбинос', fetidRat: 'зловонная крыса', gnoll: 'гнолл', shaman: 'гнолл-шаман', skeleton: 'скелет', thief: 'вор', bandit: 'бандит', bee: 'пчела', sheep: 'овца',
  brute: 'громила', shielded: 'громила со щитом', monk: 'монах', senior: 'старший монах', warlock: 'чернокнижник', golem: 'голем', succubus: 'суккуб', scorpio: 'скорпион', acidic: 'кислотный скорпион', undead: 'мертвец', statue: 'статуя', ratKing: 'крысиный король',
  imp: 'бес', shopkeeper: 'торговец', wandmaker: 'жезломастер', blacksmith: 'кузнец', tengu: 'Тенгу', dm300: 'DM-300', king: 'Король гномов', eye: 'глаз', goo: 'Жижа', yog: 'Йог-Дзева', swarm: 'рой', elemental: 'элементаль', piranha: 'пиранья', larva: 'личинка',
  rottingFist: 'гниющий кулак', burningFist: 'горящий кулак', wraith: 'призрак', ghost: 'дух', crab: 'краб', spinner: 'паук', mimic: 'мимик' } }[L];
const DIM = { rat: [16, 15], albino: [16, 15, 'rat', 16], fetidRat: [16, 15, 'rat', 0], gnoll: [12, 15], shaman: [12, 15], skeleton: [12, 15], thief: [12, 13], bandit: [12, 13, 'thief', 21], bee: [16, 16], sheep: [16, 15],
  brute: [12, 16], shielded: [12, 16, 'brute', 21], monk: [15, 14], senior: [15, 14, 'monk', 18], warlock: [12, 15], golem: [16, 16], succubus: [12, 15], scorpio: [18, 17], acidic: [18, 17, 'scorpio', 14], undead: [12, 16], statue: [12, 15], ratKing: [16, 16],
  imp: [12, 14], shopkeeper: [14, 14], wandmaker: [12, 14], blacksmith: [13, 16], tengu: [14, 16], dm300: [22, 20], king: [16, 16], eye: [16, 18], goo: [20, 14], yog: [20, 19], swarm: [16, 16], elemental: [12, 14], piranha: [12, 16], larva: [12, 8],
  rottingFist: [24, 17], burningFist: [24, 17], wraith: [14, 15], ghost: [14, 15], crab: [16, 16], spinner: [16, 16], bat: [15, 15], mimic: [16, 16] };
const imgs = {}; const img = (src) => imgs[src] || (imgs[src] = new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = 'assets/' + src; }));
const el = (t, c, ...k) => { const e = document.createElement(t); if (c) e.className = c; for (const x of k) if (x != null) e.append(x); return e; };
const html = (t, c, s) => { const e = el(t, c); e.innerHTML = s; return e; };
const S = WIDE ? 3 : 2;
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; c.style.width = w + 'px'; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return [c, g]; }
function label(g, s, x, y, col = '#7a8173', px = 11, align = 'left') { g.font = `${px}px G9`; g.fillStyle = col; g.textAlign = align; g.fillText(s, x, y); }
const SHEET = (cls, facing, look) => {
  const leg = Object.values(D.looks.legendary.ids).includes(look);
  if (!look) return facing === 'side' ? `${cls}.png` : `dirs/${cls}-${facing}.png`;
  const b = `mart/fl/${leg ? 'legendary' : 'looks'}/${cls}-${look}`; return facing === 'side' ? `${b}.png` : `${b}-${facing}.png`;
};
async function frame(g, src, f, t, x, y, s, w = 12, h = 15, flip = false) {
  const im = await img(src); if (!im) return; g.save(); if (flip) { g.translate(x + w * s, y); g.scale(-1, 1); x = 0; y = 0; }
  const cols = Math.floor(im.width / w); g.drawImage(im, (f % cols) * w, (t + Math.floor(f / cols)) * h, w, h, x, y, w * s, h * s); g.restore();
}
const card = (title, sm, ...kids) => el('div', 'card', el('h2', '', title, sm ? el('small', '', sm) : null), ...kids);

async function rule() {
  // the compass: the hero in the middle, a figure at each of the eight steps round him, facing the way the step goes
  const s = WIDE ? 4 : 3, C = 26 * s; const [c, g] = cv(C * 3 + 20, C * 3 + 20);
  g.fillStyle = '#121310'; g.fillRect(0, 0, c.width, c.height);
  const ways = [[-1, -1, 'side', true], [0, -1, 'back', false], [1, -1, 'side', false], [-1, 0, 'side', true], [1, 0, 'side', false], [-1, 1, 'side', true], [0, 1, 'front', false], [1, 1, 'side', false]];
  g.strokeStyle = '#3b3e36'; for (let i = 0; i <= 3; i++) { g.beginPath(); g.moveTo(10 + i * C, 10); g.lineTo(10 + i * C, 10 + 3 * C); g.stroke(); g.beginPath(); g.moveTo(10, 10 + i * C); g.lineTo(10 + 3 * C, 10 + i * C); g.stroke(); }
  for (const [dx, dy, fc, fl] of ways) {
    const x = 10 + (dx + 1) * C + (C - 12 * s) / 2, y = 10 + (dy + 1) * C + 4;
    await frame(g, SHEET('warrior', fc), 2 + ((dx + dy + 3) % 6), 1, x, y, s, 12, 15, fl);
    label(g, (fc === 'side' && fl ? T.side + ' ⇆' : T[fc]), 10 + (dx + 1) * C + C / 2, 10 + (dy + 2) * C - 6, fc === 'side' ? '#b0b5a3' : '#ffcc66', 12, 'center');
  }
  await frame(g, SHEET('warrior', 'front'), 0, 1, 10 + C + (C - 12 * s) / 2, 10 + C + 4, s);
  const arrows = [[0, -1, '↑'], [0, 1, '↓'], [-1, 0, '←'], [1, 0, '→']];
  for (const [dx, dy, a] of arrows) label(g, a, 10 + C + C / 2 + dx * C * 0.36, 10 + C + C / 2 + dy * C * 0.4 + 6, '#ff9a3a', 18, 'center');
  const ul = el('ul'); for (const t of T.ruleText) ul.append(html('li', '', t));
  const top = el('div', 'row', el('div', 'strip', c), el('div', '', ul)); top.lastChild.style.cssText = 'flex:1;min-width:260px';
  app.append(card(T.rule, 'dirs.json → rule', top));
  // the layout: frame numbers by animation
  const gs = D.layout.frames; const s2 = WIDE ? 3 : 2; const lay = [];
  const col = { idle: '#ffcc66', run: '#ff9a3a', die: '#7a8173', attack: '#ff5a3a', operate: '#5ec8c0', fly: '#b48aff', read: '#e8e2c8' };
  for (const [a0, b0] of PARTS(21, 11)) {
    const [c2, g2] = cv((b0 - a0) * 13 * s2 + 10, (15 * s2 + 4) * 3 + 40); g2.fillStyle = '#121310'; g2.fillRect(0, 0, c2.width, c2.height);
    for (const [n, fr] of Object.entries(gs)) {
      const f0 = Math.max(fr[0], a0), f1 = Math.min(fr[fr.length - 1], b0 - 1); if (f0 > f1) continue;
      const x0 = 5 + (f0 - a0) * 13 * s2, x1 = 5 + (f1 - a0 + 1) * 13 * s2 - 4; g2.fillStyle = col[n]; g2.fillRect(x0, 4, x1 - x0, 3); label(g2, T.groups[n], x0, 20, col[n], 11);
    }
    for (const [r, fc] of ['side', 'front', 'back'].entries()) for (let f = a0; f < b0; f++) await frame(g2, SHEET('mage', fc), f, 2, 5 + (f - a0) * 13 * s2, 26 + r * (15 * s2 + 4), s2);
    for (let f = a0; f < b0; f++) label(g2, String(f), 5 + (f - a0) * 13 * s2 + 6 * s2, c2.height - 4, '#7a8173', 10, 'center');
    lay.push(el('div', 'strip', c2));
  }
  app.append(card(T.layout, `${D.layout.cols} × ${D.layout.tiers} · 12 × 15`, html('p', '', T.layoutText), ...lay));
  const ul2 = el('ul'); for (const t of T.howText) ul2.append(html('li', '', t)); app.append(card(T.how, null, ul2));
}

const PARTS = (n, k) => WIDE ? [[0, n]] : Array.from({ length: Math.ceil(n / k) }, (_, i) => [i * k, Math.min(n, (i + 1) * k)]);
async function heroes() {
  for (const cls of (Q.get('cls') ? [Q.get('cls')] : ['warrior', 'mage', 'rogue', 'ranger'])) {
    const s = S; const strips = [];
    for (const [a, b] of PARTS(21, 9)) {
      const [c, g] = cv((b - a) * 13 * s + 60, (15 * s + 6) * 3 + 20); g.fillStyle = '#121310'; g.fillRect(0, 0, c.width, c.height);
      for (const [r, fc] of ['side', 'front', 'back'].entries()) {
        label(g, T[fc], 4, 8 + r * (15 * s + 6) + 15 * s / 2 + 4, fc === 'side' ? '#b0b5a3' : '#ffcc66', 12);
        for (let f = a; f < b; f++) await frame(g, SHEET(cls, fc), f, 1, 60 + (f - a) * 13 * s, 6 + r * (15 * s + 6), s);
      }
      for (let f = a; f < b; f++) label(g, String(f), 60 + (f - a) * 13 * s + 6 * s, c.height - 4, '#7a8173', 10, 'center');
      strips.push(el('div', 'strip', c));
    }
    const tiers = [];
    for (const [a, b] of PARTS(7, 3)) {
      const [c2, g2] = cv((b - a) * 3 * 13 * s + (b - a) * 4 + 12, 15 * s + 22); g2.fillStyle = '#121310'; g2.fillRect(0, 0, c2.width, c2.height);
      for (let t = a; t < b; t++) { const k = t - a; for (const [i, fc] of ['side', 'front', 'back'].entries()) await frame(g2, SHEET(cls, fc), 0, t, 6 + (k * 3 + i) * 13 * s + k * 4, 4, s); label(g2, String(t), 6 + (k * 3 + 1.5) * 13 * s + k * 4, c2.height - 4, '#7a8173', 11, 'center'); }
      tiers.push(el('div', 'strip', c2));
    }
    app.append(card(T.heroes[cls], `${cls}.png · dirs/${cls}-front.png · dirs/${cls}-back.png`, ...strips, html('p', '', T.tiers), ...tiers));
  }
}

async function looks() {
  app.append(html('p', '', T.looksText));
  const grid = el('div', 'grid2');
  for (const cls of ['warrior', 'mage', 'rogue', 'ranger']) {
    const all = [...D.looks.looks, D.looks.legendary.ids[cls]]; const s = S; const strips = [];
    for (const [a, b] of PARTS(all.length, 3)) {
      const ls = all.slice(a, b); const [c, g] = cv(ls.length * 3 * 13 * s + ls.length * 6 + 6, 15 * s + 22); g.fillStyle = '#121310'; g.fillRect(0, 0, c.width, c.height);
      for (const [i, lk] of ls.entries()) {
        const leg = lk === D.looks.legendary.ids[cls];
        for (const [j, fc] of ['side', 'front', 'back'].entries()) {
          const x = 4 + (i * 3 + j) * 13 * s + i * 6; await frame(g, SHEET(cls, fc, lk), 0, 1, x, 4, s);
          if (leg) { const gl = await img(fc === 'side' ? `mart/fl/legendary/${cls}-${lk}-glow.png` : `mart/fl/legendary/${cls}-${lk}-glow-${fc}.png`); if (gl) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.6; g.drawImage(gl, 0, 15, 12, 15, x, 4, 12 * s, 15 * s); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; } }
        }
        label(g, lk, 4 + (i * 3 + 1.5) * 13 * s + i * 6, c.height - 4, leg ? '#ffcc66' : '#7a8173', 11, 'center');
      }
      strips.push(el('div', 'strip', c));
    }
    grid.append(card(T.heroes[cls], `${T.side} · ${T.front} · ${T.back}`, ...strips));
  }
  app.append(grid);
}

async function hats() {
  app.append(html('p', '', T.hatsText)); const grid = el('div', 'grid2'); const s = WIDE ? 3 : 2; const CL = ['warrior', 'mage', 'rogue', 'ranger'];
  for (const hat of D.hats.hats) {
    const strips = [];
    for (const [a, b] of (WIDE ? [[0, 4]] : [[0, 2], [2, 4]])) {
      const [c, g] = cv((b - a) * 3 * 17 * s + 14, 22 * s + 8); g.fillStyle = '#121310'; g.fillRect(0, 0, c.width, c.height);
      for (let ci = a; ci < b; ci++) for (const [j, fc] of ['side', 'front', 'back'].entries()) {
        const cls = CL[ci]; const x = 4 + ((ci - a) * 3 + j) * 17 * s + (ci - a) * 2; await frame(g, SHEET(cls, fc), 0, 1, x + 2 * s, 4 + 7 * s, s);
        await frame(g, fc === 'side' ? `mart/fl/hats/${cls}-${hat}.png` : `mart/fl/hats/${cls}-${hat}-${fc}.png`, 0, 1, x, 4, s, 16, 22);
      }
      strips.push(el('div', 'strip', c));
    }
    grid.append(card(hat, `${T.side} · ${T.front} · ${T.back}`, ...strips));
  }
  app.append(grid);
}

async function pets() {
  const grid = el('div', 'grid2'); const s = WIDE ? 4 : 3;
  for (const [k, v] of Object.entries(D.pets.facings)) {
    const tag = v.symmetric ? el('span', 'tag sym', T.sym) : (v.front === v.side ? el('span', 'tag', T.sameFront) : el('span', 'tag', T.drawn));
    const fcs = v.symmetric ? ['side'] : ['side', 'front', 'back']; const fr = [0, 4, 5];
    const [c, g] = cv(fcs.length * (fr.length * 13 * s + 10) + 4, 12 * s + 22); g.fillStyle = '#121310'; g.fillRect(0, 0, c.width, c.height);
    for (const [j, fc] of fcs.entries()) {
      const x0 = 4 + j * (fr.length * 13 * s + 10); label(g, T[fc], x0, 13, fc === 'side' ? '#b0b5a3' : '#ffcc66', 12);
      for (const [i, f] of fr.entries()) await frame(g, v[fc], f, 0, x0 + i * 13 * s, 18, s, 12, 12);
    }
    grid.append(el('div', 'card', el('h2', '', k, tag), el('div', 'strip', c)));
  }
  app.append(html('p', '', T.petRule), grid);
}

async function mobs() {
  const sec = async (title, list, note) => {
    const m = el('div', 'mobs');
    for (const k of list) { const d = DIM[k]; if (!d) continue; const [w, h, sheet, row] = d; const s = WIDE ? 3 : 2; const st2 = !!MK[k];
      const [c, g] = cv(w * s * (st2 ? 3 : 1) + (st2 ? 4 * s : 0), h * s);
      if (st2) for (const [i, fc] of ['side', 'front', 'back'].entries()) await mframe(g, k, fc, MK[k].off, i * (w + 2) * s, 0, s);
      else await frame(g, `${sheet || k}.png`, row || 0, 0, 0, 0, s, w, h);
      m.append(el('div', 'mob', c, MOBNAME[k] || k)); }
    app.append(card(title, note, m));
  };
  await sec(T.stage2, D.mobs.stage2.list, `${D.mobs.stage2.list.length} · ${T.done}`);
  await sec(T.stage3, D.mobs.stage3.list, `${D.mobs.stage3.list.length}`);
  await sec(T.bosses, D.mobs.stage3.bosses, `${D.mobs.stage3.bosses.length}`);
  await sec(T.symmetric, D.mobs.symmetric.list, T.symText);
}

// ---------- stage 2: the monsters
const MK = D.mobs.kinds; const STAGE2 = Object.keys(MK).filter((k) => k !== 'fetidRat');
const MCOUNT = { rat: 15, albino: 15, gnoll: 11, shaman: 11, skeleton: 17, thief: 13, bandit: 13, bee: 11, sheep: 5, spinner: 10, bat: 7 };
const ACOL = { idle: '#ffcc66', run: '#ff9a3a', attack: '#ff5a3a', zap: '#5ec8c0', die: '#7a8173' };
const msheet = (k, fc) => MK[k].sheets[fc];
async function mframe(g, k, fc, f, x, y, s, flip = false) { const [w, h] = MK[k].cell; await frame(g, msheet(k, fc), f, 0, x, y, s, w, h, flip); }

async function monsters() {
  const s = WIDE ? 4 : 3; const grid = el('div', WIDE ? 'grid2' : 'mobs');
  for (const k of STAGE2) {
    const [w, h] = MK[k].cell; const cw = (WIDE ? 18 : 21) * s, fly = 0; const [c, g] = cv(4 * cw + 8, 18 * s + 22); g.fillStyle = '#121310'; g.fillRect(0, 0, c.width, c.height);
    // the bee and the bat carry their hover and their shadow in the frame
    const ways = [['side', true, T.left.split(' ')[0]], ['front', false, T.front], ['back', false, T.back], ['side', false, T.side]];
    for (const [i, [fc, fl, lb]] of ways.entries()) {
      const x = 4 + i * cw + (cw - w * s) / 2, y = 4 + (17 - h) * s - fly;
      if (!MK[k].fly) g.fillStyle = 'rgba(0,0,0,.45)', g.beginPath(), g.ellipse(4 + i * cw + cw / 2, 4 + 17 * s, w * s * 0.32, 1.6 * s, 0, 0, 7), g.fill();
      await mframe(g, k, fc, MK[k].off, x, y, s, fl);
      label(g, lb, 4 + i * cw + cw / 2, c.height - 4, fc === 'side' ? '#b0b5a3' : '#ffcc66', 11, 'center');
    }
    const same = (MK[k].same || []).length ? el('span', 'tag', T.sameFront) : null;
    grid.append(el('div', 'card', el('h2', '', MOBNAME[k] || k, same, el('small', '', `${MK[k].sheet}.png${MK[k].off ? ' +' + MK[k].off : ''}`)), el('div', 'strip', c)));
  }
  const ul = el('ul'); for (const t of T.mruleText) ul.append(html('li', '', t));
  app.append(card(T.mrule, 'dirs.json → mobs.rule', ul), card(T.lineup, T.lineupText, grid));
  const pose = L === 'ru' ? POSE_RU : D.mobs.pose; const ul2 = el('ul');
  for (const k of ['humanoids', 'gnoll', 'shaman', 'skeleton', 'thief', 'rat', 'bee', 'sheep', 'spinner', 'bat', 'variants', 'die'])
    ul2.append(html('li', '', `<b>${T.mnote[k] || MOBNAME[k] || k}:</b> ${pose[k]}`));
  app.append(card(T.mhow, 'tools/art/firelight/p8/monsters.py', ul2));
}

async function mframes() {
  for (const k of (Q.get('kind') ? [Q.get('kind')] : STAGE2)) {
    const [w, h] = MK[k].cell; const n = MCOUNT[k], off = MK[k].off; const s = WIDE ? 3 : 2; const strips = [];
    for (const [a, b] of PARTS(n, w > 12 ? 8 : 10)) {
      const [c, g] = cv((b - a) * (w + 1) * s + 62, (h * s + 6) * 3 + 20); g.fillStyle = '#121310'; g.fillRect(0, 0, c.width, c.height);
      for (const [r, fc] of ['side', 'front', 'back'].entries()) {
        label(g, T[fc], 4, 8 + r * (h * s + 6) + h * s / 2 + 4, fc === 'side' ? '#b0b5a3' : '#ffcc66', 12);
        for (let f = a; f < b; f++) await mframe(g, k, fc, off + f, 62 + (f - a) * (w + 1) * s, 6 + r * (h * s + 6), s);
      }
      for (let f = a; f < b; f++) label(g, String(off + f), 62 + (f - a) * (w + 1) * s + w * s / 2, c.height - 4, '#7a8173', 10, 'center');
      strips.push(el('div', 'strip', c));
    }
    const an = MK[k].anims; const p = el('p');
    if (typeof an === 'object') for (const [a, fr] of Object.entries(an)) { if (typeof fr !== 'object') continue; p.append(html('span', '', `<b style="color:${ACOL[a]}">${T.anims[a] || a}</b> ${fr.join(' ')} &nbsp; `)); }
    const sh = MK[k].sheets; app.append(card(MOBNAME[k] || k, [sh.side, sh.front, sh.back].filter((v, i, A) => A.indexOf(v) === i).join(' · '), ...strips, p));
  }
}

const app = document.getElementById('app');
const S2 = ['monsters', 'mframes'].includes(P);
app.append(el('div', 'top', el('h1', '', { rule: T.title, heroes: T.frames, looks: T.looks, hats: T.hats, pets: T.pets, mobs: T.mobs, monsters: T.s2title, mframes: T.mframes }[P]), el('span', '', T.sub)));
await document.fonts.load('12px G9'); await document.fonts.load('20px G11');
await ({ rule, heroes, looks, hats, pets, mobs, monsters, mframes })[P]();
await document.fonts.ready; await Promise.all(Object.values(imgs)); window.__ready = true;
