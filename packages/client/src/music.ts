/*
 * The sequencer: turns the songs of music-songs.ts into notes and plays them.
 *
 * Songs are written as text (chords, a melody, a bass figure, a drum line; see music-songs.ts) and compiled once into a
 * list of events for each sixteenth-note step, tagged with the layer they belong to. Three layers play in step and
 * crossfade by the situation (`planLayers`): calm while exploring, danger with enemies in view, boss in a boss fight.
 * A layer that is not sounding is not even scheduled.
 *
 * The notes are played by a small chip of the kind the original's tunes imitate: two pulse voices (duties of 12.5, 25
 * and 50 %), a stepped triangle for the bass and a noise channel for the drums, with a soft pad, a flute and a plucked
 * string besides for the calm layer; a little vibrato on long notes, an echo and a room's reverb for space.
 *
 * Notes are scheduled a little ahead on the audio clock, from a timer that only looks ahead ("two clocks"): a busy
 * frame on the main thread never makes the music stutter, and while the context is suspended (the app hidden) its
 * clock stands still, so nothing piles up to burst out on return. A player plays into the gain it is given; the
 * fades, the duck and the muffle are the caller's, as for the tunes from files.
 */

import {
  type Arp, BAR, BOSS_DEFAULT, type Calm, type Drum, type Duty, type Figure, type Layer, LAYERS, SONG_DATA, type SongName, type StingerName,
} from './music-songs';

export { SONGS, STINGERS, type Layer, type SongName, type StingerName } from './music-songs';

type Inst = 'lead' | 'harm' | 'bass' | 'drum' | 'pad' | 'flute' | 'pluck';
type Tune = SongName | StingerName;

/* Which layer plays: the crossfade's logic. */

/** What is happening: enemies awake and in sight (how many), and whether a boss is being fought. */
export interface Situation {
  danger: number;
  boss: boolean;
}

/** Which layer plays, and the state kept between calls (until when the mode is held). */
export interface LayerPlan {
  mode: Layer;
  /** Until when (seconds on the caller's clock) the mode is kept, though what raised it has passed. */
  holdUntil: number;
}

/** How long danger lingers after the last enemy leaves the sight, and the boss layer after the boss falls. */
export const HOLD: Record<Layer, number> = { calm: 0, danger: 6, boss: 4 };
const RANK: Record<Layer, number> = { calm: 0, danger: 1, boss: 2 };
/** Time constants of a fade: a layer coming in, a layer giving way to a higher one, and one going back down. */
export const FADE = { up: 0.3, over: 0.7, down: 1.8 };

/** The highest of the layers a song has that is at or below `mode`. */
export function available(mode: Layer, has: readonly Layer[]): Layer {
  for (let rank = RANK[mode]; rank >= 0; rank--) {
    const layer = LAYERS[rank]!;
    if (has.includes(layer)) return layer;
  }
  return has[0] ?? 'calm';
}

/**
 * The next plan. Danger and boss come in at once; they go only after the hold has run out, so a fight that flickers (an enemy
 * out of sight for a moment) does not flicker the music.
 */
export function planLayers(prev: LayerPlan | null, situation: Situation, now: number): LayerPlan {
  const wanted: Layer = situation.boss ? 'boss' : situation.danger > 0 ? 'danger' : 'calm';
  const mode = prev?.mode ?? 'calm';
  const holdUntil = prev?.holdUntil ?? 0;
  // Up (or the same), at once; down only once the hold has run out (from a boss to danger if enemies are still in sight, then to calm).
  if (RANK[wanted] >= RANK[mode] || now >= holdUntil) return { mode: wanted, holdUntil: now + HOLD[wanted] };
  return { mode, holdUntil };
}

export interface LayerLevels {
  gains: Record<Layer, number>;
  /** Time constants of the fades, seconds. */
  fades: Record<Layer, number>;
}

/** Each layer's level and fade for a mode, in a song with the layers `has`: the layer below stands in for one it lacks. */
export function layerLevels(mode: Layer, before: Layer, has: readonly Layer[]): LayerLevels {
  const sounding = available(mode, has);
  const was = available(before, has);
  const gains = { calm: 0, danger: 0, boss: 0 };
  const fades = { calm: FADE.down, danger: FADE.down, boss: FADE.down };
  gains[sounding] = 1;
  for (const layer of LAYERS) {
    if (layer === sounding) fades[layer] = FADE.up;
    else fades[layer] = RANK[sounding] > RANK[was] || RANK[sounding] > RANK[layer] ? FADE.over : FADE.down;
  }
  return { gains, fades };
}

/* The clock: where in the song, and when. */

/** The seconds a sixteenth-note step lasts at a tempo. */
export const stepSeconds = (bpm: number): number => 15 / bpm;

/**
 * Walks a song's steps against the audio clock. `time` is when the step at `position` sounds; at the end of the song
 * it goes back to `loop` (the time keeps counting on, so the join has no gap and no overlap), or, for a stinger, ends.
 */
export class StepCursor {
  position = 0;
  time = 0;
  ended = false;

  constructor(
    readonly step: number,
    readonly length: number,
    readonly loop: number,
    readonly once = false,
  ) {}

  move(): void {
    this.time += this.step;
    this.position++;
    if (this.position >= this.length) {
      if (this.once) {
        this.ended = true;
        this.position = this.length - 1;
      } else {
        this.position = this.loop;
      }
    }
  }

  /**
   * Plays what falls before `now + ahead`. If the timer was held up so long that steps are past `late` seconds old, those are
   * skipped (the song keeps its place in time) rather than crammed into this instant. `emit` gets each step and its time.
   */
  run(now: number, ahead: number, late: number, emit: (position: number, time: number) => void): void {
    if (this.ended) return;
    if (this.time < now - late) {
      const missed = Math.ceil((now - late - this.time) / this.step);
      for (let i = 0; i < missed && !this.ended; i++) this.move();
    }
    while (!this.ended && this.time < now + ahead) {
      emit(this.position, Math.max(this.time, now));
      this.move();
    }
  }
}

/* From note data to events. */

interface Event {
  inst: Inst;
  layer: Layer;
  midi: number;
  len: number;
  vol: number;
  gate: number;
  duty: Duty;
  /** A chord on one voice: its tones in quick turn. */
  arp: readonly number[] | null;
  drum: Drum | null;
  /** A pad's tones. */
  tones: readonly number[] | null;
}

interface Compiled {
  /** Seconds a step lasts. */
  step: number;
  /** What starts at each step. */
  steps: Event[][];
  /** The step the song loops back to. */
  loop: number;
  once: boolean;
  layers: readonly Layer[];
  /** What was wrong in the note data. */
  problems: string[];
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

/** Mistakes in the note data: shown in the console while composing (the song still plays), and kept for the tests. */
let sink: string[] | null = null;

function complain(where: string, what: string): void {
  sink?.push(`${where}: ${what}`);
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

/** The chord sounding at each step of a section (one object to a chord, shared by its steps). */
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

/** Where the accompaniment's chords sit (from G3 up), the bass's (from E2: low, but still heard on a phone) and the pad's. */
const HARM_LOW = 55;
const BASS_LOW = 40;
const PAD_LOW = 48;

/** What one layer of a section plays. */
interface Parts {
  lead?: string;
  duty?: Duty;
  leadOctave?: number;
  harm?: string | Arp | { stab: string; octave?: number };
  harmDuty?: Duty;
  bass?: string | Figure;
  drums?: string;
}

interface Where {
  name: string;
  length: number;
  chords: readonly Chord[];
  put(at: number, event: Event): void;
}

const event = (inst: Inst, layer: Layer, midi: number, len: number, extra: Partial<Event> = {}): Event => ({
  inst, layer, midi, len, vol: 0.8, gate: 0.9, duty: 25, arp: null, drum: null, tones: null, ...extra,
});

function addLine(w: Where, layer: Layer, text: string, inst: 'lead' | 'harm' | 'bass' | 'flute', shift: number, duty: Duty, volume = 1): void {
  const where = `${w.name} ${layer} ${inst}`;
  const { notes, length } = parseLine(text, where);
  if (length !== w.length) complain(where, `lasts ${length} steps of ${w.length}`);
  for (const note of notes) {
    if (note.midi === null) continue;
    w.put(note.at, event(inst, layer, note.midi + shift, note.len, { vol: note.vol * volume, gate: note.gate, duty }));
  }
}

function addBroken(w: Where, layer: Layer, arp: Arp, inst: 'harm' | 'pluck', duty: Duty): void {
  const pattern = arp.arp.replace(/\s/g, '');
  for (let at = 0, i = 0; at < w.length; at += arp.len, i++) {
    const symbol = pattern[i % pattern.length]!;
    if (symbol === '.') continue;
    const chord = w.chords[at]!;
    const root = place(chord.root, HARM_LOW + 12 * (arp.octave ?? 0));
    w.put(at, event(inst, layer, chordTone(chord, root, Number(symbol)), arp.len, { gate: 0.85, duty }));
  }
}

function addStabs(w: Where, layer: Layer, stab: { stab: string; octave?: number }, duty: Duty): void {
  const pattern = stab.stab.replace(/[\s|]/g, '');
  for (let at = 0; at < w.length; at++) {
    if (pattern[at % pattern.length] !== 'x') continue;
    let len = 1;
    while (at + len < w.length && pattern[(at + len) % pattern.length] === '-') len++;
    const chord = w.chords[at]!;
    const root = place(chord.root, HARM_LOW + 12 * (stab.octave ?? 0));
    // A triad is played with its octave on top, so the arpeggio rolls rather than wobbles.
    const arp = chord.tones.length === 3 ? [...chord.tones, 12] : [...chord.tones];
    w.put(at, event('harm', layer, root, len, { vol: 0.75, gate: 0.9, duty, arp }));
  }
}

function addBass(w: Where, layer: Layer, bass: string | Figure): void {
  if (typeof bass === 'string') return addLine(w, layer, bass, 'bass', 0, 25);
  const figure = parseFigure(bass.figure, `${w.name} ${layer} bass`);
  const cycle = figure.reduce((sum, note) => sum + note.len, 0);
  for (let start = 0; cycle > 0 && start < w.length; start += cycle) {
    for (const note of figure) {
      const at = start + note.at;
      if (at >= w.length || note.degree === 'r') continue;
      const chord = w.chords[at]!;
      const root = place(chord.root, BASS_LOW);
      const low = place(chord.bass, BASS_LOW);
      let midi =
        note.degree === 'R' ? low
        : note.degree === 'O' ? low + 12
        : note.degree === '3' ? root + chord.tones[1]!
        : note.degree === '5' ? root + chord.tones[2]!
        : root + (chord.tones[3] ?? 12);
      midi += 12 * note.shift;
      w.put(at, event('bass', layer, midi, Math.min(note.len, w.length - at), { vol: 0.85, gate: note.gate }));
    }
  }
}

function addDrums(w: Where, layer: Layer, drums: string, volume = 1): void {
  const pattern = drums.replace(/[\s|]/g, '');
  for (let at = 0; at < w.length; at++) {
    const symbol = pattern[at % pattern.length]!;
    if (symbol === '.') continue;
    if (!'ksghotc'.includes(symbol)) {
      complain(`${w.name} ${layer}`, `no drum "${symbol}"`);
      continue;
    }
    w.put(at, event('drum', layer, 0, 1, { drum: symbol as Drum, vol: (symbol === 'g' ? 0.35 : 1) * volume }));
  }
}

/** What a layer written out plays (the danger layer, and the boss layer drawn from the same tune). */
function addParts(w: Where, layer: Layer, parts: Parts): void {
  if (parts.lead) addLine(w, layer, parts.lead, 'lead', 12 * (parts.leadOctave ?? 0), parts.duty ?? 25);
  const duty = parts.harmDuty ?? 12;
  const harm = parts.harm;
  if (typeof harm === 'string') addLine(w, layer, harm, 'harm', 0, duty);
  else if (harm && 'arp' in harm) addBroken(w, layer, harm, 'harm', duty);
  else if (harm) addStabs(w, layer, harm, duty);
  if (parts.bass) addBass(w, layer, parts.bass);
  if (parts.drums) addDrums(w, layer, parts.drums);
}

/** The calm layer: a pad on the chords, a flute on the tune, a plucked broken chord, the root in the bass. */
function addCalm(w: Where, calm: Calm, tune: { lead?: string; leadOctave?: number }): void {
  if (calm.pad !== false) {
    let from = 0;
    for (let at = 1; at <= w.length; at++) {
      if (at < w.length && w.chords[at] === w.chords[from]) continue;
      const chord = w.chords[from]!;
      const root = place(chord.root, PAD_LOW);
      // The root, and the chord's tones above it; a triad's root once more on top.
      const tones = [root, ...chord.tones.slice(1).map((tone) => root + tone), ...(chord.tones.length === 3 ? [root + 12] : [])];
      w.put(from, event('pad', 'calm', root, at - from, { vol: 0.7, gate: 1, tones }));
      from = at;
    }
  }
  const lead = calm.lead === false ? undefined : calm.lead ?? tune.lead;
  if (lead) addLine(w, 'calm', lead, 'flute', 12 * ((calm.octave ?? 0) + (calm.lead ? 0 : tune.leadOctave ?? 0)), 50, 0.9);
  const pluck = calm.pluck === undefined ? { arp: '0212', len: 4 } : calm.pluck;
  if (pluck) addBroken(w, 'calm', pluck, 'pluck', 25);
  const bass = calm.bass === undefined ? { figure: 'R:16' } : calm.bass;
  if (bass) addBass(w, 'calm', bass);
  if (calm.drums) addDrums(w, 'calm', calm.drums, 0.5);
}

function compile(name: Tune): Compiled {
  const song = SONG_DATA[name];
  const layers = song.layers ?? LAYERS;
  const problems: string[] = [];
  sink = problems;
  const total = song.sections.reduce((sum, section) => sum + section.bars * BAR, 0);
  const steps: Event[][] = Array.from({ length: total }, () => []);
  let base = 0;
  let loop = 0;
  song.sections.forEach((section, index) => {
    const label = `${name} section ${index + 1}`;
    const length = section.bars * BAR;
    if (index === (song.loop ?? 0)) loop = base;
    const w: Where = {
      name: label,
      length,
      chords: parseChords(section.chords, length, label),
      put: (at, made) => {
        if (at < length) steps[base + at]!.push(made);
      },
    };
    if (layers.includes('danger')) addParts(w, 'danger', section);
    if (layers.includes('boss')) {
      const style = { ...BOSS_DEFAULT, ...song.boss };
      addParts(w, 'boss', { lead: section.lead, duty: 25, leadOctave: section.leadOctave, harm: style.harm, harmDuty: 12, bass: style.bass, drums: style.drums });
      // The tune doubled an octave up, thin and bright.
      if (section.lead) addLine(w, 'boss', section.lead, 'lead', 12 * ((section.leadOctave ?? 0) + 1), 12, 0.55);
    }
    if (layers.includes('calm')) addCalm(w, section.calm ?? {}, section);
    base += length;
  });
  sink = null;
  return { step: stepSeconds(song.bpm), steps, loop, once: song.once === true, layers, problems };
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

const compiled = new Map<Tune, Compiled>();

function song(name: Tune): Compiled {
  let done = compiled.get(name);
  if (!done) {
    done = compile(name);
    compiled.set(name, done);
  }
  return done;
}

/** How long a song plays before it loops, in seconds (for tests and the curious). */
export function songLength(name: Tune): { intro: number; loop: number } {
  const { step, steps, loop } = song(name);
  return { intro: loop * step, loop: (steps.length - loop) * step };
}

/** Mistakes found in a song's note data (bars that do not add up, notes that cannot be read): none, for a song that is right. */
export const songProblems = (name: Tune): readonly string[] => song(name).problems;

/** The events of a song, for the tests: every step's, with the layer and instrument of each. */
export function songEvents(name: Tune): ReadonlyArray<ReadonlyArray<{ inst: string; layer: Layer; midi: number; len: number }>> {
  return song(name).steps;
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
  /** A room: noise dying away, darker as it goes. */
  room: AudioBuffer;
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
  const room = ctx.createBuffer(2, Math.round(ctx.sampleRate * 1.6), ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const samples = room.getChannelData(channel);
    let s = 0x9e3779b9 * (channel + 1);
    let dark = 0;
    for (let i = 0; i < samples.length; i++) {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      const u = i / samples.length;
      // Each pass through the room takes the top off a little more.
      dark += (0.55 - 0.45 * u) * (((s >>> 0) / 4294967296) * 2 - 1 - dark);
      samples[i] = dark * (1 - u) ** 2.6;
    }
  }
  made = {
    pulse: { 12: pulse(0.125), 25: pulse(0.25), 50: pulse(0.5) },
    triangle: periodic(ctx, (phase) => {
      const step = Math.floor(phase * 32);
      const level = step < 16 ? 15 - step : step - 16;
      return level / 7.5 - 1;
    }),
    noise,
    room,
  };
  chips.set(ctx, made);
  return made;
}

/** How each instrument's notes swell and fade: attack, decay (a time constant), sustain level, release. */
const ENVELOPES: Record<Exclude<Inst, 'drum'>, { attack: number; decay: number; sustain: number; release: number }> = {
  lead: { attack: 0.01, decay: 0.4, sustain: 0.72, release: 0.035 },
  harm: { attack: 0.004, decay: 0.12, sustain: 0.42, release: 0.03 },
  bass: { attack: 0.004, decay: 0.6, sustain: 0.85, release: 0.015 },
  pad: { attack: 0.45, decay: 1.2, sustain: 0.9, release: 0.6 },
  flute: { attack: 0.07, decay: 0.5, sustain: 0.8, release: 0.14 },
  pluck: { attack: 0.003, decay: 0.09, sustain: 0.1, release: 0.08 },
};

/** How far ahead notes are scheduled, how often the timer looks, and how late a note may still play. */
const AHEAD = 0.15;
const TICK_MS = 25;
const LATE = 0.05;
/** The whole mix's level: the songs measure about as loud as the original's dungeon tune (RMS) with it. */
const MIX = 0.58;
/** A chord stab steps through its tones this fast (seconds a tone). */
const ARP_RATE = 0.03;

function frequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Calm music sits a little under the others: the fight is the louder. */
const TRIM: Record<Layer, number> = { calm: 0.7, danger: 1, boss: 1 };

/** One layer's voices, mixed into its gain. */
interface Rack {
  gain: GainNode;
  bus: Record<Inst, GainNode>;
  snare: AudioNode;
  hat: AudioNode;
}

export interface PlayerOptions {
  /** The layer to sound at first (default: calm; a stinger plays its only layer). */
  mode?: Layer;
  /** A stinger has played to its end and died away. */
  onEnd?(): void;
}

export class MusicPlayer {
  private readonly song: Compiled;
  private readonly chip: Chip;
  /** The nodes the player made for itself, let go when it is done. */
  private readonly graph: AudioNode[] = [];
  /** Sounding (or soon to sound) sources, stopped if the player is let go mid-note. */
  private readonly live = new Set<AudioScheduledSourceNode>();
  private readonly rack: Partial<Record<Layer, Rack>> = {};
  /** Until when (audio clock) each layer's notes are still scheduled: a layer faded out is let go after its fade. */
  private readonly until: Record<Layer, number> = { calm: 0, danger: 0, boss: 0 };
  private readonly cursor: StepCursor;
  private timer = 0;
  private done = false;
  private endAt = 0;
  private mode: Layer;

  constructor(private readonly ctx: BaseAudioContext, name: Tune, out: AudioNode, private readonly options: PlayerOptions = {}) {
    const data = SONG_DATA[name];
    this.song = song(name);
    this.chip = chip(ctx);
    this.cursor = new StepCursor(this.song.step, this.song.steps.length, this.song.loop, this.song.once);
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
    const filter = (type: BiquadFilterType, hz: number, q = 0.5): BiquadFilterNode => {
      const made = node(ctx.createBiquadFilter());
      made.type = type;
      made.frequency.value = hz;
      made.Q.value = q;
      return made;
    };

    // Everything meets in a gentle low-pass: the pulses' edge is kept, their glare is not.
    // The level matches the sewers' tune from its file, so no region is louder than another.
    const mix = gain(MIX);
    mix.connect(filter('lowpass', data.tone)).connect(out);

    // The room: every layer sends some of itself to one reverb, without its lows.
    const reverb = data.reverb ?? 0.15;
    const send = gain(1);
    if (reverb > 0) {
      const room = node(ctx.createConvolver());
      room.buffer = this.chip.room;
      send.connect(room).connect(filter('highpass', 260)).connect(gain(reverb)).connect(mix);
    }

    // The echo: the pulses and the melodic voices, darker on each return, from the other side.
    const delay = node(ctx.createDelay(1));
    delay.delayTime.value = Math.min(0.9, data.echo.steps * this.song.step);
    const dark = filter('lowpass', 2200);
    const feedback = gain(data.echo.feedback);
    const wet = gain(data.echo.wet);
    delay.connect(dark);
    dark.connect(feedback).connect(delay);
    dark.connect(wet).connect(pan(0.15)).connect(mix);

    const levels = data.levels;
    const level: Record<Inst, number> = {
      lead: levels.lead, harm: levels.harm, bass: levels.bass, drum: levels.drums,
      pad: levels.pad ?? 0.08, flute: levels.flute ?? 0.15, pluck: levels.pluck ?? 0.08,
    };
    for (const layer of this.song.layers) {
      const layerGain = gain(0);
      layerGain.connect(mix);
      layerGain.connect(send);
      const bus = {} as Record<Inst, GainNode>;
      for (const inst of Object.keys(level) as Inst[]) bus[inst] = gain(level[inst]);
      // The two pulses a little apart, the flute and the guitar either side, the bass and drums in the middle.
      bus.lead.connect(pan(-0.1)).connect(layerGain);
      bus.harm.connect(pan(0.22)).connect(layerGain);
      bus.flute.connect(pan(-0.12)).connect(layerGain);
      bus.pluck.connect(pan(0.25)).connect(layerGain);
      bus.pad.connect(filter('lowpass', 1500)).connect(layerGain);
      bus.bass.connect(layerGain);
      bus.drum.connect(layerGain);
      bus.lead.connect(delay);
      bus.harm.connect(gain(0.6)).connect(delay);
      bus.flute.connect(gain(0.7)).connect(delay);
      bus.pluck.connect(gain(0.8)).connect(delay);
      // The drums' noise through their own filters: a snare's body, a hat's hiss.
      const highpass = (hz: number): BiquadFilterNode => {
        const made = filter('highpass', hz);
        made.connect(bus.drum);
        return made;
      };
      this.rack[layer] = { gain: layerGain, bus, snare: highpass(700), hat: highpass(5000) };
    }
    this.mode = options.mode ?? 'calm';
    this.apply(this.mode, this.mode, true);
  }

  /** The layer to sound: crossfades to it. */
  setMode(mode: Layer): void {
    if (mode === this.mode) return;
    const before = this.mode;
    this.mode = mode;
    this.apply(mode, before, false);
  }

  private apply(mode: Layer, before: Layer, immediately: boolean): void {
    const now = this.ctx.currentTime;
    const { gains, fades } = layerLevels(mode, before, this.song.layers);
    for (const layer of this.song.layers) {
      const rack = this.rack[layer]!;
      const target = gains[layer] * TRIM[layer];
      if (immediately) rack.gain.gain.value = target;
      else rack.gain.gain.setTargetAtTime(target, now, fades[layer]);
      // A layer is played while it sounds, and through its fade out.
      this.until[layer] = gains[layer] > 0 ? Infinity : immediately ? 0 : Math.min(this.until[layer], now + fades[layer] * 4);
    }
  }

  /** Starts (or picks up again) on the audio clock: a timer schedules what falls in the next moment. */
  play(): void {
    if (this.done || this.timer) return;
    this.cursor.time = this.ctx.currentTime + 0.06;
    this.timer = window.setInterval(() => this.pump(), TICK_MS);
    this.pump();
  }

  /**
   * Stops where it is (sound turned off, the app hidden): the few notes already scheduled ring out under the
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
    this.cursor.time = 0.05;
    while (this.cursor.time < seconds && !this.cursor.ended) this.advance(0);
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
    this.cursor.run(now, AHEAD, LATE, (position, time) => this.step(position, time));
    if (this.cursor.ended) {
      // A stinger has played its last step: it is let go once the last note has died away.
      if (!this.endAt) this.endAt = this.cursor.time + 2.5;
      if (now > this.endAt) {
        this.pause();
        this.options.onEnd?.();
      }
    }
  }

  /** Plays the current step at its time and moves on (offline). */
  private advance(now: number): void {
    this.cursor.run(this.cursor.time, 0.0001, 1e9, (position, time) => this.step(position, Math.max(time, now)));
  }

  private step(position: number, time: number): void {
    for (const made of this.song.steps[position]!) if (time < this.until[made.layer]) this.sound(made, time);
  }

  private sound(made: Event, time: number): void {
    if (made.inst === 'drum') {
      this.drum(made, time);
      return;
    }
    const ctx = this.ctx;
    const rack = this.rack[made.layer]!;
    const shape = ENVELOPES[made.inst];
    const length = made.len * this.song.step;
    const off = time + Math.max(shape.attack * 2, length * made.gate);
    const end = off + shape.release * (made.inst === 'pad' ? 5 : 7);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(made.vol, time + shape.attack);
    envelope.gain.setTargetAtTime(made.vol * shape.sustain, time + shape.attack, shape.decay);
    envelope.gain.setTargetAtTime(0, off, shape.release);
    envelope.connect(rack.bus[made.inst]);
    const extra: AudioNode[] = [envelope];

    if (made.inst === 'pad') {
      // The chord's tones, each from two voices a few cents apart: slow beating, a warmth.
      for (const tone of made.tones ?? []) {
        for (const cents of [-7, 7]) {
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(frequency(tone), time);
          osc.detune.value = cents;
          osc.connect(envelope);
          this.start(osc, time, end, extra);
        }
      }
      return;
    }

    const osc = ctx.createOscillator();
    if (made.inst === 'flute') osc.type = 'triangle';
    else osc.setPeriodicWave(made.inst === 'bass' ? this.chip.triangle : this.chip.pulse[made.duty]);
    if ((made.inst === 'lead' || made.inst === 'harm') && made.arp) {
      // A chord on one voice: its tones in quick turn, as the chip had to.
      for (let t = time, i = 0; t < off; t += ARP_RATE, i++) {
        osc.frequency.setValueAtTime(frequency(made.midi + made.arp[i % made.arp.length]!), t);
      }
    } else {
      osc.frequency.setValueAtTime(frequency(made.midi), time);
    }
    osc.connect(envelope);
    // A held note of the lead or the flute sings: a vibrato that comes in after the note has spoken.
    if ((made.inst === 'lead' || made.inst === 'flute') && length > 0.3) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = made.inst === 'flute' ? 5 : 5.5;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, time);
      depth.gain.setValueAtTime(0, time + 0.18);
      depth.gain.linearRampToValueAtTime(made.inst === 'flute' ? 9 : 14, time + 0.45);
      lfo.connect(depth).connect(osc.detune);
      this.start(lfo, time, end);
      extra.push(depth);
    }
    this.start(osc, time, end, extra);
  }

  private drum(made: Event, time: number): void {
    const ctx = this.ctx;
    const rack = this.rack[made.layer]!;
    const vol = made.vol;
    const kind = made.drum!;
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
      osc.connect(envelope).connect(rack.bus.drum);
      this.start(osc, time, end, [envelope]);
    };
    if (kind === 'k') return dive(170, 42, 0.11, 1, 0.04, 0.035);
    if (kind === 't') return dive(150, 75, 0.2, 0.75, 0.06, 0.07);
    if (kind === 's') dive(190, 120, 0.06, 0.45, 0.01, 0.03);
    const source = ctx.createBufferSource();
    source.buffer = this.chip.noise;
    source.loop = true;
    const [rate, level, hold, decay, into] =
      kind === 's' || kind === 'g' ? [0.55, 0.9, 0.01, 0.055, rack.snare]
      : kind === 'h' ? [1, 0.35, 0.004, 0.016, rack.hat]
      : kind === 'o' ? [1, 0.3, 0.01, 0.08, rack.hat]
      : [0.8, 0.45, 0.02, 0.3, rack.hat];
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
