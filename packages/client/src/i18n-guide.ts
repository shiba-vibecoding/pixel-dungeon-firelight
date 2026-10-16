/*
 * The newcomer's guide (the journal's «Guide» tab), written for PD 1.9's own rules as this build's core plays them.
 * Every number stated here is checked against the core by test/guide.test.ts, so a rule changed there fails
 * that test until the text agrees. i18n-guide.ru.ts has the Russian; each language is a chunk of its own.
 */

export interface GuideEntry {
  id: string;
  title: string;
  text: string;
}

export const GUIDE_EN = {
  tab: 'Guide',
  intro: 'What newcomers ask most, checked against the game’s rules.',
  count: (total: number, read: number) => `${total} tips · read ${read}`,
  trapColourTitle: 'Trap colours',
  trapColourText: 'Every trap is a plate with a grid of studs; only the colour of the studs tells the kind. Tap a trap to read exactly what it does.',
  trapColourNote: 'A trap that has gone off turns black and is harmless. A trap you know is walked around; a step onto it is asked about first.',
  /** In the order of Trap.RED ... Trap.BLACK, one row per colour the traps of PD 1.9 are drawn in; the names are the traps’ own (i18n-safety.ts). */
  trapColours: [
    ['red', 'alarm trap: calls every monster on the level'],
    ['orange', 'fire trap: flames, and the grass around burns'],
    ['yellow', 'paralytic gas trap: a cloud that freezes you in place'],
    ['green', 'toxic gas trap: a cloud of poison'],
    ['teal', 'lightning trap: a bolt for a third to two thirds of your health'],
    ['violet', 'poison trap: poison for several turns'],
    ['white', 'summoning trap: one to three monsters appear'],
    ['grey', 'gripping trap: a wound that grows with depth'],
    ['black', 'already gone off: safe'],
  ] as readonly (readonly [string, string])[],
  entries: [
    {
      id: 'hunger',
      title: 'Hunger',
      text: 'Hunger rises by one every turn (for a rogue, every 1.2 turns). At 260 you are hungry; at 360 you are starving: you stop healing and lose health now and then. A ration of food takes away 260, a pasty 360; mystery meat, chargrilled meat, frozen carpaccio and the overpriced food ration 100 each. Everyone starts with a ration, and every floor but the boss floors holds one more ration or pasty. A Ring of Satiety slows hunger.',
    },
    {
      id: 'ankh',
      title: 'The ankh',
      text: 'Carry an ankh and death is not the end: you rise at once at the level’s entrance (on a boss floor, where you fell), fully healed and free of every ailment. You keep what you wear and wield, plus keys and quest items; the rest of the pack, all your gold, your progress to the next level and the ankh itself are lost. Hold just one: resurrecting takes all you carry. Shops sell it for 500 gold on depth 6, 750 on 11 and 1000 on 16.',
    },
    {
      id: 'curses',
      title: 'Curses',
      text: 'About one weapon or armour in five found lying about is cursed (worse than plain, with a negative level), and about three rings in ten; what you pull from a fallen hero’s remains always is. You cannot tell by looking: a cursed thing binds itself to you the moment you put it on, and cannot be taken off. A Scroll of Identify or the Well of Awareness shows a curse beforehand. Wands, potions and scrolls are never cursed.',
    },
    {
      id: 'uncurse',
      title: 'Lifting a curse',
      text: 'A Scroll of Remove Curse lifts every curse from what you wear and carry, and cures weakness; shops sell it. A Scroll of Upgrade or of Enchantment lifts the curse of the one item you read it on, and the upgrade adds a level as well. The item stays as weak as it was, but it can come off. Under the “Forbidden runes” challenge only the Scroll of Upgrade is left.',
    },
    {
      id: 'haggler',
      title: 'Shops and the Ring of Haggler',
      text: 'Shops (depths 6, 11, 16, and 21 once the imp is content) pay you an item’s full value but ask five times the value times (depth ÷ 5, rounded down, plus 1): ×10 on depth 6, ×15 on 11, ×20 on 16, ×25 on 21. Each stocks a Potion of Healing, a Scroll of Remove Curse, of Identify and of Magic Mapping, an ankh and two overpriced food rations. A Ring of Haggler halves every price while you wear it; a crazy thief carries one about once in a hundred.',
    },
    {
      id: 'mimics',
      title: 'Mimics',
      text: 'From depth 2, a chest in an ordinary room is a mimic about one time in five, and one of the Rat King’s chests always is. Nothing tells them apart: open it and it springs at you, with (3 + depth) × 4 health, so 32 on depth 5. One of its bites in three knocks a tenth to a half of your gold onto the floor. Kill it and its treasure drops. Open chests at full health, with room to retreat.',
    },
    {
      id: 'well',
      title: 'Magic wells',
      text: 'Each well works once, then runs dry. Step into the Well of Health: full health, poison, fire, ooze, weakness and crippling gone, hunger gone. The Well of Awareness opens the whole map with its hidden doors and traps, identifies what you wear and shows which of the things you carry are cursed; an unidentified item dropped into it is identified instead. The Well of Transmutation does nothing to you: drop an item in and it turns into another of its kind, keeping its level (a Scroll of Upgrade into one of Enchantment, Strength into Might, a weapon into its twin of the same tier).',
    },
    {
      id: 'seeds',
      title: 'Seeds and herbs',
      text: 'Tall grass you walk through flattens and now and then drops a seed (one cell in 18) or a dewdrop (one in 6). A thrown seed takes root where it lands, and its plant works once, when something steps on it: Firebloom bursts into flame, Icecap freezes everyone beside it for 5 turns, Sorrowmoss poisons, Dreamweed lets out a confusion cloud, Fadeleaf teleports whoever steps on it, Rotberry bursts into toxic gas and roots you for 3 turns. Stand on Sungrass and it heals a tenth of your health every 5 turns; stand on Earthroot and it soaks up damage, up to your full health; both only while you do not move.',
    },
    {
      id: 'score',
      title: 'The score',
      text: 'Your score is the gold you collected, spent or not, plus your level × the deepest depth you reached × 100; gold from selling items does not count. A win doubles it: take the Amulet of Yendor from depth 26, then end the run or carry it out of the dungeon. Each challenge on adds a quarter on top: ×1.25 for one, up to ×2.75 for all seven. Only runs the server has checked reach the boards.',
    },
    {
      id: 'challenges',
      title: 'Challenges',
      text: 'Seven challenges open after your first victory (the daily dungeon turns one on from the start), and you pick them before a new game. On diet: no food, gold in its place. Faith is my armor: no armour. Pharmacophobia: no Potions of Healing. Barren land: grass drops no seeds or dew, and there is no seed pouch. Swarm intelligence: a monster that spots you calls all the others. Into darkness: you see 3 cells instead of 8. Forbidden runes: only Scrolls of Upgrade remain. Each adds a quarter to the score.',
    },
    {
      id: 'vial',
      title: 'The dew vial',
      text: 'The dew vial lies somewhere on depths 1 to 3. Unhurt, you store each dewdrop in it, up to 10; hurt, a drop heals you at once: 1 point on depths 1 to 5, 2 on 6 to 10 and so on, one more for the huntress. Drinking empties the vial and heals the share of your health that the drops are worth: ten drops all of it, five about 40%. A full vial is drunk by itself at the moment you would die. Dropped into a Well of Health, it fills up.',
    },
    {
      id: 'alchemy',
      title: 'The alchemy pot',
      text: 'Laboratories hold an alchemy pot. Drop or throw three or more seeds onto it, and nothing else, and they brew a potion. With N seeds there is a 1 in N chance of a random potion; otherwise it is the potion of one of the seeds, picked by their numbers. Firebloom brews Liquid Flame, Icecap Frost, Sorrowmoss Toxic Gas, Dreamweed Invisibility, Sungrass Healing, Earthroot Paralytic Gas, Fadeleaf Mind Vision, Rotberry Strength.',
    },
    {
      id: 'search',
      title: 'Hidden doors and traps',
      text: 'If a level looks like a dead end, search: tap your hero or the magnifier. A search takes 2 turns and finds every hidden door and trap in sight within 2 cells. Walking past, you also notice hidden things right next to you by chance, more often at higher levels. A Ring of Detection widens the search by its level; a cursed one narrows it.',
    },
  ] as readonly GuideEntry[],
};
