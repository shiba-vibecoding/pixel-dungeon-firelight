import { addHero, armorStats, createItem, createWorld, floorAt, type Hero, heroById, type Item, type ItemKind, levelAt, type World } from '@pd/core';
import { describe, expect, it } from 'vitest';
import { type FakeEl, say, stubBrowser } from './fakedom';

stubBrowser('en');
const { slot } = await import('../src/screens');
const { compareBlock, segsBar } = await import('../src/growcard');
const { chipCounts, chipOf } = await import('../src/growchips');
const { auraOf, compare, heft, nowLight, passport, slotMarks, strengthWanted } = await import('../src/growth');
const { collectionView, chronicleView, shelfModel } = await import('../src/growknow');
const { passportNode } = await import('../src/growhero');
const { growthCard } = await import('../src/growend');
const { emptyMem, lookKey } = await import('../src/growmem');
const { knowLine } = await import('../src/infolines');
const { mechCard } = await import('../src/growmech');
const { itemInfo, itemName } = await import('../src/itemtext');
const { restInfo, searchInfo, shopInfo, trapInfo } = await import('../src/mechinfo');

/*
 * «An unidentified item must reveal nothing it shouldn't.» Two worlds that differ only in what the player does not know — a weapon's
 * or armour's level and curse, a ring's kind and level, the kind under a potion's or scroll's look — are drawn by every screen of
 * part 11 into the same texts, badges and numbers. Each test also checks that the drawing does change once the thing is known, so
 * that sameness is not just an empty page.
 */

function world(seed = 21): { world: World; hero: Hero } {
  const w = createWorld(seed);
  floorAt(w, 1).mobs = [];
  levelAt(w, 1);
  addHero(w, { id: 'p', name: 'P', heroClass: 'warrior' });
  const hero = heroById(w, 'p')!;
  hero.str = 12;
  hero.lvl = 6;
  return { world: w, hero };
}

const hidden = (kind: ItemKind, level: number, o: Partial<Item> = {}): Item => ({ ...createItem(kind), level, levelUnknown: true, curseUnknown: true, ...o });
const asText = (n: FakeEl | FakeEl[]): string => (Array.isArray(n) ? n.map(say).join('|') : say(n));
const KINDS_POTION: ItemKind[] = ['potion.healing', 'potion.frost', 'potion.toxicGas', 'potion.mindVision'];

/** Everything of part 11 that a hero's gear can show, as one string. */
function drawGear(w: World, hero: Hero): string {
  const items = [hero.weapon, hero.armor, ...hero.rings, ...hero.items].filter((i): i is Item => !!i);
  const out: string[] = [];
  for (const item of items) {
    out.push(asText(slot(w, item, { hero }) as unknown as FakeEl));
    out.push(JSON.stringify(slotMarks(w, hero, item, { fresh: true })));
    out.push(JSON.stringify([strengthWanted(item), heft(hero, item), compare(hero, item)]));
    const card = compareBlock(hero, item);
    if (card) out.push(asText(card as unknown as FakeEl));
    out.push(asText(knowLine(w, hero, item) as unknown as FakeEl ?? ''));
    out.push(itemName(w, item), ...itemInfo(w, hero, item));
  }
  out.push(JSON.stringify(auraOf(hero)), JSON.stringify(nowLight(hero)), JSON.stringify(chipCounts(w, hero, () => false)));
  out.push(JSON.stringify(items.map((i) => (['all', 'fresh', 'unknown', 'weapon', 'armor', 'potion', 'scroll', 'ring', 'wand'] as const).map((c) => chipOf(c, w, i, () => false)))));
  return out.join('\n');
}

describe('part 11 shows nothing of a hidden weapon or armour level or curse', () => {
  it('draws the slot, its marks, the card, the strength and the aura the same for a +0 and a +4 of hidden level', () => {
    const drawn = [0, 4, -2].map((level) => {
      const { world: w, hero } = world();
      hero.weapon = hidden('weapon.sword', level, { cursed: level < 0, familiarity: 5 });
      hero.armor = hidden('armor.mail', level, { cursed: level < 0, familiarity: 3 });
      hero.items = [hidden('weapon.battleAxe', level), hidden('armor.plate', level, { cursed: level < 0 }), hidden('weapon.mace', level)];
      return drawGear(w, hero);
    });
    expect(drawn[1]).toBe(drawn[0]);
    expect(drawn[2]).toBe(drawn[0]);
    // …and the drawing does change when the level is known.
    const known = world();
    known.hero.weapon = { ...createItem('weapon.sword'), level: 4 };
    known.hero.armor = { ...createItem('armor.mail'), level: 4 };
    known.hero.items = [{ ...createItem('weapon.battleAxe'), level: 4 }, { ...createItem('armor.plate'), level: 4 }, { ...createItem('weapon.mace'), level: 4 }];
    expect(drawGear(known.world, known.hero)).not.toBe(drawn[0]);
  });

  it('keeps the passport, «with what you wear» and the end card the same', () => {
    const drawn = [0, 5].map((level) => {
      const { world: w, hero } = world();
      hero.weapon = hidden('weapon.longsword', level);
      hero.armor = hidden('armor.plate', level);
      hero.rings = [hidden('ring.accuracy', level + 2), hidden('ring.evasion', level)];
      const base = { world: w, hero, start: { ht: 20, str: 11 }, turn: 100, portrait: { tag: 'p' } as never, slotOf: (i: Item) => slot(w, i, { hero }), itemName: (i: Item) => itemName(w, i) };
      const nodes = passportNode(base as never) as unknown as FakeEl;
      const end = growthCard({ world: w, hero, mem: emptyMem(), start: { ht: 20, str: 11 }, slotOf: base.slotOf, nameOf: base.itemName });
      return `${say(nodes)}\n${say(end as unknown as FakeEl)}\n${JSON.stringify(passport(hero, { ht: 20, str: 11 }))}`;
    });
    expect(drawn[1]).toBe(drawn[0]);
  });

  it('keeps the numbers of how it works the same for a hidden ring of mending, detection or haggler, and for hidden armour', () => {
    const cards = (ring: ItemKind | null, level: number): string => {
      const { world: w, hero } = world();
      hero.hp = 3;
      hero.armor = hidden('armor.mail', level);
      hero.rings = ring ? [hidden(ring, level + 3)] : [];
      const text = (['rest', 'search', 'shop', 'traps', 'strength'] as const)
        .map((id) => {
          const c = mechCard(id, w, hero);
          return JSON.stringify([c.state, c.rule, ring ? c.tip.length > 0 : true, c.blocks.map((b) => say(b as unknown as FakeEl))]);
        })
        .join('|');
      const raw = JSON.stringify([restInfo(w, hero), searchInfo(w, hero), shopInfo(w, hero), trapInfo(w, hero)]);
      return `${text}\n${raw}`;
    };
    const bare = cards(null, 0);
    // (A ring worn but unknown is a ring: only the flag that one is left out may differ, and it does not tell which.)
    for (const kind of ['ring.mending', 'ring.detection', 'ring.haggler'] as const) {
      const withRing = cards(kind, 0);
      expect(withRing.replace(/"hiddenRing":true/g, '"hiddenRing":false')).toBe(bare);
      expect(cards(kind, 0)).toBe(cards(kind, 5));
    }
    expect(cards(null, 3)).toBe(bare);                                  // armour of hidden level counts as a plain one
  });
});

describe('part 11 shows nothing of the kind under a look', () => {
  /** Two worlds in which the unknown potions and scrolls look alike but are different kinds: the labels of two kinds are swapped. */
  function swapped(): [World, World] {
    const a = world(33).world;
    const b = world(33).world;
    const [k1, k2] = ['potion.healing', 'potion.toxicGas'] as const;
    b.run.labels = { ...a.run.labels, [k1]: a.run.labels[k2]!, [k2]: a.run.labels[k1]! };
    return [a, b];
  }

  it('names, draws and files a potion by its look alone', () => {
    const [a, b] = swapped();
    const drawn = [a, b].map((w, i) => {
      const hero = heroById(w, 'p')!;
      // In A the potion is a healing one under its look; in B, the look is the same but the kind is the other (labels swapped).
      const item = createItem(i === 0 ? 'potion.healing' : 'potion.toxicGas');
      if (i === 1) w.run.labels = { ...w.run.labels };
      // The look on show is the same colour in both: A's label of healing is B's label of toxic gas.
      hero.items = [item];
      return { item, hero, w };
    });
    expect(lookKey(drawn[0]!.w, 'potion.healing')).toBe(lookKey(drawn[1]!.w, 'potion.toxicGas'));
    const text = (x: (typeof drawn)[number]): string => {
      const { item, hero, w } = x;
      return [asText(slot(w, item, { hero }) as unknown as FakeEl), itemName(w, item), ...itemInfo(w, hero, item), JSON.stringify(slotMarks(w, hero, item, { fresh: true }))].join('\n');
    };
    expect(text(drawn[1]!)).toBe(text(drawn[0]!));
  });

  it('puts a look met in the collection the same, wherever its kind stands in the game\'s list', () => {
    const [a, b] = swapped();
    const memFor = (w: World, kind: ItemKind): ReturnType<typeof emptyMem> => {
      const mem = emptyMem();
      mem.looks.push(lookKey(w, kind)!);
      return mem;
    };
    const view = (w: World, mem: ReturnType<typeof emptyMem>): string => {
      const model = shelfModel(w, mem, 'potion');
      const html = collectionView({ world: w, category: 'potion', onCategory: () => undefined, onKind: () => undefined, });
      return `${JSON.stringify(model)}\n${say(html as unknown as FakeEl)}`;
    };
    // (collectionView reads the live memory of the run: bind it by the same module the screens use.)
    return import('../src/growmem').then(({ grow }) => {
      grow.bind('leak:a', true);
      Object.assign(grow.data, memFor(a, 'potion.healing'));
      const seenA = view(a, grow.data);
      grow.bind('leak:b', true);
      Object.assign(grow.data, memFor(b, 'potion.toxicGas'));
      const seenB = view(b, grow.data);
      expect(seenB).toBe(seenA);
      expect(JSON.parse(seenA.split('\n')[0]!).met).toHaveLength(1);
      expect(seenA).not.toMatch(/healing|toxic/i);
      // The same look, once the kind is identified, moves to the known shelf under its name.
      a.known.push('potion.healing');
      const known = shelfModel(a, memFor(a, 'potion.healing'), 'potion');
      expect(known.known.map((k) => k.kind)).toContain('potion.healing');
      expect(known.met).toHaveLength(0);
    });
  });

  it('writes the chronicle of a ring upgraded or a thing learned by what is known now', () => {
    const { world: w } = world();
    const mem = emptyMem();
    mem.chronicle.push({ kind: 'firstUpgrade', depth: 2, turn: 10, value: 'ring.mending' }, { kind: 'learned', depth: 3, turn: 20, value: 'potion.healing' });
    const before = say(chronicleView(w, mem, 'x') as unknown as FakeEl);
    expect(before).not.toMatch(/Mending|Healing/i);
    w.known.push('ring.mending', 'potion.healing');
    expect(say(chronicleView(w, mem, 'x') as unknown as FakeEl)).toMatch(/mending/i);
  });
});

describe('part 11: the other small pieces', () => {
  it('draws the segments of knowing as a count and nothing else', () => {
    expect(say(segsBar(7, 20) as unknown as FakeEl)).toBe(say(segsBar(7, 20) as unknown as FakeEl));
    const bar = segsBar(7, 20) as unknown as FakeEl;
    expect(bar.children.filter((c) => typeof c !== 'string' && (c as FakeEl).className === 'full')).toHaveLength(3);
  });

  it('armour class is still the plain figure while the level is hidden', () => {
    const { world: w, hero } = world();
    hero.armor = hidden('armor.mail', 3);
    const plain = armorStats({ ...hero.armor, level: 0, glyph: undefined }).dr;
    const card = say(passportNode({ world: w, hero, start: { ht: 20, str: 11 }, turn: 1, portrait: { tag: 'p' } as never, slotOf: () => ({ tag: 's' }) as never, itemName: () => 'armour' }) as unknown as FakeEl);
    expect(card).toContain(`armour ${plain}?`);
  });
});
