// Firelight · part 13 mock screens: ?s=dialog&who=ghost|wandmaker|blacksmith|imp | quest | boss&b=goo|tengu|dm300|king|yog | place | places, &lang=en|ru
const Q = new URLSearchParams(location.search);
const RU = Q.get('lang') === 'ru';
const T = (en, ru) => (RU ? ru : en);
const PHONE = innerWidth < 700;
const el = (tag, cls, ...kids) => { const n = document.createElement(tag); if (cls) n.className = cls; for (const k of kids.flat()) if (k != null && k !== false) n.append(k instanceof Node ? k : document.createTextNode(String(k))); return n; };
const css = (n, v) => { for (const [k, x] of Object.entries(v)) n.style.setProperty(k, String(x)); return n; };
const item = (i) => css(el('i', 'pd-item'), { '--ix': i % 8, '--iy': Math.floor(i / 8) });
const QUEST = await (await fetch('assets/ui/quest/quest.json')).json();
const PLACES = await (await fetch('assets/ui/places/places.json')).json();
const FX = await (await fetch('assets/fx/fx.json')).json();
const qicon = (name, row = 0, qs = 2) => css(el('i', `fl-qicon${row ? ' badge' : ''}`), { '--qi': (row ? QUEST.icons.badges : QUEST.icons.goals).indexOf(name), '--qr': row, '--qs': qs });

function scene(bg, { dim = false, hudQuest = null } = {}) {
  const ui = el('div', 'mk-ui');
  const img = el('img', 'mk-bg'); img.src = `bg/bg-${bg}-${PHONE ? 'phone' : 'desk'}.png`; ui.append(img);
  const icon = (s, w, h) => { const n = el('i', 'pd-icon'); n.style.backgroundImage = `var(--spr-${s})`; if (w) n.style.width = `${w}px`; if (h) n.style.height = `${h}px`; return n; };
  const side = el('div', 'pd-hud-side', el('span', 'pd-stat', icon('depth'), Q.get('d') || 12), hudQuest || el('span', 'pd-stat', icon('key', 14, 18), 1));
  const hud = el('header', 'pd-hud', el('div', 'pd-hud-main',
    el('div', 'pd-avatar-wrap', el('button', 'pd-avatar', css(el('i'), { '--av': 0 })), el('span', 'pd-hero-lvl', 11)),
    el('div', 'pd-hud-bars', css(el('div', 'pd-bar', el('span', 'pd-bar-text', '56/70')), { '--v': 0.8 }),
      el('div', 'pd-bars-small', el('div', 'pd-bar-pair', icon('star'), css(el('div', 'pd-bar thin xp'), { '--v': 0.36 })), el('div', 'pd-bar-pair', icon('food'), css(el('div', 'pd-bar thin food'), { '--v': 0.7 })))),
    side, el('button', 'pd-menu')));
  const tool = (sprite, w, h) => { const n = el('button', 'pd-tool'); const i = el('i', 'pd-icon'); i.style.backgroundImage = `var(--spr-${sprite})`; css(i, { '--w': w, '--h': h }); n.append(i); return n; };
  ui.append(hud, el('nav', 'pd-toolbar', tool('tool-wait', 12, 12), tool('tool-search', 12, 12), el('button', 'pd-tool quick', item(2 * 8 + 0)), el('button', 'pd-tool quick'), tool('tool-backpack', 14, 15)));
  if (dim) ui.append(el('div', 'mk-dim'));
  document.body.append(ui);
  return ui;
}
const windowOn = (ui, kids, cls = '', max) => { const w = el('div', `pd-window ${cls}`, el('div', 'pd-scroll', ...kids)); if (max) w.style.maxWidth = max; ui.append(el('div', 'pd-overlay static open', w)); return w; };
const steps = (n, of, done = false) => { const s = css(el('div', `fl-qsteps${done ? ' done' : ''}`), { '--of': of }); for (let i = 0; i < of; i++) s.append(el('i', i < n ? (i === n - 1 ? 'last' : 'on') : '')); return s; };

const NPC = {
  ghost: { bg: 'ghost', d: 4, mood: 'calm', name: T('Sad ghost', 'Печальное привидение'), role: T('the sewers, depth 4', 'канализация, глубина 4'),
    say: T('Please, find my dried rose... it lies deeper, where the fetid rat nests. Bring it back, and take a weapon or an armour of mine.',
      'Прошу, найди мою засохшую розу... она глубже, там, где гнездится зловонная крыса. Принеси — и возьми моё оружие или броню.'),
    rewards: [['ghost-weapon', 20, T('Sword', 'Меч')], ['ghost-armor', 26, T('Mail armour', 'Кольчуга')]] },
  wandmaker: { bg: 'wandmaker', d: 8, mood: 'pleased', name: T('Old wandmaker', 'Старый мастер палочек'), role: T('the prison, depth 8', 'тюрьма, глубина 8'),
    say: T('The corpse dust! Splendid — as promised, a wand of my own make. Choose.', 'Трупная пыль! Чудесно — как и обещал, палочка моей работы. Выбирай.'),
    rewards: [['wand-battle', 48, T('Wand of firebolt', 'Палочка огня')], ['wand-utility', 53, T('Wand of blink', 'Палочка скачка')]] },
  blacksmith: { bg: 'blacksmith', d: 13, mood: 'annoyed', name: T('Troll blacksmith', 'Тролль-кузнец'), role: T('the caves, depth 13', 'пещеры, глубина 13'),
    say: T('Nine? I said fifteen. Dark gold, fifteen pieces. Dig.', 'Девять? Я сказал — пятнадцать. Тёмного золота, пятнадцать кусков. Копай.'),
    goal: ['ore', 9, 15] },
  imp: { bg: 'imp', d: 17, mood: 'calm', name: T('Ambitious imp', 'Амбициозный бес'), role: T('the city, depth 17', 'город гномов, глубина 17'),
    say: T('Monks guard tokens I need. Eight of them — and a ring is yours.', 'Монахи носят жетоны, что мне нужны. Восемь штук — и кольцо твоё.'),
    goal: ['token', 3, 8], rewards: [['ring', 32, T('A ring', 'Кольцо')]] },
};

const S = {
  dialog() {
    const who = Q.get('who') || 'ghost', N = NPC[who], mood = Q.get('mood') || N.mood;
    const ui = scene(N.bg, { dim: true });
    const head = el('div', 'fl-dialog-head', el('div', `fl-portrait ${who} ${mood} speaks`), el('div', 'pd-titles', el('span', 'fl-dialog-name', N.name), el('span', 'fl-dialog-role', N.role)), el('button', 'pd-close'));
    const kids = [head, el('p', 'pd-speech', N.say)];
    if (N.goal) {
      const [g, n, of] = N.goal;
      kids.push(el('div', 'fl-quest', qicon(who, 1, 2.5), el('span', 'fl-quest-title', QUEST.names[g][RU ? 'ru' : 'en']), el('div', 'fl-quest-goal', qicon(g, 0, 1.5), T('carried', 'с собой'), el('b', '', `${n} / ${of}`)), steps(n, of)));
    }
    if (N.rewards) kids.push(el('div', 'pd-rewards', ...N.rewards.map(([cls, i, nm]) => el('div', 'pd-reward', el('div', `fl-reward-slot ${cls}`, item(i)), el('span', 'pd-reward-name', nm),
      el('span', 'pd-reward-desc', T('a reward of this quest', 'награда задания')), el('button', 'pd-button small', T('Take', 'Взять'))))));
    kids.push(el('div', 'mk-buttons', el('button', 'pd-button', who === 'blacksmith' ? T('I\'ll be back', 'Ещё вернусь') : T('Later', 'Позже'))));
    windowOn(ui, kids, 'fl-dialog', PHONE ? null : 'var(--window-wide)');
  },
  quest() {
    const hq = el('span', 'fl-hud-quest', qicon('blacksmith', 1, 1.5), el('small', '', '9/15'));
    const ui = scene('blacksmith', { dim: true, hudQuest: hq });
    const card = (who, title, goal, n, of, done) => el('div', `fl-quest${done ? ' done' : ''}`, qicon(who, 1, 3), el('span', 'fl-quest-title', title),
      el('div', 'fl-quest-goal', qicon(goal, 0, 1.5), QUEST.names[goal][RU ? 'ru' : 'en'], el('b', '', done ? '✓' : `${n} / ${of}`)), steps(done ? of : n, of, done));
    windowOn(ui, [el('h2', 'pd-heading', T('Quests', 'Задания')),
      card('ghost', T('The sad ghost · depth 4', 'Печальное привидение · гл. 4'), 'rose', 1, 1, true),
      card('wandmaker', T('The old wandmaker · depth 8', 'Мастер палочек · гл. 8'), 'dust', 1, 1, true),
      card('blacksmith', T('The troll blacksmith · depth 13', 'Тролль-кузнец · гл. 13'), 'ore', 9, 15, false),
      card('imp', T('The ambitious imp · depth 17', 'Амбициозный бес · гл. 17'), 'token', 0, 8, false),
      el('p', 'pd-stat-label', T('The badge in the HUD shows the quest in hand and its count.', 'Значок в панели героя — текущее задание и его счёт.'))], '', PHONE ? null : 'var(--window-wide)');
  },
  boss() {
    const b = Q.get('b') || 'goo'; const card = FX.bossCards.bosses[b];
    const ui = scene(b, {});
    const v = { goo: 0.72, tengu: 0.48, dm300: 0.35, king: 0.6, yog: 0.86 }[b];
    const bar = el('div', `fl-bossbar ${b}`, el('i', 'icon'), el('div', 'name', card.name[RU ? 'ru' : 'en'], el('small', '', card.sub[RU ? 'ru' : 'en'])),
      el('div', 'track', css(el('i', 'trace'), {}), el('i', 'fill'), el('i', 'ticks')));
    css(bar, { '--v': v, '--was': Math.min(1, v + 0.08) });
    ui.append(bar);
  },
  place() {
    const p = Q.get('p') || 'well-transmutation';
    const ui = scene('ghost', { dim: true });
    const [nm, text] = PLACES.cards[p][RU ? 'ru' : 'en'];
    windowOn(ui, [el('div', 'fl-place', css(el('i', 'fl-picon'), { '--pi': PLACES.icons.order.indexOf(p) }), el('span', 'fl-place-name', nm), el('span', 'pd-stat-label', T('what is it', 'что это'))),
      el('p', 'fl-place-text', text), el('div', 'mk-buttons', el('button', 'pd-button', T('Close', 'Закрыть'))) ]);
  },
  places() {
    const ui = scene('wandmaker', { dim: true });
    const items = PLACES.icons.order.map((p, i) => el('div', '', css(el('i', 'fl-picon'), { '--pi': i }), PLACES.cards[p][RU ? 'ru' : 'en'][0]));
    windowOn(ui, [el('h2', 'pd-heading', T('Places of the dungeon', 'Места подземелья')), el('div', 'fl-codex', ...items)], '', PHONE ? null : 'var(--window-wide)');
  },
};
(S[Q.get('s') || 'dialog'])();
await document.fonts.ready;
document.body.append(el('div', 'mk-stamp', `part 13 · ${Q.get('s')}${Q.get('who') ? ' · ' + Q.get('who') : ''}${Q.get('b') ? ' · ' + Q.get('b') : ''}`));
await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
for (const a of document.getAnimations()) { a.finish?.(); }
window.__ready = true;
window.__at = () => {};
