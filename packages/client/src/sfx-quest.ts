import type { Sfx } from './sfx-synth';

/*
 * The sounds of the quests (presentation only): a pick on rock, the gleam of the ore that comes out of it, the little fanfare of a
 * reward, and the blip a giver's voice makes as the words come out. Made like all of Firelight's sounds (sfx-synth.ts).
 */
export const QUEST_SFX = {
  // A pick on stone: the steel's ring, the crack of the rock, a low knock, and gravel pattering down after it.
  pick: {
    level: 0.85,
    voices: [
      { wave: 'noise', filter: { type: 'bp', hz: 2600, to: 900, q: 1.4 }, decay: 0.05, shape: 3 },
      { wave: 'square', freq: 1500, slide: -18, decay: 0.035, crush: 5, gain: 0.35 },
      { wave: 'sine', freq: 95, slide: -10, decay: 0.16, shape: 2.5, gain: 0.9 },
      { wave: 'noise', filter: { type: 'lp', hz: 1800, to: 500 }, delay: 0.03, decay: 0.14, gain: 0.55 },
      { wave: 'noise', filter: { type: 'bp', hz: 1800, q: 1 }, delay: 0.09, decay: 0.025, scatter: [7, 0.32], gain: 0.4 },
    ],
  },
  // Ore working loose: two bright chimes and a glint above them.
  oreGleam: {
    level: 0.55,
    voices: [
      { wave: 'sine', freq: 1568, attack: 0.003, decay: 0.2, gain: 0.6 },
      { wave: 'sine', freq: 2349.3, delay: 0.07, attack: 0.003, decay: 0.38, gain: 0.55 },
      { wave: 'triangle', freq: 3136, delay: 0.07, attack: 0.003, decay: 0.3, gain: 0.2 },
      { wave: 'sine', freq: 4698.6, delay: 0.12, decay: 0.25, gain: 0.1 },
    ],
  },
  // A reward: four notes climbing, a held chord under them, a glitter after.
  questFanfare: {
    level: 0.7,
    voices: [
      { wave: 'square', duty: 0.5, freq: 523.3, attack: 0.003, decay: 0.12, gain: 0.4 },
      { wave: 'square', duty: 0.5, freq: 659.3, delay: 0.1, attack: 0.003, decay: 0.12, gain: 0.4 },
      { wave: 'square', duty: 0.5, freq: 784, delay: 0.2, attack: 0.003, decay: 0.12, gain: 0.4 },
      { wave: 'square', duty: 0.5, freq: 1046.5, delay: 0.3, attack: 0.003, hold: 0.12, decay: 0.45, gain: 0.45 },
      { wave: 'triangle', freq: 523.3, delay: 0.3, attack: 0.01, hold: 0.12, decay: 0.55, gain: 0.35 },
      { wave: 'triangle', freq: 784, delay: 0.3, attack: 0.01, hold: 0.12, decay: 0.55, gain: 0.3 },
      { wave: 'sine', freq: 2093, delay: 0.34, decay: 0.4, gain: 0.18 },
      { wave: 'sine', freq: 3136, delay: 0.42, decay: 0.45, gain: 0.12 },
    ],
  },
  // A giver's voice, one letter's worth: its pitch is set by the playing rate, a different one for each of them.
  talkBlip: {
    level: 0.3,
    voices: [
      { wave: 'square', duty: 0.25, freq: 330, slide: 4, attack: 0.002, decay: 0.045, crush: 6 },
      { wave: 'triangle', freq: 660, delay: 0.005, attack: 0.002, decay: 0.035, gain: 0.4 },
    ],
  },
} as const satisfies Record<string, Sfx>;
