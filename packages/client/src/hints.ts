import { audio } from './audio';
import { lang } from './i18n';

/*
 * The learning mode: while it is on (the settings; on at first), the game says
 * a word about each thing the first time the player meets it — a monster, an
 * unknown potion, a trap, hunger, a locked door, the stairs — simply and
 * once. Hints come one at a time on a small card that never blocks the map;
 * the ones seen are kept on this device, and can be shown again from the
 * settings.
 */

export type HintId =
  | 'monster' | 'attacked' | 'lowHealth' | 'floorItem' | 'container' | 'trap' | 'lockedDoor' | 'stairs' | 'secret'
  | 'hungry' | 'levelUp' | 'well' | 'altar' | 'alchemy' | 'shop' | 'npc' | 'boss' | 'companion' | 'waiting' | 'examine'
  | 'potion' | 'scroll' | 'weapon' | 'armor' | 'ring' | 'wand' | 'food' | 'seed' | 'missile' | 'bomb' | 'key' | 'gold'
  | 'dew' | 'vial' | 'bag' | 'ankh' | 'honeypot' | 'torch' | 'tome' | 'kit' | 'beacon' | 'weightstone';

type Text = readonly [title: string, text: string];

const RU: Record<HintId, Text> = {
  monster: ['Враг!', 'Нажмите на монстра, чтобы атаковать. Кнопка с его портретом справа бьёт ближайшего. Бой идёт по ходам: пока вы стоите, стоит и он.'],
  attacked: ['Вас ранили', 'Красная полоса вверху — здоровье. Оно само восстанавливается со временем. Удерживайте часы, чтобы отдохнуть до полного.'],
  lowHealth: ['Мало здоровья', 'Отступите и отдохните (удерживайте часы) или выпейте зелье исцеления. Дверь между вами и врагами — хорошее укрытие.'],
  floorItem: ['Что-то на полу', 'Нажмите на предмет, и герой подойдёт и подберёт его. Всё подобранное — в рюкзаке справа внизу.'],
  container: ['Сундук', 'Нажмите на сундук, и герой откроет его, стоя рядом. Гробы и останки тоже открываются, но могут потревожить мёртвых.'],
  trap: ['Ловушка', 'Найденные ловушки герой обходит сам. Брошенный на ловушку предмет заставит её сработать без вас.'],
  lockedDoor: ['Запертая дверь', 'Нужен железный ключ с этой глубины: он лежит где-то на уровне. С ключом дверь откроется сама.'],
  stairs: ['Лестница вниз', 'Нажмите на неё, чтобы спуститься глубже. Чем глубже — тем опаснее и тем лучше добыча. Сначала стоит осмотреть уровень.'],
  secret: ['Тайники', 'Если уровень кажется тупиком, ищите (лупа или F) у стен: подземелье прячет двери и ловушки.'],
  hungry: ['Голод', 'Оранжевая полоса — сытость. Съешьте еду из рюкзака. Голодный герой не лечится, а потом теряет здоровье.'],
  levelUp: ['Новый уровень', 'Герой стал сильнее: больше здоровья, точнее удары. Опыт — жёлтая полоса под здоровьем.'],
  well: ['Колодец', 'Магический колодец: здоровья, знания или превращений. Встаньте в него, чтобы испить, или бросьте предмет в колодец превращений.'],
  altar: ['Алтарь', 'Жертвенный огонь притягивает монстров. Убитые на нём засчитываются как жертва, и алтарь наградит вас.'],
  alchemy: ['Алхимический котёл', 'Бросьте в котёл три семени, и сварится зелье.'],
  shop: ['Лавка', 'Нажмите на товар, чтобы купить. Ненужное можно продать торговцу из рюкзака.'],
  npc: ['Житель подземелья', 'Нажмите на него, чтобы поговорить. У многих есть просьба и награда за неё.'],
  boss: ['Логово босса', 'Здесь живёт босс. Следите за его действиями и подсказками на экране: каждый бьёт по-своему. Возьмите с собой зелья.'],
  companion: ['Товарищ', 'Ваш товарищ по отряду. В него можно войти — вы поменяетесь местами. Вещь можно передать, бросив её на пол.'],
  waiting: ['Ход товарища', 'В бою отряд ходит по очереди: игра ждёт того, на кого напали. Отвлёкшийся товарищ не держит отряд дольше нескольких секунд.'],
  examine: ['Осмотреться', 'Кнопка «?» (или X) — осмотреть: нажмите её, а потом на клетку, чтобы узнать, что там.'],
  potion: ['Зелье', 'Неопознанные зелья узнаются, только когда их выпьешь или бросишь. Одни лечат, другие вредят — пробуйте, когда рядом нет врагов.'],
  scroll: ['Свиток', 'Неопознанный свиток узнаётся при прочтении. Свиток улучшения и зачарования спросит, на какой предмет его прочитать.'],
  weapon: ['Оружие', 'Перетащите его в слот оружия или нажмите «Надеть». Число в углу — нужная сила: тяжёлое оружие без силы бьёт хуже.'],
  armor: ['Броня', 'Наденьте её из рюкзака. Чем тяжелее броня, тем больше силы нужно; без силы вы станете неуклюжи.'],
  ring: ['Кольцо', 'Носить можно два кольца. Что делает кольцо, станет ясно, если поносить его какое-то время. Проклятое кольцо не снять.'],
  wand: ['Палочка', 'Палочку направляют на цель: «Взмахнуть» в рюкзаке или быстрый слот. Заряды восстанавливаются сами.'],
  food: ['Еда', 'Ешьте, когда проголодаетесь: еда в подземелье на вес золота.'],
  seed: ['Семя', 'Бросьте семя, и на том месте вырастет растение. Каждое срабатывает по-своему, когда на него наступят.'],
  missile: ['Метательное оружие', 'Дротики и ножи бросают во врагов: положите их в быстрый слот (кнопка внизу справа) и нажмите на цель.'],
  bomb: ['Бомба', 'Бросьте бомбу — через пару ходов она взорвётся. Не стойте рядом!'],
  key: ['Ключ', 'Ключ открывает запертую дверь или сундук на этой же глубине.'],
  gold: ['Золото', 'Золото тратится в лавках на глубинах 6, 11, 16 и 21.'],
  dew: ['Роса', 'Капля росы лечит, если вы ранены. С флягой для росы её можно собирать впрок.'],
  vial: ['Фляга для росы', 'В неё собирается роса, когда вы здоровы. Выпейте флягу, чтобы вылечиться.'],
  bag: ['Сумка', 'Сумка держит семена, свитки или палочки отдельно и бережёт их от огня и холода.'],
  ankh: ['Анх', 'Если вы погибнете, анх вернёт вас к жизни один раз.'],
  honeypot: ['Горшок с мёдом', 'Разбейте его, и пчела будет сражаться за вас.'],
  torch: ['Факел', 'Зажгите факел, чтобы видеть дальше в тёмных местах.'],
  tome: ['Книга мастерства', 'Прочитайте её, чтобы выбрать путь героя: один из двух подклассов.'],
  kit: ['Набор для брони', 'Превращает надетую броню в броню класса со своей особой способностью.'],
  beacon: ['Маяк Ллойда', 'Поставьте маяк, и потом сможете вернуться в это место с любой глубины.'],
  weightstone: ['Утяжелитель', 'Балансирует оружие в руке: на скорость или на точность.'],
};

const EN: Record<HintId, Text> = {
  monster: ['An enemy!', 'Tap a monster to attack it. The button with its portrait on the right strikes the nearest. Fights go by turns: while you stand, so does it.'],
  attacked: ['You are hurt', 'The red bar at the top is your health. It comes back with time. Hold the hourglass to rest until healed.'],
  lowHealth: ['Low health', 'Step back and rest (hold the hourglass) or drink a potion of healing. A door between you and the enemies is a good cover.'],
  floorItem: ['Something on the floor', 'Tap an item and the hero will walk up and take it. Everything you carry is in the backpack, bottom right.'],
  container: ['A chest', 'Tap a chest and the hero opens it from beside it. Tombs and remains open too, but may disturb the dead.'],
  trap: ['A trap', 'The hero walks around traps found. An item thrown onto a trap sets it off without you.'],
  lockedDoor: ['A locked door', 'It wants an iron key from this depth: one lies somewhere on the level. With the key, the door opens by itself.'],
  stairs: ['Stairs down', 'Tap them to go deeper. Deeper is more dangerous, and richer. Look around the level first.'],
  secret: ['Hidden things', 'If a level seems a dead end, search (the magnifier or F) by the walls: the dungeon hides doors and traps.'],
  hungry: ['Hunger', 'The orange bar is how fed you are. Eat food from the backpack. A hungry hero does not heal, then starts losing health.'],
  levelUp: ['Level up', 'The hero grew stronger: more health, surer blows. Experience is the yellow bar under health.'],
  well: ['A well', 'A magic well: of health, awareness or transmutation. Step into it to drink, or throw an item into the well of transmutation.'],
  altar: ['An altar', 'The sacrificial fire draws monsters in. Those slain in it count as offerings, and the altar rewards you.'],
  alchemy: ['An alchemy pot', 'Throw three seeds into the pot and a potion will brew.'],
  shop: ['A shop', 'Tap a ware to buy it. What you do not need can be sold to the shopkeeper from the backpack.'],
  npc: ['A dweller of the dungeon', 'Tap them to talk. Many have a request, and a reward for it.'],
  boss: ['A boss\'s lair', 'A boss lives here. Watch what it does and the warnings on screen: each fights in its own way. Bring potions.'],
  companion: ['A companion', 'Your party member. Walk into them and you change places. Hand them an item by dropping it.'],
  waiting: ['A companion\'s move', 'In a fight the party moves in turns: the game waits for whoever is attacked. A companion who looked away holds you up only a few seconds.'],
  examine: ['Look around', 'The «?» button (or X): tap it, then a cell, to learn what is there.'],
  potion: ['A potion', 'Unknown potions are learned only by drinking or throwing them. Some heal, some harm: try them with no enemies around.'],
  scroll: ['A scroll', 'An unknown scroll is learned by reading it. Upgrade and enchantment ask which item to read them on.'],
  weapon: ['A weapon', 'Drag it to the weapon slot or tap «Equip». The number in the corner is the strength it needs: without it, you fight worse.'],
  armor: ['Armour', 'Put it on from the backpack. Heavier armour needs more strength; without it you are clumsy.'],
  ring: ['A ring', 'You can wear two rings. What a ring does shows after wearing it a while. A cursed ring will not come off.'],
  wand: ['A wand', 'Point a wand at a target: «Zap» in the backpack or the quick slot. Charges come back by themselves.'],
  food: ['Food', 'Eat when you are hungry: food is worth its weight in gold down here.'],
  seed: ['A seed', 'Throw a seed and a plant grows there. Each does its own thing when stepped on.'],
  missile: ['A thrown weapon', 'Darts and knives are thrown at enemies: put them in the quick slot (bottom right) and tap a target.'],
  bomb: ['A bomb', 'Throw it and it goes off in a couple of turns. Stand back!'],
  key: ['A key', 'A key opens a locked door or chest on the same depth.'],
  gold: ['Gold', 'Gold is spent in the shops on depths 6, 11, 16 and 21.'],
  dew: ['Dew', 'A dewdrop heals if you are hurt. With a dew vial you can keep it for later.'],
  vial: ['A dew vial', 'It collects dew while you are healthy. Drink from it to heal.'],
  bag: ['A bag', 'A bag keeps seeds, scrolls or wands apart and safe from fire and frost.'],
  ankh: ['An ankh', 'Should you die, the ankh brings you back to life once.'],
  honeypot: ['A honeypot', 'Shatter it and the bee inside fights for you.'],
  torch: ['A torch', 'Light it to see further in dark places.'],
  tome: ['The tome of mastery', 'Read it to choose your hero\'s way: one of two subclasses.'],
  kit: ['An armour kit', 'Turns the armour worn into class armour, with a special ability.'],
  beacon: ['Lloyd\'s beacon', 'Set it, and you can come back to this spot later from any depth.'],
  weightstone: ['A weightstone', 'Balances the weapon in hand: for speed or for accuracy.'],
};

const ENABLED = 'pd-hints';
const SEEN = 'pd-hints-seen';
/** The shortest pause between two hints, so they never pile up. */
const GAP_MS = 2500;
/** A hint goes away by itself after a while; the next waits for it. */
const SHOW_MS = 14_000;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // For this session only.
  }
}

class Hints {
  /** On at first; the settings turn it off. */
  enabled = read(ENABLED) !== 'off';
  private seen = new Set<string>((read(SEEN) ?? '').split(',').filter(Boolean));
  private queue: Array<{ id: HintId; icon?: () => HTMLElement }> = [];
  private card: HTMLElement | null = null;
  private lastShown = -Infinity;
  private timer = 0;
  private root: HTMLElement | null = null;

  /** Where the cards appear (the interface layer). */
  attach(root: HTMLElement): void {
    this.root = root;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    write(ENABLED, on ? 'on' : 'off');
    if (!on) this.dismiss(true);
  }

  /** Every hint as new again. */
  reset(): void {
    this.seen.clear();
    write(SEEN, '');
  }

  /** The first time something is met, its hint (if learning is on); later times, nothing. */
  first(id: HintId, icon?: () => HTMLElement): void {
    if (!this.enabled || this.seen.has(id) || this.queue.some((q) => q.id === id)) return;
    this.queue.push({ id, icon });
    this.pump();
  }

  /** Called every frame: shows the next hint once the last has gone and a moment has passed. */
  pump(): void {
    if (!this.root || this.card || this.queue.length === 0) return;
    if (performance.now() - this.lastShown < GAP_MS) return;
    const { id, icon } = this.queue.shift()!;
    this.seen.add(id);
    write(SEEN, [...this.seen].join(','));
    const [title, text] = (lang === 'ru' ? RU : EN)[id];
    const ok = document.createElement('button');
    ok.className = 'pd-button small';
    ok.textContent = lang === 'ru' ? 'Понятно' : 'Got it';
    ok.onclick = () => {
      audio.play('click');
      this.dismiss();
    };
    const off = document.createElement('button');
    off.className = 'pd-hint-off';
    off.textContent = lang === 'ru' ? 'Больше не подсказывать' : 'No more hints';
    off.onclick = () => {
      audio.play('click');
      this.setEnabled(false);
    };
    const card = document.createElement('section');
    card.className = 'pd-hint';
    card.setAttribute('role', 'status');
    const head = document.createElement('div');
    head.className = 'pd-hint-head';
    if (icon) head.append(icon());
    const name = document.createElement('b');
    name.textContent = title;
    head.append(name);
    const body = document.createElement('p');
    body.textContent = text;
    const row = document.createElement('div');
    row.className = 'pd-hint-row';
    row.append(off, ok);
    card.append(head, body, row);
    this.root.append(card);
    this.card = card;
    this.lastShown = performance.now();
    audio.play('click', 1.4, 0.5);
    this.timer = window.setTimeout(() => this.dismiss(), SHOW_MS);
  }

  private dismiss(all = false): void {
    window.clearTimeout(this.timer);
    this.card?.remove();
    this.card = null;
    this.lastShown = performance.now();
    if (all) this.queue = [];
  }
}

export const hints = new Hints();
