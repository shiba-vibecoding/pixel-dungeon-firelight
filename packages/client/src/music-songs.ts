/*
 * Firelight's music, as data: the camp's tune, a tune for each region of the dungeon, and two stingers.
 *
 * A song is a list of sections (an A, its variation, a B, a bridge...), each a few bars of sixteen steps: the chords,
 * a melody for the lead, an accompaniment for the second voice (a line of its own, a broken chord or rhythmic chord
 * stabs), the bass (a line, or a figure drawn from the chords) and a drum pattern. It loops, past its intro if it has
 * one. The player (music.ts) turns this into notes and plays them on a small chip of the kind the original's tunes
 * imitate: two pulse voices, a stepped triangle for the bass and a noise channel for the drums.
 *
 * Each region's tune has three layers that play in step and crossfade by the situation: «calm» while exploring, «danger»
 * with enemies in view, «boss» in a boss fight. What a section writes out is the danger layer; the calm layer is drawn
 * from the same chords and melody (a warm pad, a flute on the tune, a plucked broken chord, a root note in the bass,
 * no drums) unless the section writes its own; the boss layer is the same tune doubled an octave up over
 * sixteenth-note arpeggios, a pumping bass and eighth-note drums.
 */

export type Layer = 'calm' | 'danger' | 'boss';

export const LAYERS: readonly Layer[] = ['calm', 'danger', 'boss'];

/** The tunes played as music (the camp's, and one a region); the stingers are played once, over it. */
export type SongName = 'camp' | 'sewers' | 'prison' | 'caves' | 'city' | 'halls';
export type StingerName = 'victory' | 'death';

export const SONGS: readonly SongName[] = ['camp', 'sewers', 'prison', 'caves', 'city', 'halls'];
export const STINGERS: readonly StingerName[] = ['victory', 'death'];

/** A pulse's duty, in percent: 50 is round and hollow, 25 brighter, 12.5 thin and nasal. */
export type Duty = 12 | 25 | 50;

/**
 * Drums, one character a step: k kick, s snare, g ghost snare, h closed hat, o open hat,
 * t tom, c crash, `.` nothing.
 */
export type Drum = 'k' | 's' | 'g' | 'h' | 'o' | 't' | 'c';

/** A broken chord: chord tones by index (0 the root, 1 the next tone up...; `.` a rest), `len` steps each. */
export interface Arp {
  arp: string;
  len: number;
  octave?: number;
}

/** Chord stabs: `x` strikes the chord (a fast arpeggio, as the chip played chords), `-` holds it, `.` rests. */
export interface Stab {
  stab: string;
  octave?: number;
}

/**
 * A bass figure, drawn from the chord at each note: R the root (or the slash note), 3, 5, 7
 * the chord's tones above it, O the octave; a trailing `-` takes it an octave down. It repeats
 * through the section.
 */
export interface Figure {
  figure: string;
}

/** The calm layer of a section, where it is not the plain one drawn from the section's chords and melody. */
export interface Calm {
  /** The flute's tune (default: the section's lead); false for none. */
  lead?: string | false;
  /** Octaves the flute is moved by. */
  octave?: number;
  /** The held chord under everything (default: on). */
  pad?: boolean;
  /** The plucked broken chord (default: `0212` in quarter notes); false for none. */
  pluck?: Arp | false;
  /** The bass (default: the root, held); false for none. */
  bass?: string | Figure | false;
  /** A very soft drum, if any. */
  drums?: string;
}

export interface Section {
  /** Bars of four beats, sixteen steps each. */
  bars: number;
  /** The harmony: chord symbols and their lengths in steps ("Dm:16 Bb:8"), repeated to fill the section. */
  chords: string;
  /**
   * The melody: notes as `pitch:steps` ("d5:4"; `r` rests), `!` after a note accents it and
   * `'` makes it short. `|` marks a bar line (and checks that one falls there).
   */
  lead?: string;
  duty?: Duty;
  /** Octaves the lead is moved by: the same tune lower is a variation. */
  leadOctave?: number;
  harm?: string | Arp | Stab;
  harmDuty?: Duty;
  bass?: string | Figure;
  drums?: string;
  calm?: Calm;
}

/** The boss layer's accompaniment, where a song wants other than the usual. */
export interface BossStyle {
  harm?: Arp | Stab;
  bass?: Figure;
  drums?: string;
}

export interface Song {
  bpm: number;
  sections: readonly Section[];
  /** The section the song comes back to when it loops (past an intro). */
  loop?: number;
  /** The layers it has (default: all three). */
  layers?: readonly Layer[];
  /** Played once and let go (a stinger). */
  once?: boolean;
  /** Each voice's level. */
  levels: { lead: number; harm: number; bass: number; drums: number; pad?: number; flute?: number; pluck?: number };
  /** The echo: its delay in steps, how much of it comes back, how much is heard. */
  echo: { steps: number; feedback: number; wet: number };
  /** The brightest the music gets, Hz: darker regions are darker. */
  tone: number;
  /** How much of the room's reverb is heard, 0..1 (default 0.15). */
  reverb?: number;
  boss?: BossStyle;
}

/* The songs. */

export const BAR = 16;

/** The boss layer: sixteenth-note arpeggios, octave bass in eighths, the drums on every beat. */
export const BOSS_DEFAULT: Required<BossStyle> = {
  harm: { arp: '01231210', len: 1 },
  bass: { figure: 'R:2 O:2' },
  drums: 'k.h.s.hkk.h.s.h. | k.h.s.hkk.h.s.hs',
};

/*
 * The prison: a march in D minor, tense and dogged, the snare drilling and the bass in dotted
 * steps. A and its variation, a lift into the relative major that never quite settles, a
 * bridge over the Neapolitan (E flat) that winds the tension up again, and A once more.
 */
const PRISON_A6 =
  'd5:4 a4:2 d5:2 f5:4 e5:2 d5:2 | c#5:4 d5:2 e5:2 a4:8 | f5:4 d5:2 f5:2 bb5:4 a5:2 g5:2 | ' +
  'a5:6 g5:2 f5:2 e5:2 c#5:4 | d5:4 a4:2 d5:2 f5:4 a5:4 | bb5:4 a5:2 g5:2 d5:4 g5:2 f5:2 |';
const PRISON_CHORDS = 'Dm:16 Dm:16 Bb:16 A:16 Dm:16 Gm:16 A:16 Dm:16';
const PRISON_MARCH: Figure = { figure: "R:3 R:1' 5-:4 R:3 R:1' 5-:4" };
const PRISON_DRUMS = 'k...s..gk.k.s... | k...s..gk.k.s.gs';

const PRISON: Song = {
  bpm: 108,
  loop: 1,
  levels: { lead: 0.15, harm: 0.07, bass: 0.27, drums: 0.24 },
  echo: { steps: 3, feedback: 0.25, wet: 0.18 },
  tone: 4200,
  sections: [
    // The guards' drums, before anyone sings.
    { bars: 2, chords: 'Dm:32', harm: { stab: '..x-..x-..x-..x-' }, harmDuty: 12, bass: PRISON_MARCH, drums: PRISON_DRUMS },
    {
      bars: 8,
      chords: PRISON_CHORDS,
      lead: PRISON_A6 + ' e5:4 f5:2 g5:2 e5:2 c#5:2 a4:4 | d5:8 r:4 a4:2 c#5:2',
      duty: 25,
      harm: { stab: '..x-..x-..x-..x-' },
      harmDuty: 12,
      bass: PRISON_MARCH,
      drums: PRISON_DRUMS,
    },
    {
      // The same, rounder, under a running broken chord, and a darker close (B flat over A).
      bars: 8,
      chords: PRISON_CHORDS,
      lead: PRISON_A6 + ' e5:2 f5:2 g5:2 a5:2 bb5:4 a5:4 | d5:12 r:4',
      duty: 50,
      harm: { arp: '0121', len: 2 },
      harmDuty: 12,
      bass: PRISON_MARCH,
      drums: PRISON_DRUMS,
    },
    {
      // Through the relative major, in half time, always pulled back to A.
      bars: 8,
      chords: 'Bb:16 C:16 F:16 A:16 Bb:16 C:16 Dm:16 A:16',
      lead:
        'd5:6 c5:2 bb4:4 d5:4 | e5:6 d5:2 c5:4 g4:4 | a4:4 c5:4 f5:6 e5:2 | e5:6 c#5:2 a4:8 | ' +
        'f5:6 e5:2 d5:4 f5:4 | g5:6 f5:2 e5:4 c5:4 | a5:4 g5:2 f5:2 e5:2 d5:2 f5:4 | e5:4 c#5:4 a4:4 c#5:2 e5:2',
      duty: 25,
      harm: { arp: '01232123', len: 2 },
      harmDuty: 12,
      bass: { figure: 'R:4 5-:4 O:4 5-:4' },
      drums: 'k.......s....... | k.....k.s.....g.',
    },
    {
      // The bridge: the drums fall to a heartbeat, then roll back in.
      bars: 4,
      chords: 'Gm:16 Eb:16 A:16 A7:16',
      lead: 'g4:8 bb4:4 d5:4 | eb5:8 d5:4 bb4:4 | c#5:8 e5:4 g5:4 | a5:8 g5:2 f5:2 e5:2 c#5:2',
      duty: 50,
      harm: { stab: 'x---------------' },
      harmDuty: 25,
      bass: { figure: 'R:12 5-:4' },
      drums: 'k.......k....... | k.......k....... | k.......k....... | k...s...s.s.ssss',
    },
    {
      bars: 8,
      chords: PRISON_CHORDS,
      lead: PRISON_A6 + ' e5:4 f5:2 g5:2 e5:2 c#5:2 a4:4 | d5:8 r:4 a4:2 c#5:2',
      duty: 50,
      harm: { arp: '01232121', len: 1 },
      harmDuty: 12,
      bass: PRISON_MARCH,
      drums: 'k.g.s..gk.k.s.g. | k.g.s..gk.k.s.gs',
    },
  ],
};

/*
 * The caves: slow and sparse, in A dorian (its raised sixth, the F sharp over D, is the colour),
 * turning phrygian (B flat against A) in the middle. A thin broken chord drips through a long
 * echo; the drums are a far-off thump. A, B, A an octave down, and a bridge of single calls.
 */
const CAVES_CHORDS = 'Am:16 D:16 Am:16 D:16 C:16 G:16 Am:16 Em:16';
const CAVES_A =
  'r:4 e5:4 a5:6 g5:2 | f#5:8 e5:4 d5:4 | e5:12 r:4 | r:4 a4:2 b4:2 c5:4 d5:4 | ' +
  'e5:8 g5:4 e5:4 | d5:8 b4:4 g4:4 | a4:6 b4:2 c5:4 e5:4 | b4:12 r:4';

const CAVES: Song = {
  bpm: 80,
  levels: { lead: 0.14, harm: 0.06, bass: 0.28, drums: 0.2 },
  echo: { steps: 3, feedback: 0.42, wet: 0.32 },
  tone: 3600,
  boss: { harm: { arp: '0123', len: 1 }, bass: { figure: 'R:1 R:1 O:1 R:1' } },
  sections: [
    {
      bars: 8,
      chords: CAVES_CHORDS,
      lead: CAVES_A,
      duty: 25,
      harm: { arp: '02324232', len: 2 },
      harmDuty: 12,
      bass: { figure: 'R:12 5-:4' },
      drums: 'k............... | ........t....... | k............... | ......h.t...h...',
    },
    {
      bars: 8,
      chords: 'Am:16 Bb:16 Am:16 Bb:16 F:16 G:16 Am:16 Am:16',
      lead:
        'a5:8 g5:4 e5:4 | f5:8 d5:4 bb4:4 | c5:4 e5:4 a5:8 | bb5:8 a5:4 f5:4 | ' +
        'a5:6 g5:2 f5:4 e5:4 | d5:8 b4:4 d5:4 | e5:16 | r:16',
      duty: 50,
      harm: { arp: '0121', len: 2 },
      harmDuty: 12,
      bass: { figure: 'R:16' },
      drums: 'k.......k....... | t...............',
    },
    {
      bars: 8,
      chords: CAVES_CHORDS,
      lead: CAVES_A,
      leadOctave: -1,
      duty: 25,
      harm: { arp: '02423242', len: 2 },
      harmDuty: 12,
      bass: { figure: 'R:12 5-:4' },
      drums: 'k............... | ........t....... | k............... | ......h.t...h...',
    },
    {
      // Calls into the dark, and what comes back.
      bars: 4,
      chords: 'Am:16 G:16 F:16 E:16',
      lead: 'r:8 e5:2 a5:2 r:4 | r:8 d5:2 g5:2 r:4 | r:8 c5:2 f5:2 r:4 | b4:4 g#4:4 e4:8',
      duty: 25,
      harm: { stab: 'x---------------' },
      harmDuty: 12,
      bass: { figure: 'R:16' },
      drums: '........t.......',
    },
  ],
};

/*
 * The dwarven city: stately and proud, in C minor, in dotted quarter-note steps over an
 * arpeggiated bass and chords struck on the beat. The B section lifts into E flat major;
 * a timpani bridge; and the last A ends on C major before the loop takes it back to minor.
 */
const CITY_A6 =
  'c5:6 d5:2 eb5:4 g5:4 | ab5:6 g5:2 f5:4 eb5:4 | g5:6 f5:2 eb5:4 bb4:4 | f5:6 eb5:2 d5:8 | ' +
  'eb5:6 d5:2 c5:4 g5:4 | ab5:6 g5:2 f5:4 c5:4 |';
const CITY_BASS: Figure = { figure: 'R:4 5:4 O:4 5:4' };
const CITY_DRUMS = 'k.h.h.h.s.h.h.h. | k.h.h.h.s.h.k.s.';

const CITY: Song = {
  bpm: 96,
  levels: { lead: 0.15, harm: 0.065, bass: 0.27, drums: 0.2 },
  echo: { steps: 3, feedback: 0.3, wet: 0.2 },
  tone: 4500,
  sections: [
    {
      bars: 8,
      chords: 'Cm:16 Ab:16 Eb:16 Bb:16 Cm:16 Fm:16 G:16 G7:16',
      lead: CITY_A6 + ' b4:6 c5:2 d5:4 f5:4 | eb5:4 d5:4 b4:4 g4:4',
      duty: 25,
      harm: { stab: 'x--.x--.x--.x--.' },
      harmDuty: 25,
      bass: CITY_BASS,
      drums: CITY_DRUMS,
    },
    {
      bars: 8,
      chords: 'Cm:16 Ab:16 Eb:16 Bb:16 Cm:16 Fm:16 G7:16 Cm:16',
      lead: CITY_A6 + ' b4:4 d5:4 f5:4 ab5:4 | g5:4 eb5:4 c5:8',
      duty: 50,
      harm: { arp: '01230123', len: 2 },
      harmDuty: 12,
      bass: CITY_BASS,
      drums: CITY_DRUMS,
    },
    {
      // The lift: E flat major, the halls in their glory.
      bars: 8,
      chords: 'Eb:16 Bb:16 Cm:16 Ab:16 Eb:16 Bb:16 Ab:16 Bb:16',
      lead:
        'eb5:4 g5:4 bb5:6 ab5:2 | f5:6 g5:2 f5:4 d5:4 | eb5:4 g5:4 c6:6 bb5:2 | ab5:4 c6:4 ab5:4 eb5:4 | ' +
        'g5:6 ab5:2 bb5:4 g5:4 | f5:6 g5:2 ab5:4 f5:4 | eb5:4 f5:4 g5:4 ab5:4 | bb5:12 r:4',
      duty: 50,
      harm: { stab: 'x--.x--.x--.x--.' },
      harmDuty: 25,
      bass: CITY_BASS,
      drums: 'k.h.h.h.s.h.h.h. | k.h.k.h.s.h.h.s.',
    },
    {
      // Timpani, and a shimmer of fast broken chords.
      bars: 4,
      chords: 'Fm:16 G:16 Ab:16 G7:16',
      lead: 'c5:8 ab4:8 | b4:8 d5:8 | c5:4 eb5:4 ab5:8 | g5:8 f5:4 d5:4',
      duty: 25,
      harm: { arp: '0123', len: 1 },
      harmDuty: 12,
      bass: { figure: 'R:8 R:8' },
      drums: 't...t...t...t.t.',
    },
    {
      bars: 8,
      chords: 'Cm:16 Ab:16 Eb:16 Bb:16 Cm:16 Fm:16 G7:16 C:16',
      lead: CITY_A6 + ' b4:4 d5:4 f5:4 ab5:4 | g5:4 e5:4 c5:8',
      duty: 25,
      harm: { stab: 'x--.x--.x--.x--.' },
      harmDuty: 25,
      bass: CITY_BASS,
      drums: 'k.h.h.h.s.h.h.h. | k.h.h.h.s.h.h.h. | k.h.h.h.s.h.h.h. | k.h.h.h.s.h.h.h. | ' +
        'k.h.h.h.s.h.h.h. | k.h.h.h.s.h.h.h. | k.h.h.h.s.h.k.s. | c...............',
    },
  ],
};

/*
 * The demon halls: a slow heartbeat in E minor and lines that slide by half steps. Chords
 * a half step away from each other (E minor, F, C minor, B flat against E); the B section
 * climbs the bass chromatically from A to D sharp and falls back into E. A, B, A an octave down.
 */
const HALLS_CHORDS = 'Em:16 F:16 Em:16 Cm:16 Em:16 F:16 Bb:16 B7:16';
const HALLS_A =
  'e5:8 d#5:4 e5:4 | f5:12 e5:4 | g5:6 f#5:2 e5:4 b4:4 | c5:8 eb5:4 g5:4 | ' +
  'b5:8 bb5:4 a5:4 | a5:4 ab5:4 g5:8 | f5:8 d5:4 bb4:4 | d#5:8 f#5:4 a5:4';
const HEARTBEAT: Figure = { figure: 'R:2 R:4 r:10' };
const HEARTBEAT_DRUMS = 'k.k............. | k.k.........g...';

const HALLS: Song = {
  bpm: 66,
  loop: 1,
  levels: { lead: 0.16, harm: 0.07, bass: 0.34, drums: 0.27 },
  echo: { steps: 2, feedback: 0.35, wet: 0.25 },
  tone: 3000,
  boss: { harm: { arp: '01231210', len: 1 }, bass: { figure: 'R:1 R:1 O:1 R:1' }, drums: 'k.k.s.h.k.k.s.h. | k.k.s.h.k.k.s.sh' },
  sections: [
    { bars: 2, chords: 'Em:32', harm: { stab: 'x-------........' }, harmDuty: 12, bass: HEARTBEAT, drums: HEARTBEAT_DRUMS },
    {
      bars: 8,
      chords: HALLS_CHORDS,
      lead: HALLS_A,
      duty: 50,
      // An inner voice that barely moves, a half step at a time.
      harm: 'b4:16 | a4:16 | b4:16 | g4:16 | g4:16 | a4:16 | bb4:16 | b4:8 a4:8',
      harmDuty: 12,
      bass: HEARTBEAT,
      drums: HEARTBEAT_DRUMS,
    },
    {
      bars: 8,
      chords: 'Am:16 Bb:16 Em/B:16 C:16 C#dim:16 D:16 D#dim7:16 B7:16',
      lead:
        'a4:4 c5:4 e5:8 | f5:4 d5:4 bb4:8 | b4:4 e5:4 g5:8 | c5:4 e5:4 g5:8 | ' +
        'g5:4 e5:4 c#5:8 | d5:4 f#5:4 a5:8 | a5:4 f#5:4 d#5:8 | b4:4 d#5:4 f#5:4 a5:4',
      duty: 25,
      harm: { stab: 'x-..x-..x-..x-..' },
      harmDuty: 12,
      bass: { figure: 'R:2 r:2 R:2 r:2 R:2 r:2 R:2 r:2' },
      drums: 'k.k.....g...t... | k.k.....g...t.g.',
    },
    {
      bars: 8,
      chords: HALLS_CHORDS,
      lead: HALLS_A,
      leadOctave: -1,
      duty: 25,
      harm: { arp: '0121', len: 4 },
      harmDuty: 12,
      bass: HEARTBEAT,
      drums: 'k.k............. | k.k.........g... | k.k............. | k.k.....t...t.t.',
    },
  ],
};

/*
 * The camp, «У костра»: warm and calm, around a fire. E minor turning to G major and back, a flute on the tune over a
 * fingerpicked guitar, a pad and a soft bass, no drums (the fire crackles under it: see audio.ts). The tune opens on a
 * rising minor arpeggio, E G B, and turns on the A: a nod to the title tune of the original, whose first phrase rises
 * the same way out of the dark. A, B (the lift into G major), and A again with the flute resting and the guitar alone.
 */
const CAMP_A =
  'e4:4 g4:4 b4:6 a4:2 | g4:4 e4:4 c5:8 | b4:4 d5:4 b4:6 a4:2 | f#4:4 a4:4 d5:8 | ' +
  'e4:4 g4:4 b4:6 c5:2 | e5:6 d5:2 c5:4 g4:4 | b4:6 a4:2 g4:4 d4:4 | f#4:4 a4:4 d#5:4 b4:4 |';
const CAMP_B =
  'b4:4 d5:4 g5:8 | f#5:6 e5:2 d5:4 a4:4 | g5:4 e5:4 b4:8 | c5:4 e5:4 g5:4 e5:4 | ' +
  'd5:6 b4:2 g4:4 b4:4 | a4:4 d5:4 f#5:4 a5:4 | g5:8 e5:4 c5:4 | a4:8 f#4:4 a4:4 |';
const CAMP_BASS: Figure = { figure: 'R:12 5:4' };

const CAMP: Song = {
  bpm: 72,
  layers: ['calm'],
  levels: { lead: 0, harm: 0, bass: 0.25, drums: 0, pad: 0.1, flute: 0.17, pluck: 0.11 },
  echo: { steps: 3, feedback: 0.35, wet: 0.22 },
  tone: 5200,
  reverb: 0.32,
  sections: [
    {
      bars: 8,
      chords: 'Em:16 C:16 G:16 D:16 Em:16 C:16 G:16 B7:16',
      calm: { lead: CAMP_A, pluck: { arp: '02321232', len: 2, octave: -1 }, bass: CAMP_BASS },
    },
    {
      bars: 8,
      chords: 'G:16 D:16 Em:16 C:16 G:16 D:16 C:16 D:16',
      calm: { lead: CAMP_B, pluck: { arp: '01232123', len: 2, octave: -1 }, bass: CAMP_BASS },
    },
    {
      // The flute rests, the guitar plays on alone; the first phrase comes back at the loop.
      bars: 8,
      chords: 'Em:16 C:16 G:16 D:16 Em:16 C:16 G:16 B7:16',
      calm: { lead: false, pluck: { arp: '0123 2123', len: 2, octave: -1 }, bass: CAMP_BASS },
    },
  ],
};

/*
 * The sewers: dripping and a little wary, in G minor. A pulse plinks the tune in short notes through a long echo
 * (the drips), over a bass that walks; the B section lifts into B flat major; A returns an octave down. Calm, the
 * tune is a flute over a sparse pluck, like drops falling off a pipe.
 */
const SEWERS_CHORDS = 'Gm:16 Eb:16 Cm:16 D:16 Gm:16 Eb:16 Cm:16 D7:16';
const SEWERS_A =
  'g4:2 r:2 bb4:2 d5:4 r:2 bb4:2 r:2 | g4:2 r:2 bb4:2 eb5:4 r:2 d5:2 r:2 | c5:2 r:2 eb5:2 g5:4 r:2 eb5:2 r:2 | f#4:2 r:2 a4:2 d5:4 r:2 c5:2 r:2 | ' +
  'g4:2 r:2 bb4:2 d5:4 r:2 g5:2 r:2 | f5:4 eb5:2 d5:2 bb4:4 g4:4 | eb5:2 d5:2 c5:4 g4:4 bb4:4 | a4:4 c5:4 d5:6 r:2 |';
const SEWERS_B =
  'd5:4 f5:4 bb5:6 a5:2 | a5:4 f5:4 c5:8 | bb4:4 d5:4 g5:6 f5:2 | f#5:4 d5:4 a4:8 | ' +
  'g5:4 bb5:4 g5:8 | f5:4 d5:4 bb4:8 | e5:4 g5:4 c6:6 bb5:2 | a5:4 f#5:4 d5:4 a4:4 |';
const SEWERS_WALK: Figure = { figure: 'R:2 R:2 5:2 R:2 R:2 R:2 3:2 R:2' };
const SEWERS_DRUMS = 'k...s...k..ks... | k...s...k.k.s.gs';
const SEWERS_DRIP: Calm['pluck'] = { arp: '3.2.1.2.', len: 2 };

const SEWERS: Song = {
  bpm: 92,
  levels: { lead: 0.14, harm: 0.065, bass: 0.27, drums: 0.2, pad: 0.08, flute: 0.15, pluck: 0.1 },
  echo: { steps: 3, feedback: 0.4, wet: 0.3 },
  tone: 3800,
  reverb: 0.22,
  sections: [
    {
      bars: 8,
      chords: SEWERS_CHORDS,
      lead: SEWERS_A,
      duty: 25,
      harm: { stab: '..x-..x-..x-..x-' },
      harmDuty: 12,
      bass: SEWERS_WALK,
      drums: SEWERS_DRUMS,
      calm: { pluck: SEWERS_DRIP },
    },
    {
      bars: 8,
      chords: 'Bb:16 F:16 Gm:16 D:16 Eb:16 Bb:16 C:16 D:16',
      lead: SEWERS_B,
      duty: 50,
      harm: { arp: '0121', len: 2 },
      harmDuty: 12,
      bass: SEWERS_WALK,
      drums: SEWERS_DRUMS,
      calm: { pluck: SEWERS_DRIP },
    },
    {
      bars: 8,
      chords: SEWERS_CHORDS,
      lead: SEWERS_A,
      leadOctave: -1,
      duty: 25,
      harm: { arp: '01232121', len: 1 },
      harmDuty: 12,
      bass: SEWERS_WALK,
      drums: SEWERS_DRUMS,
      calm: { pluck: SEWERS_DRIP },
    },
  ],
};

/* The stingers: a fanfare when a boss falls or the Amulet is won, and a falling phrase for the hero's death. */
const VICTORY: Song = {
  bpm: 132,
  once: true,
  layers: ['danger'],
  levels: { lead: 0.17, harm: 0.08, bass: 0.27, drums: 0.24 },
  echo: { steps: 3, feedback: 0.3, wet: 0.2 },
  tone: 5200,
  reverb: 0.25,
  sections: [
    {
      bars: 3,
      chords: 'C:16 F:8 G:8 C:16',
      lead: 'g4:2 c5:2 e5:2 g5:4 e5:2 g5:4 | a5:4 f5:2 a5:2 g5:4 b5:4 | c6:16',
      duty: 50,
      harm: { arp: '0123', len: 1 },
      harmDuty: 25,
      bass: { figure: 'R:4 5:4 R:4 5:4' },
      drums: 't...t...t...t.t. | k...s...k...s.ss | c...............',
    },
  ],
};

const DEATH: Song = {
  bpm: 80,
  once: true,
  layers: ['danger'],
  levels: { lead: 0.15, harm: 0.06, bass: 0.27, drums: 0.24 },
  echo: { steps: 4, feedback: 0.4, wet: 0.3 },
  tone: 2600,
  reverb: 0.4,
  sections: [
    {
      bars: 2,
      chords: 'Dm:16 A:8 Dm:8',
      lead: 'a5:4 f5:4 e5:4 d5:4 | c#5:4 e5:4 d5:8',
      duty: 50,
      harm: { stab: 'x---------------' },
      harmDuty: 25,
      bass: { figure: 'R:16' },
      drums: 't...............',
    },
  ],
};

export const SONG_DATA: Record<SongName | StingerName, Song> = {
  camp: CAMP, sewers: SEWERS, prison: PRISON, caves: CAVES, city: CITY, halls: HALLS, victory: VICTORY, death: DEATH,
};
