import { describe, expect, it, vi } from 'vitest';
import { addHero, createWorld, heroById, T, trapAt } from '@pd/core';
import { SAFETY_EN } from '../src/i18n-safety';
import { SAFETY_RU } from '../src/i18n-safety.ru';

/** The i18n module reads the page's language at load: load it again for each. */
async function strings(lang: 'en' | 'ru') {
  vi.resetModules();
  vi.stubGlobal('location', { search: `?lang=${lang}` });
  const [labels, death] = await Promise.all([import('../src/labels'), import('../src/deathcopy')]);
  vi.unstubAllGlobals();
  return { ...labels, ...death };
}

describe('the safety texts', () => {
  it('name every trap of the game and say what it does, in both languages', () => {
    const traps = Object.entries(T).filter(([name]) => name.endsWith('_TRAP') && !name.startsWith('SECRET') && name !== 'INACTIVE_TRAP');
    expect(traps.length).toBe(8);
    for (const [name, terrain] of traps) {
      const kind = trapAt(terrain)!;
      expect(kind, name).toBeDefined();
      for (const words of [SAFETY_EN, SAFETY_RU]) {
        const [title, effect] = words.trap[kind];
        expect(title.length).toBeGreaterThan(3);
        expect(effect.length).toBeGreaterThan(20);
      }
    }
  });

  it('have a note for each hazard that kills and is no monster, in both languages', () => {
    const hazards = ['poison', 'burning', 'ooze', 'lightning', 'gripping', 'hunger', 'bones', 'gas', 'fall', 'deferred', 'bleeding', 'multiplicity', 'bomb'];
    for (const hazard of hazards) {
      expect(SAFETY_EN.death.notes[hazard], hazard).toBeTruthy();
      expect(SAFETY_RU.death.notes[hazard], hazard).toBeTruthy();
    }
  });
});

describe('how a run counts', () => {
  it('is labelled by what the server knows of it', async () => {
    const { runLabel, labelWords } = await strings('en');
    expect(runLabel({ checked: true, ranked: true })).toBe('counted');
    expect(runLabel({ checked: true, ranked: false })).toBe('repeat');
    expect(runLabel({ checked: false, ranked: true })).toBe('local');
    expect(runLabel({ checked: true, ranked: true, customSeed: true })).toBe('custom');
    expect(labelWords('counted').word).toBe('counts');
    expect(labelWords('local').text).toBe('Not counted');
  });

  it('speaks Russian: «зачёт», «повтор», «без зачёта»', async () => {
    const { labelWords } = await strings('ru');
    expect([labelWords('counted').word, labelWords('repeat').word, labelWords('local').word]).toEqual(['зачёт', 'повтор', 'без зачёта']);
  });
});

describe('the death window', () => {
  it('names a hazard, a monster or a class, and the raw word if it is none', async () => {
    const { causeName, causeNote } = await strings('en');
    expect(causeName('gripping')).toBe('a gripping trap');
    expect(causeName('rat')).toBeTruthy();
    expect(causeName('rat')).not.toBe('rat');
    expect(causeName('warrior')).toBeTruthy();
    expect(causeName('nonsense')).toBe('nonsense');
    expect(causeName(null)).toBe('');
    expect(causeNote('hunger')).toContain('Starvation');
    expect(causeNote('rat')).toBe('');
  });

  it('says what the pack held, and that no ankh stood in the way', async () => {
    const { packLine } = await strings('en');
    const world = createWorld(5);
    addHero(world, { id: 'p', name: 'P', heroClass: 'rogue' });
    const hero = heroById(world, 'p')!;
    hero.gold = 120;
    const line = packLine(hero);
    expect(line).toContain(`${hero.items.length} item`);
    expect(line).toContain('120 gold');
    expect(line).toContain('no ankh');
    hero.items = [];
    hero.gold = 0;
    expect(packLine(hero)).toBe(SAFETY_EN.death.noAnkh);
  });
});
