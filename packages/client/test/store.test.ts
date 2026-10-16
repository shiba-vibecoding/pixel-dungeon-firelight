import { describe, expect, it } from 'vitest';
import { cleanEquipped, DECOR_MAX, itemById, slotOf, validateCatalog } from '../src/catalog';
import { QUIP_PACKS, packLines } from '../src/quip-packs';
import { QUIP_CLASSES, type QuipData, QuipPicker } from '../src/quips';
import { enQuips } from '../src/quips-en';

describe('equip state', () => {
  it('keeps only known items in their own slots, and at most the decorations the camp holds', () => {
    const decor = ['decor.lantern', 'decor.banner', 'decor.skull', 'decor.flowers', 'decor.tent', 'decor.lantern', 'hat.cap', 'nonsense'];
    const cleaned = cleanEquipped({
      slots: { hat: 'hat.cap', trail: 'hat.cap', 'look.mage': 'look.mage.ember', 'look.warrior': 'look.mage.ember', pet: 'nonsense', bogus: 'hat.cap' },
      decor,
    });
    expect(cleaned.slots).toEqual({ hat: 'hat.cap', 'look.mage': 'look.mage.ember' });
    expect(cleaned.decor).toEqual(['decor.lantern', 'decor.banner', 'decor.skull', 'decor.flowers'].slice(0, DECOR_MAX));
    expect(cleanEquipped(null)).toEqual({ slots: {}, decor: [] });
    expect(cleanEquipped('x')).toEqual({ slots: {}, decor: [] });
  });

  it('knows where each worn thing goes', () => {
    expect(slotOf(itemById('look.huntress.frost')!)).toBe('look.huntress');
    expect(slotOf(itemById('fire.blue')!)).toBe('campfire');
    expect(slotOf(itemById('pframe.ember')!)).toBe('frame');
    expect(slotOf(itemById('decor.tent')!)).toBeNull();
    expect(slotOf(itemById('bundle.starter')!)).toBeNull();
    expect(slotOf(itemById('sticker.star')!)).toBeNull();
  });

  it('every campfire style names its flame and three spark colours, every name colour at least one', () => {
    expect(validateCatalog()).toEqual([]);
    for (const id of ['fire.blue', 'fire.green', 'fire.violet', 'fire.soul', 'fire.void', 'fire.pass_season']) expect(itemById(id)!.tones, id).toHaveLength(4);
    for (const id of ['namecolor.crimson', 'namecolor.gold', 'namecolor.aurora', 'namecolor.champion']) expect(itemById(id)!.tones!.length, id).toBeGreaterThan(0);
  });
});

describe('quip packs', () => {
  it('the two placeholder packs have lines for kills, descending and the last words, in both languages', () => {
    expect(Object.keys(QUIP_PACKS).sort()).toEqual(['quips.noble', 'quips.pirate']);
    for (const id of Object.keys(QUIP_PACKS)) {
      expect(itemById(id)?.category, id).toBe('quips');
      for (const lang of ['ru', 'en'] as const) {
        for (const moment of ['kill', 'descend', 'death'] as const) expect(packLines(id, lang, moment, 'mage')!.length, `${id} ${lang} ${moment}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('say nothing without a pack or for a moment the pack has no lines for', () => {
    expect(packLines(null, 'en', 'kill', 'mage')).toBeNull();
    expect(packLines('quips.nonsense', 'en', 'kill', 'mage')).toBeNull();
    expect(packLines('quips.pirate', 'en', 'trapFire', 'mage')).toBeNull();
  });

  it('are said in place of the ordinary lines when worn, and the ordinary ones are back when not', () => {
    const plain = (line: string): QuipData['foul'] => ({
      kill: Object.fromEntries(QUIP_CLASSES.map((c) => [c, [line]])) as unknown as QuipData['foul']['kill'],
      shared: { ...enQuips.foul.shared },
      own: {},
    });
    const data: QuipData = { foul: plain('ordinary'), clean: plain('ordinary') };
    let worn: string | null = 'quips.pirate';
    const picker = new QuipPicker(data, () => 'clean', () => 0, (moment, heroClass) => packLines(worn, 'en', moment, heroClass));
    const first = picker.offer('kill', 'mage', 100_000);
    expect(first).not.toBeNull();
    expect(first).not.toBe('ordinary');
    expect(QUIP_PACKS['quips.pirate']!.en.any.kill).toContain(first);
    worn = null;
    expect(picker.offer('kill', 'mage', 200_000)).toBe('ordinary');
  });
});
