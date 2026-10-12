/*
 * The music of the regions below the sewers, played here rather than from files.
 *
 * The original has two tunes: the title's and the dungeon's. The sewers keep the dungeon's;
 * the prison, the caves, the dwarven city, the demon halls and the boss fights have their own,
 * written below as note data and played by a small chip of the kind the original's tunes
 * imitate: two pulse voices (duties of 12.5, 25 and 50 %), a stepped triangle for the bass and a
 * noise channel for the drums, with a little vibrato on long notes and a quiet echo for space.
 *
 * A song is a list of sections (an A, its variation, a B, a bridge...), each a few bars of
 * sixteen steps: the chords, a melody for the lead, an accompaniment for the second pulse
 * (a line of its own, a broken chord or rhythmic chord stabs), the bass (a line, or a figure
 * drawn from the chords) and a drum pattern. It loops, past its intro if it has one.
 *
 * Notes are scheduled a little ahead on the audio clock, from a timer that only looks ahead
 * ("two clocks"): a busy frame on the main thread never makes the music stutter, and while the
 * context is suspended (the app hidden) its clock stands still, so nothing piles up to burst
 * out on return. A player plays into the gain it is given; the fades, the duck and the muffle
 * are the caller's, as for the tunes from files.
 */

export type SongName = 'prison' | 'caves' | 'city' | 'halls' | 'boss';

export const SONGS: readonly SongName[] = ['prison', 'caves', 'city', 'halls', 'boss'];

/** A pulse's duty, in percent: 50 is round and hollow, 25 brighter, 12.5 thin and nasal. */
type Duty = 12 | 25 | 50;

/**
 * Drums, one character a step: k kick, s snare, g ghost snare, h closed hat, o open hat,
 * t tom, c crash, `.` nothing.
 */
type Drum = 'k' | 's' | 'g' | 'h' | 'o' | 't' | 'c';

/** A broken chord: chord tones by index (0 the root, 1 the next tone up...; `.` a rest), `len` steps each. */
interface Arp {
  arp: string;
  len: number;
  octave?: number;
}

/** Chord stabs: `x` strikes the chord (a fast arpeggio, as the chip played chords), `-` holds it, `.` rests. */
interface Stab {
  stab: string;
  octave?: number;
}

/**
 * A bass figure, drawn from the chord at each note: R the root (or the slash note), 3, 5, 7
 * the chord's tones above it, O the octave; a trailing `-` takes it an octave down. It repeats
 * through the section.
 */
interface Figure {
  figure: string;
}

interface Section {
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
}

interface Song {
  bpm: number;
  sections: readonly Section[];
  /** The section the song comes back to when it loops (past an intro). */
  loop?: number;
  /** Each voice's level. */
  levels: { lead: number; harm: number; bass: number; drums: number };
  /** The echo: its delay in steps, how much of it comes back, how much is heard. */
  echo: { steps: number; feedback: number; wet: number };
  /** The brightest the music gets, Hz: darker regions are darker. */
  tone: number;
}

/* The songs. */

const BAR = 16;

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
 * A boss: fast and urgent, in E minor, octave bass in eighths and the drums on every beat.
 * A hook that stabs and climbs, its variation, a soaring B that turns on B major (the
 * dominant pulling back to E), a breakdown that builds from the kick alone, and the hook again.
 */
const BOSS_CHORDS = 'Em:16 Em:16 C:16 D:16 Em:16 Em:16 C:16 B:16';
const BOSS_A6 =
  'e5:3 e5:1 r:2 g5:2 f#5:2 e5:2 d5:2 b4:2 | e5:6 g5:2 b5:4 a5:2 g5:2 | g5:3 g5:1 r:2 e5:2 g5:2 c6:4 b5:2 | ' +
  'a5:6 f#5:2 d5:4 f#5:4 | e5:3 e5:1 r:2 g5:2 f#5:2 e5:2 d5:2 b4:2 | e5:4 b4:2 e5:2 g5:4 b5:4 |';
const BOSS_A = BOSS_A6 + ' c6:6 b5:2 a5:2 g5:2 e5:4 | d#5:6 f#5:2 b5:8';
const OCTAVES: Figure = { figure: 'R:2 O:2' };
const BOSS_DRUMS = 'k.h.s.hkk.h.s.h. | k.h.s.hkk.h.s.hs';

const BOSS: Song = {
  bpm: 152,
  loop: 1,
  levels: { lead: 0.15, harm: 0.06, bass: 0.27, drums: 0.24 },
  echo: { steps: 3, feedback: 0.2, wet: 0.12 },
  tone: 4800,
  sections: [
    { bars: 2, chords: 'Em:32', harm: { arp: '0123', len: 1 }, harmDuty: 12, bass: OCTAVES, drums: 'k...k...k...k... | k...k...k.s.ssss' },
    {
      bars: 8,
      chords: BOSS_CHORDS,
      lead: BOSS_A,
      duty: 25,
      harm: { arp: '01231210', len: 1 },
      harmDuty: 12,
      bass: OCTAVES,
      drums: BOSS_DRUMS,
    },
    {
      bars: 8,
      chords: BOSS_CHORDS,
      lead: BOSS_A6 + ' c6:4 b5:4 a5:4 g5:4 | f#5:4 g5:4 a5:4 b5:4',
      duty: 50,
      harm: { stab: 'x-x-..x-x-x-..x-' },
      harmDuty: 25,
      bass: OCTAVES,
      drums: BOSS_DRUMS,
    },
    {
      bars: 8,
      chords: 'Am:16 F:16 C:16 G:16 Am:16 F:16 B:16 B7:16',
      lead:
        'a5:8 c6:4 b5:4 | a5:8 f5:4 c5:4 | e5:6 f5:2 g5:8 | d5:8 g5:4 b5:4 | ' +
        'c6:8 b5:4 a5:4 | a5:6 g5:2 f5:4 a5:4 | f#5:6 g5:2 f#5:4 d#5:4 | b4:4 d#5:4 f#5:4 b5:4',
      duty: 25,
      harm: { arp: '0121', len: 2 },
      harmDuty: 12,
      bass: { figure: 'R:2 R:1 R:1' },
      drums: 'k.h.s.h.k.h.s.h. | k.h.s.h.k.k.s.ss',
    },
    {
      // The breakdown: the kick alone under a running arpeggio, then the lead calls and it all comes back.
      bars: 8,
      chords: 'Em:16 Em:16 C:16 C:16 Am:16 Am:16 B:16 B:16',
      lead:
        'r:16 | r:16 | r:16 | r:16 | e5:2 r:2 e5:2 r:2 e5:2 g5:2 a5:2 b5:2 | c6:4 b5:4 a5:4 g5:4 | ' +
        "f#5:2 r:2 f#5:2 r:2 f#5:2 g5:2 a5:2 b5:2 | d#6:4! r:4 b5:8",
      duty: 50,
      harm: { arp: '01234321', len: 1 },
      harmDuty: 25,
      bass: { figure: 'R:1' },
      drums:
        'k...k...k...k... | k...k...k...k... | k...k...k...k... | k...k...k...s.ss | ' +
        'k.h.s.h.k.h.s.h. | k.h.s.h.k.h.s.h. | k.h.s.h.k.h.s.h. | k.s.s.s.ssssssss',
    },
    {
      bars: 8,
      chords: BOSS_CHORDS,
      lead: BOSS_A,
      duty: 25,
      harm: { stab: 'x-x-..x-x-x-..x-' },
      harmDuty: 25,
      bass: OCTAVES,
      drums: BOSS_DRUMS,
    },
  ],
};

const SONG_DATA: Record<SongName, Song> = { prison: PRISON, caves: CAVES, city: CITY, halls: HALLS, boss: BOSS };

/* From note data to events. */

type Voice = 'lead' | 'harm' | 'bass';

type Event =
  | { voice: 'lead' | 'harm'; midi: number; len: number; vol: number; gate: number; duty: Duty; arp: readonly number[] | null }
  | { voice: 'bass'; midi: number; len: number; vol: number; gate: number }
  | { voice: 'drum'; drum: Drum; vol: number };

interface Compiled {
  /** Seconds a step lasts. */
  step: number;
  /** What starts at each step. */
  steps: Event[][];
  /** The step the song loops back to. */
  loop: number;
}

interface Chord {
  /** Pitch classes: the root and the bass note (they differ for a slash chord). */
  root: number;
  bass: number;
  /** Semitones above the root. */
  tones: readonly number[];
}

interface Note {
  at: number;
  len: number;
  midi: number | null;
  vol: number;
  gate: number;
}

const LETTERS: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

const QUALITIES: Record<string, readonly number[]> = {
  '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
  dim: [0, 3, 6], dim7: [0, 3, 6, 9], m7b5: [0, 3, 6, 10], aug: [0, 4, 8], sus4: [0, 5, 7], sus2: [0, 2, 7],
};

function pitchClass(name: string): number {
  const base = LETTERS[name[0]!.toLowerCase()] ?? 0;
  const accidental = name[1] === '#' ? 1 : name[1] === 'b' ? -1 : 0;
  return (base + accidental + 12) % 12;
}

/** A mistake in the note data shows in the console while composing; the song still plays. */
function complain(where: string, what: string): void {
  if (import.meta.env?.DEV) console.warn(`music: ${where}: ${what}`);
}

/** Notes from a melody line ("d5:4 a4:2 r:2 | ..."). */
function parseLine(text: string, where: string): { notes: Note[]; length: number } {
  const notes: Note[] = [];
  let at = 0;
  for (const token of text.trim().split(/\s+/)) {
    if (!token) continue;
    if (token === '|') {
      if (at % BAR !== 0) complain(where, `a bar line at step ${at}`);
      continue;
    }
    const match = /^(r|[a-g][#b]?\d)(?::(\d+))?([!']*)$/i.exec(token);
    if (!match) {
      complain(where, `cannot read "${token}"`);
      continue;
    }
    const [, pitch, steps, marks] = match;
    const len = Number(steps ?? 2);
    const midi = pitch === 'r' ? null : pitchClass(pitch!) + (Number(pitch!.slice(-1)) + 1) * 12;
    notes.push({ at, len, midi, vol: marks!.includes('!') ? 1 : 0.8, gate: marks!.includes("'") ? 0.5 : 0.92 });
    at += len;
  }
  return { notes, length: at };
}

/** The chord sounding at each step of a section. */
function parseChords(text: string, steps: number, where: string): Chord[] {
  const spans: { chord: Chord; len: number }[] = [];
  for (const token of text.trim().split(/\s+/)) {
    const match = /^([A-G][#b]?)(m7b5|maj7|dim7|dim|aug|sus4|sus2|m7|m|7)?(?:\/([A-G][#b]?))?:(\d+)$/.exec(token);
    if (!match) {
      complain(where, `cannot read the chord "${token}"`);
      continue;
    }
    const [, root, quality, bass, len] = match;
    const rootClass = pitchClass(root!);
    spans.push({
      chord: { root: rootClass, bass: bass ? pitchClass(bass) : rootClass, tones: QUALITIES[quality ?? '']! },
      len: Number(len),
    });
  }
  const total = spans.reduce((sum, span) => sum + span.len, 0);
  if (total === 0) return Array.from({ length: steps }, () => ({ root: 0, bass: 0, tones: [0, 4, 7] }));
  if (steps % total !== 0) complain(where, `chords last ${total} steps in a section of ${steps}`);
  const byStep: Chord[] = [];
  while (byStep.length < steps) for (const span of spans) for (let i = 0; i < span.len; i++) byStep.push(span.chord);
  return byStep.slice(0, steps);
}

/** The lowest `midi` at or above `low` with that pitch class. */
function place(pc: number, low: number): number {
  return low + ((((pc - low) % 12) + 12) % 12);
}

/** Chord tone `index` above `root` (0 the root; past the chord's tones, the next octave). */
function chordTone(chord: Chord, root: number, index: number): number {
  const n = chord.tones.length;
  return root + chord.tones[index % n]! + 12 * Math.floor(index / n);
}

/** Where the accompaniment's chords sit (from G3 up), and the bass's (from E2: low, but still heard on a phone). */
const HARM_LOW = 55;
const BASS_LOW = 40;

function compile(name: SongName): Compiled {
  const song = SONG_DATA[name];
  const total = song.sections.reduce((sum, section) => sum + section.bars * BAR, 0);
  const steps: Event[][] = Array.from({ length: total }, () => []);
  let base = 0;
  let loop = 0;
  song.sections.forEach((section, index) => {
    const where = `${name} section ${index + 1}`;
    const length = section.bars * BAR;
    if (index === (song.loop ?? 0)) loop = base;
    const chords = parseChords(section.chords, length, where);
    const put = (at: number, event: Event): void => {
      if (at < length) steps[base + at]!.push(event);
    };
    const line = (text: string, voice: Voice, shift: number): void => {
      const { notes, length: written } = parseLine(text, `${where} ${voice}`);
      if (written !== length) complain(where, `the ${voice} lasts ${written} steps of ${length}`);
      for (const note of notes) {
        if (note.midi === null) continue;
        const midi = note.midi + shift;
        if (voice === 'bass') put(note.at, { voice, midi, len: note.len, vol: note.vol, gate: note.gate });
        else put(note.at, { voice, midi, len: note.len, vol: note.vol, gate: note.gate, duty: voice === 'lead' ? section.duty ?? 25 : section.harmDuty ?? 12, arp: null });
      }
    };

    if (section.lead) line(section.lead, 'lead', 12 * (section.leadOctave ?? 0));

    const harm = section.harm;
    const duty = section.harmDuty ?? 12;
    if (typeof harm === 'string') line(harm, 'harm', 0);
    else if (harm && 'arp' in harm) {
      const pattern = harm.arp.replace(/\s/g, '');
      for (let at = 0, i = 0; at < length; at += harm.len, i++) {
        const symbol = pattern[i % pattern.length]!;
        if (symbol === '.') continue;
        const chord = chords[at]!;
        const root = place(chord.root, HARM_LOW + 12 * (harm.octave ?? 0));
        put(at, { voice: 'harm', midi: chordTone(chord, root, Number(symbol)), len: harm.len, vol: 0.8, gate: 0.85, duty, arp: null });
      }
    } else if (harm) {
      const pattern = harm.stab.replace(/[\s|]/g, '');
      for (let at = 0; at < length; at++) {
        if (pattern[at % pattern.length] !== 'x') continue;
        let len = 1;
        while (at + len < length && pattern[(at + len) % pattern.length] === '-') len++;
        const chord = chords[at]!;
        const root = place(chord.root, HARM_LOW + 12 * (harm.octave ?? 0));
        // A triad is played with its octave on top, so the arpeggio rolls rather than wobbles.
        const arp = chord.tones.length === 3 ? [...chord.tones, 12] : [...chord.tones];
        put(at, { voice: 'harm', midi: root, len, vol: 0.75, gate: 0.9, duty, arp });
      }
    }

    const bass = section.bass;
    if (typeof bass === 'string') line(bass, 'bass', 0);
    else if (bass) {
      const figure = parseFigure(bass.figure, `${where} bass`);
      const cycle = figure.reduce((sum, note) => sum + note.len, 0);
      for (let start = 0; cycle > 0 && start < length; start += cycle) {
        for (const note of figure) {
          const at = start + note.at;
          if (at >= length || note.degree === 'r') continue;
          const chord = chords[at]!;
          const root = place(chord.root, BASS_LOW);
          const low = place(chord.bass, BASS_LOW);
          let midi =
            note.degree === 'R' ? low
            : note.degree === 'O' ? low + 12
            : note.degree === '3' ? root + chord.tones[1]!
            : note.degree === '5' ? root + chord.tones[2]!
            : root + (chord.tones[3] ?? 12);
          midi += 12 * note.shift;
          put(at, { voice: 'bass', midi, len: Math.min(note.len, length - at), vol: 0.85, gate: note.gate });
        }
      }
    }

    if (section.drums) {
      const pattern = section.drums.replace(/[\s|]/g, '');
      for (let at = 0; at < length; at++) {
        const symbol = pattern[at % pattern.length]!;
        if (symbol === '.') continue;
        if (!'ksghotc'.includes(symbol)) {
          complain(where, `no drum "${symbol}"`);
          continue;
        }
        put(at, { voice: 'drum', drum: symbol as Drum, vol: symbol === 'g' ? 0.35 : 1 });
      }
    }
    base += length;
  });
  return { step: 15 / song.bpm, steps, loop };
}

function parseFigure(text: string, where: string): { at: number; len: number; degree: string; shift: number; gate: number }[] {
  const notes: { at: number; len: number; degree: string; shift: number; gate: number }[] = [];
  let at = 0;
  for (const token of text.trim().split(/\s+/)) {
    const match = /^([R357Or])([-+]?):(\d+)(')?$/.exec(token);
    if (!match) {
      complain(where, `cannot read "${token}"`);
      continue;
    }
    const [, degree, shift, len, short] = match;
    notes.push({ at, len: Number(len), degree: degree!, shift: shift === '-' ? -1 : shift === '+' ? 1 : 0, gate: short ? 0.5 : 0.88 });
    at += Number(len);
  }
  return notes;
}

const compiled = new Map<SongName, Compiled>();

function song(name: SongName): Compiled {
  let done = compiled.get(name);
  if (!done) {
    done = compile(name);
    compiled.set(name, done);
  }
  return done;
}

/** How long a song plays before it loops, in seconds (for tests and the curious). */
export function songLength(name: SongName): { intro: number; loop: number } {
  const { step, steps, loop } = song(name);
  return { intro: loop * step, loop: (steps.length - loop) * step };
}

/* The chip. */

const TAU = Math.PI * 2;

/** A wave from one period of its shape, as partials: the browser keeps it free of aliasing at any pitch. */
function periodic(ctx: BaseAudioContext, shape: (phase: number) => number): PeriodicWave {
  const samples = 1024;
  const partials = 64;
  const real = new Float32Array(partials + 1);
  const imag = new Float32Array(partials + 1);
  for (let n = 1; n <= partials; n++) {
    let re = 0;
    let im = 0;
    for (let k = 0; k < samples; k++) {
      const phase = k / samples;
      const value = shape(phase);
      re += value * Math.cos(TAU * n * phase);
      im += value * Math.sin(TAU * n * phase);
    }
    // The highest partials are softened: the low notes keep their edge without a buzz.
    const soft = Math.exp(-((n / 40) ** 2));
    real[n] = ((2 / samples) * re * soft);
    imag[n] = ((2 / samples) * im * soft);
  }
  return ctx.createPeriodicWave(real, imag);
}

interface Chip {
  pulse: Record<Duty, PeriodicWave>;
  /** The NES's triangle: sixteen steps up and down, which gives the bass its slight grain. */
  triangle: PeriodicWave;
  /** A second of the noise channel's long sequence (a 15-bit shift register). */
  noise: AudioBuffer;
}

const chips = new WeakMap<BaseAudioContext, Chip>();

function chip(ctx: BaseAudioContext): Chip {
  let made = chips.get(ctx);
  if (made) return made;
  const pulse = (duty: number) => periodic(ctx, (phase) => (phase < duty ? 1 : -1));
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  let register = 1;
  for (let i = 0; i < data.length; i++) {
    const bit = (register ^ (register >> 1)) & 1;
    register = (register >> 1) | (bit << 14);
    data[i] = register & 1 ? 0.8 : -0.8;
  }
  made = {
    pulse: { 12: pulse(0.125), 25: pulse(0.25), 50: pulse(0.5) },
    triangle: periodic(ctx, (phase) => {
      const step = Math.floor(phase * 32);
      const level = step < 16 ? 15 - step : step - 16;
      return level / 7.5 - 1;
    }),
    noise,
  };
  chips.set(ctx, made);
  return made;
}

/** How each voice's notes swell and fade: attack, decay (a time constant), sustain level, release. */
const ENVELOPES: Record<Voice, { attack: number; decay: number; sustain: number; release: number }> = {
  lead: { attack: 0.01, decay: 0.4, sustain: 0.72, release: 0.035 },
  harm: { attack: 0.004, decay: 0.12, sustain: 0.42, release: 0.03 },
  bass: { attack: 0.004, decay: 0.6, sustain: 0.85, release: 0.015 },
};

/** How far ahead notes are scheduled, how often the timer looks, and how late a note may still play. */
const AHEAD = 0.15;
const TICK_MS = 25;
const LATE = 0.05;
/** The whole mix's level: the songs measure about as loud as game.mp3 (RMS) with it. */
const MIX = 0.58;
/** A chord stab steps through its tones this fast (seconds a tone). */
const ARP_RATE = 0.03;

function frequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export class MusicPlayer {
  private readonly song: Compiled;
  private readonly chip: Chip;
  /** The nodes the player made for itself, let go when it is done. */
  private readonly graph: AudioNode[] = [];
  /** Sounding (or soon to sound) sources, stopped if the player is let go mid-note. */
  private readonly live = new Set<AudioScheduledSourceNode>();
  private readonly voices: Record<Voice | 'drum', AudioNode>;
  private readonly snare: AudioNode;
  private readonly hat: AudioNode;
  private position = 0;
  private nextTime = 0;
  private timer = 0;
  private done = false;

  constructor(private readonly ctx: BaseAudioContext, name: SongName, out: AudioNode) {
    const data = SONG_DATA[name];
    this.song = song(name);
    this.chip = chip(ctx);
    const node = <T extends AudioNode>(made: T): T => {
      this.graph.push(made);
      return made;
    };
    const gain = (value: number): GainNode => {
      const made = node(ctx.createGain());
      made.gain.value = value;
      return made;
    };
    const pan = (value: number): AudioNode => {
      if (!ctx.createStereoPanner) return gain(1);
      const made = node(ctx.createStereoPanner());
      made.pan.value = value;
      return made;
    };

    // Everything meets in a gentle low-pass: the pulses' edge is kept, their glare is not.
    // The level matches the sewers' tune from its file, so no region is louder than another.
    const mix = gain(MIX);
    const tone = node(ctx.createBiquadFilter());
    tone.type = 'lowpass';
    tone.frequency.value = data.tone;
    tone.Q.value = 0.5;
    mix.connect(tone).connect(out);

    const lead = gain(data.levels.lead);
    const harm = gain(data.levels.harm);
    const bass = gain(data.levels.bass);
    const drum = gain(data.levels.drums);
    // The two pulses a little apart, the bass and drums in the middle.
    lead.connect(pan(-0.1)).connect(mix);
    harm.connect(pan(0.22)).connect(mix);
    bass.connect(mix);
    drum.connect(mix);

    // The echo: the pulses only, darker on each return, from the other side.
    const delay = node(ctx.createDelay(1));
    delay.delayTime.value = Math.min(0.9, data.echo.steps * this.song.step);
    const dark = node(ctx.createBiquadFilter());
    dark.type = 'lowpass';
    dark.frequency.value = 2200;
    const feedback = gain(data.echo.feedback);
    const wet = gain(data.echo.wet);
    lead.connect(delay);
    harm.connect(gain(0.6)).connect(delay);
    delay.connect(dark);
    dark.connect(feedback).connect(delay);
    dark.connect(wet).connect(pan(0.15)).connect(mix);

    // The drums' noise through their own filters: a snare's body, a hat's hiss.
    const highpass = (hz: number): BiquadFilterNode => {
      const made = node(ctx.createBiquadFilter());
      made.type = 'highpass';
      made.frequency.value = hz;
      made.connect(drum);
      return made;
    };
    this.snare = highpass(700);
    this.hat = highpass(5000);

    this.voices = { lead, harm, bass, drum };
  }

  /** Starts (or picks up again) on the audio clock: a timer schedules what falls in the next moment. */
  play(): void {
    if (this.done || this.timer) return;
    this.nextTime = this.ctx.currentTime + 0.06;
    this.timer = window.setInterval(() => this.pump(), TICK_MS);
    this.pump();
  }

  /**
   * Stops where it is (sound turned off): the few notes already scheduled ring out under the
   * fading bus, and `play` picks up from the next step.
   */
  pause(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
  }

  /** Lets the player go: no more notes, everything stopped and disconnected. Fade it out first. */
  dispose(): void {
    this.done = true;
    this.pause();
    this.silence();
    for (const made of this.graph) made.disconnect();
  }

  /** Schedules the first `seconds` at once: for an OfflineAudioContext (to hear or measure a song). */
  render(seconds: number): void {
    this.nextTime = 0.05;
    while (this.nextTime < seconds) this.advance();
  }

  private silence(): void {
    for (const source of this.live) {
      try {
        source.stop();
      } catch {
        // Not started yet, or already stopped.
      }
    }
    this.live.clear();
  }

  private pump(): void {
    const ctx = this.ctx;
    // A suspended context's clock stands still: nothing is due, and nothing piles up.
    if (ctx.state !== 'running') return;
    const now = ctx.currentTime;
    // Far behind (the timer was held up longer than the look-ahead): what is past is skipped,
    // the song keeps its place in time rather than cramming the missed notes into this instant.
    if (this.nextTime < now - LATE) {
      const missed = Math.ceil((now - LATE - this.nextTime) / this.song.step);
      for (let i = 0; i < missed; i++) this.move();
    }
    while (this.nextTime < now + AHEAD) this.advance(now);
  }

  /** Plays the current step at its time and moves on. */
  private advance(now = 0): void {
    const time = Math.max(this.nextTime, now);
    for (const event of this.song.steps[this.position]!) this.sound(event, time);
    this.move();
  }

  private move(): void {
    this.nextTime += this.song.step;
    this.position++;
    if (this.position >= this.song.steps.length) this.position = this.song.loop;
  }

  private sound(event: Event, time: number): void {
    if (event.voice === 'drum') {
      this.drum(event.drum, time, event.vol);
      return;
    }
    const ctx = this.ctx;
    const shape = ENVELOPES[event.voice];
    const length = event.len * this.song.step;
    const off = time + Math.max(shape.attack * 2, length * event.gate);
    const end = off + shape.release * 7;
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(event.voice === 'bass' ? this.chip.triangle : this.chip.pulse[event.duty]);
    if (event.voice !== 'bass' && event.arp) {
      // A chord on one voice: its tones in quick turn, as the chip had to.
      for (let t = time, i = 0; t < off; t += ARP_RATE, i++) {
        osc.frequency.setValueAtTime(frequency(event.midi + event.arp[i % event.arp.length]!), t);
      }
    } else {
      osc.frequency.setValueAtTime(frequency(event.midi), time);
    }
    const envelope = ctx.createGain();
    const peak = event.vol;
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(peak, time + shape.attack);
    envelope.gain.setTargetAtTime(peak * shape.sustain, time + shape.attack, shape.decay);
    envelope.gain.setTargetAtTime(0, off, shape.release);
    osc.connect(envelope).connect(this.voices[event.voice]);
    const extra: AudioNode[] = [envelope];
    // A held note of the lead sings: a vibrato that comes in after the note has spoken.
    if (event.voice === 'lead' && length > 0.3) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.5;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, time);
      depth.gain.setValueAtTime(0, time + 0.18);
      depth.gain.linearRampToValueAtTime(14, time + 0.45);
      lfo.connect(depth).connect(osc.detune);
      this.start(lfo, time, end);
      extra.push(depth);
    }
    this.start(osc, time, end, extra);
  }

  private drum(kind: Drum, time: number, vol: number): void {
    const ctx = this.ctx;
    /** An envelope that strikes at once, holds a moment and dies away; returns when it is silent. */
    const strike = (level: number, hold: number, decay: number): { envelope: GainNode; end: number } => {
      const envelope = ctx.createGain();
      envelope.gain.setValueAtTime(0, time);
      envelope.gain.linearRampToValueAtTime(level * vol, time + 0.002);
      envelope.gain.setTargetAtTime(0, time + hold, decay);
      return { envelope, end: time + hold + decay * 7 };
    };
    // The kick, the tom and a snare's body are the triangle diving in pitch, as on the chip.
    const dive = (from: number, to: number, fall: number, level: number, hold: number, decay: number): void => {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(this.chip.triangle);
      osc.frequency.setValueAtTime(from, time);
      osc.frequency.exponentialRampToValueAtTime(to, time + fall);
      const { envelope, end } = strike(level, hold, decay);
      osc.connect(envelope).connect(this.voices.drum);
      this.start(osc, time, end, [envelope]);
    };
    if (kind === 'k') return dive(170, 42, 0.11, 1, 0.04, 0.035);
    if (kind === 't') return dive(150, 75, 0.2, 0.75, 0.06, 0.07);
    if (kind === 's') dive(190, 120, 0.06, 0.45, 0.01, 0.03);
    const source = ctx.createBufferSource();
    source.buffer = this.chip.noise;
    source.loop = true;
    const [rate, level, hold, decay, into] =
      kind === 's' || kind === 'g' ? [0.55, 0.9, 0.01, 0.055, this.snare]
      : kind === 'h' ? [1, 0.35, 0.004, 0.016, this.hat]
      : kind === 'o' ? [1, 0.3, 0.01, 0.08, this.hat]
      : [0.8, 0.45, 0.02, 0.3, this.hat];
    source.playbackRate.value = rate;
    const { envelope, end } = strike(level, hold, decay);
    source.connect(envelope).connect(into);
    // Each hit from somewhere else in the sequence, so no two sound quite alike.
    this.start(source, time, end, [envelope], Math.random() * 0.9);
  }

  private start(source: AudioScheduledSourceNode, time: number, end: number, extra: readonly AudioNode[] = [], offset?: number): void {
    this.live.add(source);
    source.onended = () => {
      this.live.delete(source);
      source.disconnect();
      for (const made of extra) made.disconnect();
    };
    if (offset !== undefined && source instanceof AudioBufferSourceNode) source.start(time, offset);
    else source.start(time);
    source.stop(end);
  }
}
