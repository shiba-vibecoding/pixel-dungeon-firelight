import { describe, expect, it } from 'vitest';
import { CATALOG, cleanEquipped, DECOR_MAX, itemById, slotOf, validateCatalog } from '../src/catalog';
import { QUIP_PACKS, packLines } from '../src/quip-packs';
import { QUIP_CLASSES, type QuipData, QuipPicker } from '../src/quips';
import { enQuips } from '../src/quips-en';

describe('equip state', () => {
  it('keeps only known items in their own slots, and at most the decorations the camp holds', () => {
    const decor = ['decor.lantern', 'decor.banner', 'decor.statue', 'decor.chest', 'decor.tent', 'decor.lantern', 'hat.straw', 'nonsense'];
    const cleaned = cleanEquipped({
      slots: { hat: 'hat.straw', trail: 'hat.straw', 'look.mage': 'skin.mage.ember', 'look.warrior': 'skin.mage.ember', pet: 'nonsense', bogus: 'hat.straw' },
      decor,
    });
    expect(cleaned.slots).toEqual({ hat: 'hat.straw', 'look.mage': 'skin.mage.ember' });
    expect(cleaned.decor).toEqual(['decor.lantern', 'decor.banner', 'decor.statue', 'decor.chest'].slice(0, DECOR_MAX));
    // An old placeholder's id is read as what it became.
    expect(cleanEquipped({ slots: { 'look.mage': 'look.mage.ember', hat: 'hat.cap' }, decor: ['decor.skull'] })).toEqual({ slots: { 'look.mage': 'skin.mage.ember', hat: 'hat.bandana' }, decor: ['decor.dummy'] });
    expect(cleanEquipped(null)).toEqual({ slots: {}, decor: [] });
    expect(cleanEquipped('x')).toEqual({ slots: {}, decor: [] });
  });

  it('knows where each worn thing goes', () => {
    expect(slotOf(itemById('skin.huntress.frost')!)).toBe('look.huntress');
    expect(slotOf(itemById('fire.blue')!)).toBe('campfire');
    expect(slotOf(itemById('frame.ember')!)).toBe('frame');
    expect(slotOf(itemById('photo.film')!)).toBe('photoframe');
    expect(slotOf(itemById('decor.tent')!)).toBeNull();
    expect(slotOf(itemById('bundle.camp')!)).toBeNull();
    expect(slotOf(itemById('sticker.star')!)).toBeNull();
  });

  it('the catalogue is valid, and every item is the designer’s or a placeholder with tones for its glyph', () => {
    expect(validateCatalog()).toEqual([]);
    for (const entry of CATALOG) if (!entry.earn || entry.reward === undefined) expect(entry.id).toBeTruthy();
    expect(itemById('name.champion')!.tones!.length).toBeGreaterThan(0);
  });
});

describe('quip packs', () => {
  it('the packs have lines for kills, descending and the last words, in both languages', () => {
    expect(Object.keys(QUIP_PACKS).sort()).toEqual(['quips.gopnik', 'quips.granny', 'quips.knight', 'quips.philosopher', 'quips.pirate', 'quips.robot']);
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
