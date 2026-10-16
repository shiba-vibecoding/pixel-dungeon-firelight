import { describe, expect, it } from 'vitest';
import { cardKey, Lru, lookOfEntry } from '../src/cardlook';

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
    expect(cardKey(a)).toBe('mage|skin.mage.ember|hat.crown||');
    expect(cardKey(a)).toBe(cardKey(b));
    expect(cardKey({ heroClass: 'mage' })).not.toBe(cardKey({ heroClass: 'warrior' }));
    expect(cardKey({ heroClass: 'mage', p: 'pet.bat' })).not.toBe(cardKey({ heroClass: 'mage', f: 'pet.bat' }));
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
