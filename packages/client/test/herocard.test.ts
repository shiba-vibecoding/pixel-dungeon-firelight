import { describe, expect, it } from 'vitest';
import { cardKey, DEFAULT_TIER, Lru, lookOfEntry, tierOf } from '../src/cardlook';

describe('the hero card (cardlook.ts)', () => {
  it('takes the hero of a board entry from the server\'s snapshot, and the plain class from an entry without one', () => {
    expect(lookOfEntry({ heroClass: 'mage', w: { l: 'skin.mage.ember', h: 'hat.crown', p: 'pet.bat', f: 'fire.golden', fr: 'frame.ember', tt: 'title.kindler', nc: 'name.gold' } })).toEqual({
      heroClass: 'mage', l: 'skin.mage.ember', h: 'hat.crown', p: 'pet.bat', f: 'fire.golden', fr: 'frame.ember',
    });
    expect(lookOfEntry({ heroClass: 'rogue' })).toEqual({ heroClass: 'rogue' });
    expect(lookOfEntry({ heroClass: 'rogue', w: {} })).toEqual({ heroClass: 'rogue' });
  });

  it('keeps a composed card under class|look|hat|pet|fire, the same for the same combination whatever the frame', () => {
    const a = { heroClass: 'mage', l: 'skin.mage.ember', h: 'hat.crown', fr: 'frame.ember' };
    const b = { heroClass: 'mage', l: 'skin.mage.ember', h: 'hat.crown', fr: 'frame.stars' };
    expect(cardKey(a)).toBe('mage|1|skin.mage.ember|hat.crown|||');
    expect(cardKey(a)).toBe(cardKey(b));
    expect(cardKey({ heroClass: 'mage' })).not.toBe(cardKey({ heroClass: 'warrior' }));
    expect(cardKey({ heroClass: 'mage', p: 'pet.bat' })).not.toBe(cardKey({ heroClass: 'mage', f: 'pet.bat' }));
  });

  it('draws the armour worn at the end of the run: its tier from the snapshot, cloth when there is none, and the tier is part of the key', () => {
    expect(lookOfEntry({ heroClass: 'mage', w: { a: 5, h: 'hat.crown' } })).toEqual({ heroClass: 'mage', a: 5, h: 'hat.crown' });
    expect(tierOf(lookOfEntry({ heroClass: 'mage', w: { a: 5 } }))).toBe(5);
    expect(tierOf(lookOfEntry({ heroClass: 'mage', w: { a: 0 } }))).toBe(0);
    // An entry from before the tier was kept, or a tier the sheet has no row for: cloth.
    expect(tierOf(lookOfEntry({ heroClass: 'mage' }))).toBe(DEFAULT_TIER);
    expect(tierOf(lookOfEntry({ heroClass: 'mage', w: {} }))).toBe(DEFAULT_TIER);
    expect(tierOf({ heroClass: 'mage', a: 9 })).toBe(DEFAULT_TIER);
    expect(tierOf({ heroClass: 'mage', a: -1 })).toBe(DEFAULT_TIER);
    expect(tierOf({ heroClass: 'mage', a: 2.5 })).toBe(DEFAULT_TIER);
    expect(cardKey({ heroClass: 'mage', a: 2 })).not.toBe(cardKey({ heroClass: 'mage', a: 4 }));
    expect(cardKey({ heroClass: 'mage' })).toBe(cardKey({ heroClass: 'mage', a: DEFAULT_TIER }));
  });

  it('draws the weapon he held at the end: from the snapshot, part of the key, and nothing for bare hands or a word that is not a kind', () => {
    expect(lookOfEntry({ heroClass: 'rogue', w: { a: 2, wp: 'weapon.dagger' } })).toEqual({ heroClass: 'rogue', a: 2, wp: 'weapon.dagger' });
    expect(lookOfEntry({ heroClass: 'rogue', w: { a: 2 } })).toEqual({ heroClass: 'rogue', a: 2 });
    expect(lookOfEntry({ heroClass: 'rogue', w: { wp: '' } })).toEqual({ heroClass: 'rogue' });
    expect(lookOfEntry({ heroClass: 'rogue', w: { wp: 'x'.repeat(60) } })).toEqual({ heroClass: 'rogue' });
    expect(lookOfEntry({ heroClass: 'rogue', w: { wp: 7 as unknown as string } })).toEqual({ heroClass: 'rogue' });
    expect(cardKey({ heroClass: 'rogue', wp: 'weapon.dagger' })).not.toBe(cardKey({ heroClass: 'rogue', wp: 'weapon.sword' }));
    expect(cardKey({ heroClass: 'rogue', wp: 'weapon.dagger' })).not.toBe(cardKey({ heroClass: 'rogue' }));
    expect(cardKey({ heroClass: 'rogue', wp: 'weapon.dagger' })).toBe('rogue|1|||||weapon.dagger');
  });

  it('forgets the card used least recently, and a card looked at again is spared', () => {
    const cache = new Lru<number>(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBe(1);
    cache.set('d', 4);
    expect(cache.get('b')).toBeUndefined();
    expect([cache.get('a'), cache.get('c'), cache.get('d')]).toEqual([1, 3, 4]);
    expect(cache.count).toBe(3);
    for (let i = 0; i < 100; i++) cache.set(`k${i}`, i);
    expect(cache.count).toBe(3);
    cache.clear();
    expect(cache.count).toBe(0);
  });
});
