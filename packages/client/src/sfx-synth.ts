/*
 * Firelight's own sounds: a small ZzFX-style synth that turns a handful of numbers into a sound.
 *
 * A sound is a few voices laid over each other. A voice is one wave (or noise) with an envelope, a pitch that slides, a
 * wobble (vibrato, tremolo, FM), a grit (bit-crush, sample-hold), a filter that sweeps, and a way to repeat or scatter
 * itself (a rattle, a crackle, a chime's echoes). The sound is rendered once to a buffer of samples, from a seed taken
 * from its name, so it is the same on every device, and cached by the caller. Nothing here needs an AudioContext:
 * `renderSfx` returns plain samples (it is tested in node), and `makeBuffer` wraps them for the browser.
 */

export type Wave = 'sine' | 'triangle' | 'saw' | 'square' | 'noise';

/** One voice. Times are seconds, pitches Hz, pitch changes semitones. */
export interface Zz {
  wave?: Wave;
  /** The pitch at the start; for noise, the rate it is sampled and held at (0: plain white noise). */
  freq?: number;
  /** The pitch change over the voice's life, semitones. */
  slide?: number;
  /** The slide's shape: 1 steady, below 1 fast at first, above 1 late. */
  curve?: number;
  /** A jump of the pitch part way through: [fraction of the voice, semitones]. */
  jump?: readonly [number, number];
  attack?: number;
  hold?: number;
  decay?: number;
  /** The decay's shape: 1 straight down, 2 (the default) rounded, higher is a sharper knock. */
  shape?: number;
  /** [Hz, semitones]. */
  vib?: readonly [number, number];
  /** [Hz, depth 0..1]. */
  trem?: readonly [number, number];
  /** Noise mixed into a tone, 0..1. */
  noise?: number;
  /** A square's pulse width. */
  duty?: number;
  /** Frequency modulation: [ratio to the pitch, index]. */
  fm?: readonly [number, number];
  /** Bit-crush to this many bits (0: off). */
  crush?: number;
  /** Sample-and-hold: keep every n-th sample. */
  down?: number;
  filter?: { type: 'lp' | 'hp' | 'bp'; hz: number; to?: number; q?: number };
  gain?: number;
  /** Seconds before the voice starts. */
  delay?: number;
  /** [times, gap in seconds, gain left at each next time (default 1)]. */
  repeat?: readonly [number, number, number?];
  /** Copies at random moments: [count, span in seconds, pitch jitter in semitones]. */
  scatter?: readonly [number, number, number?];
}

/** A sound: its voices and the level its loudest moment is brought to. */
export interface Sfx {
  level: number;
  voices: readonly Zz[];
}

const fx = (level: number, ...voices: Zz[]): Sfx => ({ level, voices });

/** The notes of a run (an arpeggio, a chime): one voice each, `gap` seconds apart; the last rings on. */
function run(freqs: readonly number[], gap: number, base: Zz, lastDecay: number, start = 0): Zz[] {
  return freqs.map((freq, i) => ({
    ...base,
    freq,
    delay: start + i * gap,
    decay: i === freqs.length - 1 ? lastDecay : base.decay,
  }));
}

/* White noise from a seed: a sound is the same on every device. */
function randomFrom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const TAU = Math.PI * 2;

/** The seconds a voice sounds once, delay not counted. */
export const voiceLength = (v: Zz): number => (v.attack ?? 0.002) + (v.hold ?? 0) + (v.decay ?? 0.1);

/** The seconds a voice and its repeats and scatterings last, delay counted. */
export function voiceSpan(v: Zz): number {
  const once = voiceLength(v);
  const repeats = v.repeat ? (v.repeat[0] - 1) * v.repeat[1] : 0;
  const scatter = v.scatter ? v.scatter[1] : 0;
  return (v.delay ?? 0) + Math.max(repeats, scatter) + once;
}

/** A state-variable filter (Chamberlin): safe to sweep. */
function makeFilter(type: 'lp' | 'hp' | 'bp', rate: number): (x: number, hz: number, q: number) => number {
  let low = 0;
  let band = 0;
  return (x, hz, q) => {
    const f = 2 * Math.sin((Math.PI * Math.min(Math.max(hz, 20), rate * 0.12)) / rate);
    const damp = 1 / Math.min(8, Math.max(0.5, q));
    low += f * band;
    const high = x - low - damp * band;
    band += f * high;
    return type === 'lp' ? low : type === 'hp' ? high : band * damp;
  };
}

/** One voice, once: its samples, from the first to the last. */
export function renderVoice(v: Zz, rate: number, random: () => number, pitchShift = 0): Float32Array {
  const attack = Math.max(0.0005, v.attack ?? 0.002);
  const hold = v.hold ?? 0;
  const decay = Math.max(0.001, v.decay ?? 0.1);
  const total = attack + hold + decay;
  const n = Math.max(1, Math.ceil(total * rate));
  const out = new Float32Array(n);
  const wave = v.wave ?? 'sine';
  const shape = v.shape ?? 2;
  const freq = v.freq ?? 440;
  const filter = v.filter ? makeFilter(v.filter.type, rate) : null;
  const levels = v.crush ? 2 ** Math.max(1, v.crush - 1) : 0;
  const down = Math.max(1, Math.round(v.down ?? 1));
  let phase = 0;
  let modPhase = 0;
  let noiseHeld = 0;
  let noiseFor = 0;
  let held = 0;
  let sampled = 0;
  // Pitch and filter move at a control rate (every 8 samples), as in any synth: the powers are not worked out per sample.
  let hz = freq;
  let cutoff = v.filter?.hz ?? 0;
  const decayShape = shape === 2 ? 0 : shape;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const u = t / total;
    if ((i & 7) === 0) {
      // The pitch, in semitones from the start.
      let semis = pitchShift + (v.slide ? v.slide * u ** (v.curve ?? 1) : 0);
      if (v.jump && u >= v.jump[0]) semis += v.jump[1];
      if (v.vib) semis += Math.sin(TAU * v.vib[0] * t) * v.vib[1];
      hz = freq * 2 ** (semis / 12);
      if (v.filter) cutoff = v.filter.hz * ((v.filter.to ?? v.filter.hz) / v.filter.hz) ** u;
    }
    let s: number;
    if (wave === 'noise') {
      if (hz > 0 && v.freq) {
        noiseFor += hz / rate;
        if (noiseFor >= 1 || i === 0) {
          noiseFor %= 1;
          noiseHeld = random() * 2 - 1;
        }
        s = noiseHeld;
      } else {
        s = random() * 2 - 1;
      }
    } else {
      phase += hz / rate;
      phase -= Math.floor(phase);
      let p = phase;
      if (v.fm) {
        modPhase += (hz * v.fm[0]) / rate;
        p += (v.fm[1] * Math.sin(TAU * modPhase)) / TAU;
        p -= Math.floor(p);
      }
      s =
        wave === 'sine' ? Math.sin(TAU * p)
        : wave === 'triangle' ? 1 - 4 * Math.abs(p - 0.5)
        : wave === 'saw' ? 2 * p - 1
        : (p < (v.duty ?? 0.5) ? 1 : -1) - (2 * (v.duty ?? 0.5) - 1);
      if (v.noise) s = s * (1 - v.noise) + (random() * 2 - 1) * v.noise;
    }
    if (down > 1) {
      if (sampled % down === 0) held = s;
      sampled++;
      s = held;
    }
    if (filter && v.filter) s = filter(s, cutoff, v.filter.q ?? 0.8);
    if (levels) s = Math.round(s * levels) / levels;
    // The envelope.
    let env: number;
    if (t < attack) env = t / attack;
    else if (t < attack + hold) env = 1;
    else {
      const k = 1 - (t - attack - hold) / decay;
      env = decayShape ? k ** decayShape : k * k;
    }
    if (v.trem) env *= 1 - v.trem[1] * (0.5 + 0.5 * Math.sin(TAU * v.trem[0] * t));
    out[i] = s * env * (v.gain ?? 1);
  }
  return out;
}

/** The samples of a sound at this rate, brought to its level; same every time for the same seed. */
export function renderSfx(def: Sfx, rate: number, seed: number): Float32Array {
  const random = randomFrom(seed);
  // Where each copy of each voice goes: [voice, start in seconds, gain, pitch shift].
  const parts: Array<{ v: Zz; at: number; gain: number; shift: number }> = [];
  for (const v of def.voices) {
    const delay = v.delay ?? 0;
    if (v.scatter) {
      const [count, span, jitter = 0] = v.scatter;
      for (let i = 0; i < count; i++) {
        parts.push({ v, at: delay + random() * span, gain: 0.35 + 0.65 * random(), shift: (random() * 2 - 1) * jitter });
      }
    } else if (v.repeat) {
      const [times, gap, fall = 1] = v.repeat;
      for (let i = 0; i < times; i++) parts.push({ v, at: delay + i * gap, gain: fall ** i, shift: 0 });
    } else {
      parts.push({ v, at: delay, gain: 1, shift: 0 });
    }
  }
  let seconds = 0;
  for (const v of def.voices) seconds = Math.max(seconds, voiceSpan(v));
  const length = Math.max(1, Math.ceil(seconds * rate) + 1);
  const mix = new Float32Array(length);
  for (const part of parts) {
    const samples = renderVoice(part.v, rate, random, part.shift);
    const from = Math.round(part.at * rate);
    for (let i = 0; i < samples.length && from + i < length; i++) mix[from + i]! += samples[i]! * part.gain;
  }
  // No click at the end, and the loudest moment brought to the sound's level.
  const fade = Math.min(length, Math.round(rate * 0.004));
  for (let i = 0; i < fade; i++) mix[length - 1 - i]! *= i / fade;
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const x = mix[i]!;
    if (!Number.isFinite(x)) mix[i] = 0;
    else peak = Math.max(peak, Math.abs(x));
  }
  if (peak > 0) {
    const scale = def.level / peak;
    for (let i = 0; i < length; i++) mix[i]! *= scale;
  }
  return mix;
}

/** A sound's buffer for this context. */
export function makeBuffer(ctx: BaseAudioContext, def: Sfx, name: string): AudioBuffer {
  const samples = renderSfx(def, ctx.sampleRate, seedOf(name));
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buffer.getChannelData(0).set(samples);
  return buffer;
}

/* The sounds. */

const lp = (hz: number, to?: number, q?: number): Zz['filter'] => ({ type: 'lp', hz, to, q });
const hp = (hz: number, to?: number, q?: number): Zz['filter'] => ({ type: 'hp', hz, to, q });
const bp = (hz: number, to?: number, q?: number): Zz['filter'] => ({ type: 'bp', hz, to, q });

export const SFX = {
  /* Blows. */
  // A blade: a hiss of steel, the body's give.
  hit: fx(0.8,
    { wave: 'noise', filter: bp(3200, 700, 1.2), decay: 0.09, shape: 3 },
    { wave: 'square', freq: 240, slide: -20, decay: 0.08, crush: 5, gain: 0.5 },
    { wave: 'sine', freq: 130, slide: -14, decay: 0.07, gain: 0.5 }),
  // A club, a hammer, a fist: low and round.
  thump: fx(0.85,
    { wave: 'sine', freq: 190, slide: -24, decay: 0.2 },
    { wave: 'noise', filter: lp(1400, 250), decay: 0.07, gain: 0.8 },
    { wave: 'noise', filter: bp(700, 400, 1), decay: 0.04, gain: 0.5 },
    { wave: 'triangle', freq: 120, slide: -12, decay: 0.14, crush: 6, gain: 0.5 }),
  // A heavy blow: steel, a boom under it, and a ring.
  crit: fx(0.95,
    { wave: 'noise', filter: hp(1800), decay: 0.1, gain: 0.8 },
    { wave: 'square', freq: 520, slide: -30, decay: 0.12, crush: 5, gain: 0.5 },
    { wave: 'sine', freq: 100, slide: -28, decay: 0.32 },
    { wave: 'sine', freq: 2400, jump: [0.3, 7], delay: 0.03, decay: 0.25, gain: 0.25 },
    { wave: 'noise', filter: lp(1500, 150), delay: 0.02, decay: 0.28, gain: 0.6 }),
  miss: fx(0.5, { wave: 'noise', filter: bp(500, 2600, 1.4), attack: 0.06, decay: 0.12, shape: 1.5 }),

  /* Feet and doors. */
  step: fx(0.5,
    { wave: 'noise', filter: lp(1800, 400), decay: 0.055 },
    { wave: 'sine', freq: 170, slide: -12, decay: 0.06, gain: 0.5 },
    { wave: 'noise', filter: hp(3500), decay: 0.008, gain: 0.25 }),
  stepGrass: fx(0.45, { wave: 'noise', filter: bp(1800, 3200, 0.8), attack: 0.02, decay: 0.1, shape: 1.7 }),
  stepWood: fx(0.55,
    { wave: 'sine', freq: 260, slide: -10, decay: 0.08 },
    { wave: 'noise', filter: lp(2600), decay: 0.05, gain: 0.7 },
    { wave: 'sine', freq: 480, decay: 0.03, gain: 0.2 }),
  water: fx(0.6,
    { wave: 'noise', filter: bp(700, 2600, 1), attack: 0.01, decay: 0.16, gain: 0.8 },
    { wave: 'sine', freq: 420, slide: 14, delay: 0.035, decay: 0.07, gain: 0.4 },
    { wave: 'sine', freq: 620, slide: 10, delay: 0.075, decay: 0.06, gain: 0.3 }),
  rustle: fx(0.45, { wave: 'noise', filter: bp(1500, 3500, 0.9), attack: 0.03, decay: 0.2, shape: 1.8, trem: [26, 0.35] }),
  // A dry wooden latch knock, then a short thin creak up high; nothing low (no thump under 200 Hz). Quiet.
  door_open: fx(0.4,
    { wave: 'noise', filter: bp(1700, undefined, 2.2), attack: 0.001, decay: 0.012, shape: 3 },
    { wave: 'triangle', freq: 640, slide: -5, attack: 0.001, decay: 0.014, shape: 3, gain: 0.35 },
    { wave: 'saw', freq: 560, slide: 2.5, vib: [17, 0.45], noise: 0.12, filter: bp(1150, 1500, 6), delay: 0.03, attack: 0.025, hold: 0.07, decay: 0.12, gain: 0.55 },
    { wave: 'noise', filter: bp(2100, 1700, 9), delay: 0.04, attack: 0.03, hold: 0.04, decay: 0.1, gain: 0.3 }),
  // A key turned in a lock that gives way: a metal tick and tock, a short high creak, the bolt's clack.
  door_locked: fx(0.4,
    { wave: 'noise', filter: bp(3600, undefined, 4), attack: 0.001, decay: 0.01, shape: 3 },
    { wave: 'square', freq: 1900, slide: -3, attack: 0.001, decay: 0.012, shape: 3, gain: 0.25 },
    { wave: 'noise', filter: bp(2600, undefined, 4), delay: 0.07, attack: 0.001, decay: 0.014, shape: 3, gain: 0.9 },
    { wave: 'saw', freq: 700, slide: 2, vib: [15, 0.4], filter: bp(1500, 1300, 6), delay: 0.12, attack: 0.02, hold: 0.04, decay: 0.09, gain: 0.35 }),
  // A door pushed to: a short soft creak on the way, then the dry knock of the leaf meeting its frame.
  door_close: fx(0.35,
    { wave: 'saw', freq: 620, slide: -2.5, vib: [16, 0.4], filter: bp(1250, 1000, 6), attack: 0.02, hold: 0.04, decay: 0.08, gain: 0.35 },
    { wave: 'noise', filter: bp(1400, undefined, 2), delay: 0.12, attack: 0.001, decay: 0.014, shape: 3 },
    { wave: 'triangle', freq: 520, slide: -6, delay: 0.12, attack: 0.001, decay: 0.016, shape: 3, gain: 0.3 }),
  creak: fx(0.6,
    { wave: 'saw', freq: 205, vib: [8.5, 3], trem: [23, 0.6], filter: bp(400, 1500, 4), attack: 0.03, hold: 0.25, decay: 0.2 },
    { wave: 'square', freq: 213, vib: [11, 2], filter: bp(500, 1200, 3), attack: 0.04, hold: 0.2, decay: 0.2, gain: 0.5 }),
  thud: fx(0.8,
    { wave: 'sine', freq: 130, slide: -26, decay: 0.25 },
    { wave: 'noise', filter: lp(700), decay: 0.05, gain: 0.7 },
    { wave: 'noise', filter: hp(3000), delay: 0.045, decay: 0.01, gain: 0.5 }),
  knock: fx(0.7,
    { wave: 'sine', freq: 230, slide: -14, decay: 0.06 },
    { wave: 'noise', filter: bp(1400, undefined, 1.5), decay: 0.03, gain: 0.6 }),
  unlock: fx(0.6,
    { wave: 'noise', filter: bp(2800, undefined, 3), decay: 0.02 },
    { wave: 'noise', filter: bp(2400, undefined, 3), delay: 0.09, decay: 0.025 },
    { wave: 'sine', freq: 1100, delay: 0.02, decay: 0.16, gain: 0.25 },
    { wave: 'sine', freq: 1650, delay: 0.11, decay: 0.2, gain: 0.2 }),

  /* Things taken, spent and found. */
  coin: fx(0.55,
    { wave: 'square', freq: 987.8, hold: 0.05, decay: 0.02, gain: 0.5 },
    { wave: 'square', freq: 1318.5, delay: 0.06, decay: 0.38, gain: 0.5 }),
  gold: fx(0.7,
    { wave: 'square', freq: 1318.5, hold: 0.05, decay: 0.03, gain: 0.5 },
    { wave: 'square', freq: 1760, delay: 0.06, decay: 0.45, gain: 0.4 },
    { wave: 'sine', freq: 3520, delay: 0.06, decay: 0.3, gain: 0.2 },
    { wave: 'sine', freq: 3000, decay: 0.05, delay: 0.08, scatter: [4, 0.3, 5], gain: 0.2 }),
  item: fx(0.6,
    { wave: 'triangle', freq: 520, jump: [0.5, 7], hold: 0.05, decay: 0.07 },
    { wave: 'square', freq: 1040, duty: 0.25, jump: [0.5, 7], hold: 0.05, decay: 0.07, gain: 0.25 }),
  drink: fx(0.6,
    { wave: 'sine', freq: 330, slide: -10, fm: [2, 1.2], decay: 0.1 },
    { wave: 'sine', freq: 380, slide: -10, fm: [2, 1.2], delay: 0.12, decay: 0.1 },
    { wave: 'sine', freq: 300, slide: -9, fm: [2, 1.2], delay: 0.26, decay: 0.12 },
    { wave: 'noise', filter: lp(600), attack: 0.05, hold: 0.15, decay: 0.2, gain: 0.3 }),
  eat: fx(0.55,
    { wave: 'noise', filter: bp(1600, 900, 1), decay: 0.05, scatter: [3, 0.28] },
    { wave: 'sine', freq: 200, decay: 0.04, gain: 0.3, scatter: [3, 0.28] }),
  read: fx(0.5,
    { wave: 'noise', filter: bp(2500, 1400, 0.8), attack: 0.05, decay: 0.2, gain: 0.8 },
    { wave: 'sine', freq: 660, slide: 12, trem: [9, 0.4], attack: 0.08, decay: 0.35, gain: 0.35 },
    { wave: 'sine', freq: 990, slide: 7, delay: 0.08, attack: 0.08, decay: 0.3, gain: 0.25 }),
  bones: fx(0.6,
    { wave: 'noise', filter: bp(2600, 1800, 3), decay: 0.025, scatter: [6, 0.4] },
    { wave: 'sine', freq: 700, decay: 0.02, scatter: [6, 0.4, 8], gain: 0.4 },
    { wave: 'sine', freq: 150, decay: 0.1, gain: 0.2 }),
  // A pocket watch: tick, and a softer tock.
  watch: fx(0.4,
    { wave: 'square', freq: 2300, slide: -8, decay: 0.012, crush: 6, gain: 0.6 },
    { wave: 'sine', freq: 1500, decay: 0.03, gain: 0.25 },
    { wave: 'square', freq: 1800, slide: -8, delay: 0.17, decay: 0.012, crush: 6, gain: 0.4 },
    { wave: 'sine', freq: 1100, delay: 0.17, decay: 0.03, gain: 0.2 }),
  // A soft breath out: a little noise, hushed and low, rising and dying away.
  breath: fx(0.35,
    { wave: 'noise', filter: lp(900, 380, 0.6), attack: 0.18, hold: 0.12, decay: 0.5, shape: 1.6, gain: 0.7 },
    { wave: 'sine', freq: 150, slide: -3, trem: [4, 0.6], attack: 0.2, decay: 0.5, gain: 0.12 }),
  // A search: a swish of the lantern passing over, a rising whisper.
  swish: fx(0.4,
    { wave: 'noise', filter: bp(900, 4200, 1.2), attack: 0.07, hold: 0.06, decay: 0.2, gain: 0.8 },
    { wave: 'sine', freq: 520, slide: 8, curve: 0.7, attack: 0.08, decay: 0.2, gain: 0.12 }),
  // Found: three clear bells, rising, with a sparkle on the last.
  found: fx(0.55,
    ...run([880, 1108.7, 1318.5], 0.07, { wave: 'sine', attack: 0.003, decay: 0.16 }, 0.5),
    { wave: 'triangle', freq: 2637, delay: 0.14, attack: 0.003, decay: 0.3, gain: 0.2 },
    { wave: 'sine', freq: 3520, delay: 0.17, decay: 0.2, gain: 0.08 }),
  sparkle: fx(0.45, ...run([1568, 2093, 2637], 0.06, { wave: 'sine', attack: 0.004, decay: 0.12 }, 0.4)),
  secret: fx(0.55,
    ...run([659.3, 830.6, 987.8, 1244.5], 0.09, { wave: 'sine', vib: [6, 0.15], attack: 0.004, decay: 0.2 }, 0.7),
    ...run([1318.5, 1661.2, 1975.5, 2489], 0.09, { wave: 'triangle', attack: 0.004, decay: 0.12, gain: 0.25 }, 0.5)),
  dewdrop: fx(0.55,
    { wave: 'sine', freq: 1400, slide: 14, curve: 0.7, attack: 0.001, decay: 0.13 },
    { wave: 'sine', freq: 2800, delay: 0.02, decay: 0.1, gain: 0.2 },
    { wave: 'sine', freq: 2093, delay: 0.1, decay: 0.25, gain: 0.3 }),
  equip: fx(0.65,
    { wave: 'noise', filter: bp(1500, 800, 1), attack: 0.02, decay: 0.08, gain: 0.5 },
    { wave: 'sine', freq: 140, decay: 0.06 },
    { wave: 'sine', freq: 1760, delay: 0.06, decay: 0.12, gain: 0.25 },
    { wave: 'sine', freq: 2640, delay: 0.06, decay: 0.08, gain: 0.15 }),

  /* The interface. */
  click: fx(0.5,
    { wave: 'square', freq: 1700, slide: -14, decay: 0.018, crush: 5, gain: 0.8 },
    { wave: 'noise', filter: hp(4000), decay: 0.008, gain: 0.4 }),
  tick: fx(0.4,
    { wave: 'sine', freq: 1900, decay: 0.02 },
    { wave: 'noise', filter: hp(5000), decay: 0.005, gain: 0.3 }),
  pop: fx(0.55, { wave: 'sine', freq: 320, slide: 24, attack: 0.001, decay: 0.08 }),
  quip: fx(0.4,
    { wave: 'triangle', freq: 600, slide: 10, decay: 0.07 },
    { wave: 'sine', freq: 900, slide: 5, delay: 0.05, decay: 0.06, gain: 0.5 }),
  whoosh: fx(0.5, { wave: 'noise', filter: bp(300, 2200, 1), attack: 0.12, decay: 0.2, shape: 1.6 }),
  alert: fx(0.4,
    { wave: 'square', freq: 880, duty: 0.25, hold: 0.06, decay: 0.02, crush: 7 },
    { wave: 'square', freq: 1175, duty: 0.25, delay: 0.09, hold: 0.09, decay: 0.12, crush: 7 }),

  /* The hero. */
  levelup: fx(0.7,
    ...run([523.3, 659.3, 784, 1046.5, 1318.5], 0.07, { wave: 'square', duty: 0.5, attack: 0.003, decay: 0.12, gain: 0.45 }, 0.55),
    ...run([1046.5, 1318.5, 1568, 2093, 2637], 0.07, { wave: 'sine', attack: 0.003, decay: 0.1, gain: 0.3 }, 0.5)),
  death: fx(0.8,
    { wave: 'saw', freq: 392, slide: -20, filter: lp(2500, 200), trem: [7, 0.3], attack: 0.01, hold: 0.1, decay: 0.9, gain: 0.7 },
    { wave: 'square', freq: 196, slide: -12, delay: 0.12, decay: 0.7, crush: 6, gain: 0.3 },
    { wave: 'noise', filter: lp(500), decay: 0.4, gain: 0.3 }),
  descend: fx(0.6,
    { wave: 'triangle', freq: 330, slide: -14, attack: 0.01, hold: 0.12, decay: 0.35 },
    { wave: 'triangle', freq: 220, slide: -10, delay: 0.22, decay: 0.3, gain: 0.8 },
    { wave: 'sine', freq: 140, slide: -12, decay: 0.1, repeat: [3, 0.22], gain: 0.5 }),
  // Up the stairs: the descent turned over.
  ascend: fx(0.6,
    { wave: 'triangle', freq: 220, slide: 14, attack: 0.01, hold: 0.12, decay: 0.35 },
    { wave: 'triangle', freq: 330, slide: 10, delay: 0.22, decay: 0.3, gain: 0.8 },
    { wave: 'sine', freq: 140, slide: -12, decay: 0.1, repeat: [3, 0.22], gain: 0.5 }),
  // The Amulet: a deep bell and a shimmer of high ones, a cold breath under them.
  amulet: fx(0.8,
    { wave: 'sine', freq: 196, fm: [2.01, 2], decay: 1.6, shape: 2.5 },
    { wave: 'sine', freq: 98, decay: 1.8, shape: 2, gain: 0.8 },
    ...run([1568, 2349, 3136, 2349], 0.13, { wave: 'sine', trem: [7, 0.3], decay: 0.5, gain: 0.25 }, 1.1, 0.15),
    { wave: 'noise', filter: bp(900, 300, 1), attack: 0.4, decay: 1.2, gain: 0.15 }),
  falling: fx(0.55,
    { wave: 'sine', freq: 1100, slide: -30, curve: 0.8, vib: [7, 0.8], attack: 0.02, hold: 0.5, decay: 0.6 },
    { wave: 'noise', filter: bp(800, undefined, 1), attack: 0.1, hold: 0.3, decay: 0.6, gain: 0.2 }),

  /* Magic. */
  teleport: fx(0.7,
    { wave: 'sine', freq: 220, slide: 30, fm: [2, 3], attack: 0.02, hold: 0.12, decay: 0.3, gain: 0.8 },
    { wave: 'sine', freq: 1800, slide: -24, delay: 0.1, decay: 0.35, gain: 0.3 },
    { wave: 'noise', filter: hp(4000), trem: [30, 0.5], decay: 0.35, gain: 0.25 }),
  evoke: fx(0.65,
    { wave: 'saw', freq: 180, slide: 24, filter: lp(400, 3000), attack: 0.1, hold: 0.2, decay: 0.3, gain: 0.7 },
    { wave: 'sine', freq: 880, vib: [6, 0.3], delay: 0.2, decay: 0.5, gain: 0.3 },
    { wave: 'sine', freq: 2000, decay: 0.1, delay: 0.1, scatter: [6, 0.5, 12], gain: 0.15 }),
  beacon: fx(0.6,
    { wave: 'sine', freq: 880, fm: [1.5, 2], decay: 0.6 },
    { wave: 'sine', freq: 1320, fm: [1.5, 2], delay: 0.18, decay: 0.6, gain: 0.8 }),
  ghost: fx(0.55,
    { wave: 'sine', freq: 480, slide: -5, vib: [5.5, 1.2], trem: [3, 0.4], attack: 0.18, hold: 0.15, decay: 0.6 },
    { wave: 'sine', freq: 722, vib: [5.5, 1.5], attack: 0.2, decay: 0.6, gain: 0.35 },
    { wave: 'noise', filter: bp(1200, undefined, 1), attack: 0.2, decay: 0.6, gain: 0.15 }),
  cursed: fx(0.75,
    { wave: 'saw', freq: 98, slide: -5, filter: lp(700, 200), trem: [5, 0.4], decay: 0.9 },
    { wave: 'saw', freq: 104, slide: -5, filter: lp(700, 200), trem: [5, 0.4], decay: 0.9, gain: 0.8 },
    { wave: 'noise', filter: bp(300, undefined, 1), decay: 0.5, gain: 0.3 },
    { wave: 'sine', freq: 880, slide: -12, delay: 0.1, decay: 0.4, gain: 0.15 }),
  // The bolts of the wands, one to a kind.
  zap: fx(0.65,
    { wave: 'square', freq: 1300, duty: 0.25, slide: -26, curve: 0.6, decay: 0.2, crush: 8, gain: 0.8 },
    { wave: 'sine', freq: 2600, slide: -30, decay: 0.12, gain: 0.3 },
    { wave: 'noise', filter: hp(5000), decay: 0.04, gain: 0.2 }),
  zapFire: fx(0.75,
    { wave: 'noise', filter: bp(1200, 300, 1), attack: 0.03, hold: 0.08, decay: 0.3, gain: 0.9 },
    { wave: 'saw', freq: 600, slide: -20, filter: lp(2000), decay: 0.25, gain: 0.4 },
    { wave: 'noise', filter: hp(3000), decay: 0.012, scatter: [8, 0.35], gain: 0.5 }),
  zapPoison: fx(0.65,
    { wave: 'sine', freq: 300, slide: -12, vib: [18, 2], decay: 0.3 },
    { wave: 'noise', filter: bp(600, 200, 1.5), decay: 0.3, gain: 0.5 },
    { wave: 'sine', freq: 500, slide: 10, decay: 0.04, scatter: [4, 0.25, 3], gain: 0.5 }),
  zapSlow: fx(0.65,
    { wave: 'triangle', freq: 700, slide: -30, fm: [1, 1.5], decay: 0.5 },
    { wave: 'sine', freq: 350, slide: -24, delay: 0.05, decay: 0.5, gain: 0.8 }),
  zapBlink: fx(0.6,
    { wave: 'sine', freq: 400, slide: 40, curve: 0.5, decay: 0.12 },
    { wave: 'noise', filter: hp(4000), decay: 0.08, gain: 0.4 },
    { wave: 'sine', freq: 1600, slide: 20, delay: 0.08, decay: 0.1, gain: 0.5 }),
  zapBeam: fx(0.8,
    { wave: 'saw', freq: 220, vib: [40, 3], trem: [60, 0.5], filter: lp(3000, 800), attack: 0.01, hold: 0.2, decay: 0.3 },
    { wave: 'sine', freq: 110, hold: 0.25, decay: 0.2, gain: 0.6 },
    { wave: 'noise', filter: hp(2000), crush: 5, hold: 0.15, decay: 0.2, gain: 0.3 }),
  zapShadow: fx(0.6,
    { wave: 'saw', freq: 140, slide: -12, filter: lp(600, 200), trem: [6, 0.3], attack: 0.1, decay: 0.5 },
    { wave: 'noise', filter: bp(400, undefined, 1), attack: 0.1, decay: 0.5, gain: 0.4 }),
  zapAmok: fx(0.55,
    { wave: 'square', freq: 300, slide: 10, vib: [16, 3], crush: 5, attack: 0.02, hold: 0.15, decay: 0.2 },
    { wave: 'saw', freq: 150, vib: [11, 2], filter: lp(1500), hold: 0.15, decay: 0.2, gain: 0.6 },
    { wave: 'noise', filter: bp(1500, undefined, 1), decay: 0.2, gain: 0.3 }),
  zapGrow: fx(0.55,
    { wave: 'sine', freq: 300, slide: 14, attack: 0.1, decay: 0.45 },
    { wave: 'triangle', freq: 450, slide: 14, delay: 0.05, attack: 0.1, decay: 0.4, gain: 0.6 },
    { wave: 'sine', freq: 2400, decay: 0.08, delay: 0.1, scatter: [4, 0.3, 4], gain: 0.2 }),
  zapFlock: fx(0.6,
    { wave: 'saw', freq: 300, slide: -3, vib: [28, 3], filter: bp(900, 700, 5), attack: 0.03, hold: 0.15, decay: 0.15 },
    { wave: 'saw', freq: 270, slide: -3, vib: [28, 3], filter: bp(800, 650, 5), delay: 0.28, attack: 0.03, hold: 0.15, decay: 0.2 }),
  lightning: fx(0.9,
    { wave: 'noise', filter: hp(800), trem: [70, 0.8], crush: 4, attack: 0.001, hold: 0.05, decay: 0.45, gain: 0.9 },
    { wave: 'saw', freq: 2400, slide: -40, decay: 0.09, gain: 0.5 },
    { wave: 'sine', freq: 70, delay: 0.06, decay: 0.4, gain: 0.6 },
    { wave: 'noise', filter: lp(300), delay: 0.08, decay: 0.5, gain: 0.5 },
    { wave: 'noise', filter: hp(3000), decay: 0.015, scatter: [8, 0.25], gain: 0.5 }),
  burning: fx(0.8,
    { wave: 'noise', filter: lp(500, 3500), attack: 0.12, hold: 0.08, decay: 0.5, shape: 1.5 },
    { wave: 'sine', freq: 110, slide: 6, attack: 0.05, decay: 0.35, gain: 0.4 },
    { wave: 'noise', filter: hp(2500), decay: 0.012, scatter: [10, 0.6], gain: 0.5 }),
  blast: fx(0.95,
    { wave: 'noise', filter: lp(4000, 150), attack: 0.003, hold: 0.04, decay: 0.75, shape: 2.5 },
    { wave: 'sine', freq: 90, slide: -30, decay: 0.6 },
    { wave: 'saw', freq: 50, slide: -10, filter: lp(300), decay: 0.5, gain: 0.5 },
    { wave: 'noise', filter: hp(2500), decay: 0.015, delay: 0.08, scatter: [12, 0.7], gain: 0.3 }),
  shatter: fx(0.8,
    { wave: 'noise', filter: hp(3500), decay: 0.3, gain: 0.5 },
    { wave: 'sine', freq: 3000, decay: 0.08, scatter: [10, 0.35, 10], gain: 0.5 }),
  puff: fx(0.6,
    { wave: 'noise', filter: lp(1400, 300), attack: 0.015, decay: 0.28, shape: 1.6 },
    { wave: 'sine', freq: 130, slide: -14, decay: 0.15, gain: 0.5 }),
  rocks: fx(0.8,
    { wave: 'noise', filter: lp(900, 200), hold: 0.05, decay: 0.5 },
    { wave: 'sine', freq: 60, slide: -6, decay: 0.4, gain: 0.8 },
    { wave: 'noise', filter: bp(1500, undefined, 1), decay: 0.03, scatter: [10, 0.5], gain: 0.5 }),
  degrade: fx(0.7,
    { wave: 'noise', filter: hp(1500), decay: 0.15 },
    { wave: 'square', freq: 360, slide: -18, decay: 0.3, crush: 4, gain: 0.5 },
    { wave: 'noise', filter: bp(3000, undefined, 1), decay: 0.02, scatter: [5, 0.3], gain: 0.6 }),
  bee: fx(0.5,
    { wave: 'saw', freq: 190, vib: [9, 0.6], trem: [55, 0.5], noise: 0.1, filter: bp(500, 650, 2.5), attack: 0.03, hold: 0.35, decay: 0.15 }),

  /* Traps. */
  trap: fx(0.7,
    { wave: 'square', freq: 110, slide: -10, decay: 0.05, gain: 0.8 },
    { wave: 'noise', filter: bp(2200, undefined, 1), delay: 0.005, decay: 0.03, gain: 0.6 },
    { wave: 'sine', freq: 1450, delay: 0.04, decay: 0.09, gain: 0.25 },
    { wave: 'noise', filter: hp(5000), delay: 0.08, decay: 0.02, gain: 0.2 }),
  trapGas: fx(0.55,
    { wave: 'noise', filter: bp(3000, 1200, 1), attack: 0.05, hold: 0.3, decay: 0.45 },
    { wave: 'sine', freq: 150, attack: 0.1, hold: 0.2, decay: 0.4, gain: 0.15 }),
  trapGrip: fx(0.8,
    { wave: 'noise', filter: bp(2000, undefined, 2), decay: 0.04, repeat: [2, 0.09] },
    { wave: 'square', freq: 300, slide: -26, decay: 0.08, gain: 0.5, repeat: [2, 0.09] },
    { wave: 'sine', freq: 130, delay: 0.02, decay: 0.14, gain: 0.4 }),
  trapSummon: fx(0.65,
    { wave: 'saw', freq: 120, slide: 12, filter: lp(800), trem: [8, 0.4], attack: 0.15, decay: 0.5 },
    { wave: 'sine', freq: 880, vib: [6, 0.8], delay: 0.2, attack: 0.1, decay: 0.5, gain: 0.3 },
    { wave: 'noise', filter: bp(700, undefined, 1), attack: 0.2, decay: 0.4, gain: 0.3 }),
  // The alarm: a struck bell, three times, each softer than the last (its partials are not whole multiples, as a bell's are not).
  alarm: fx(0.6,
    { wave: 'noise', filter: bp(3200, undefined, 2), attack: 0.001, decay: 0.012, shape: 3, gain: 0.5, repeat: [3, 0.34, 0.8] },
    { wave: 'sine', freq: 740, attack: 0.002, decay: 0.8, shape: 2.5, repeat: [3, 0.34, 0.8] },
    { wave: 'sine', freq: 740 * 2.01, attack: 0.002, decay: 0.55, shape: 2.5, gain: 0.55, repeat: [3, 0.34, 0.8] },
    { wave: 'sine', freq: 740 * 2.76, attack: 0.002, decay: 0.4, shape: 2.5, gain: 0.4, repeat: [3, 0.34, 0.8] },
    { wave: 'sine', freq: 740 * 5.4, attack: 0.002, decay: 0.22, shape: 3, gain: 0.22, repeat: [3, 0.34, 0.8] },
    { wave: 'sine', freq: 370, attack: 0.002, decay: 0.9, shape: 2, gain: 0.3, repeat: [3, 0.34, 0.8] }),

  // The cry of a boss and of champions about to come: a brassy blare falling away over a growl, the hall answering.
  boss: fx(0.9,
    { wave: 'saw', freq: 196, slide: -9, vib: [7, 0.4], filter: lp(2200, 600, 1.4), attack: 0.03, hold: 0.28, decay: 0.7, gain: 0.8 },
    { wave: 'saw', freq: 98, slide: -6, trem: [24, 0.6], filter: lp(900, 400, 2), attack: 0.04, hold: 0.3, decay: 0.7, gain: 0.7 },
    { wave: 'noise', filter: bp(700, 300, 1.2), attack: 0.05, hold: 0.2, decay: 0.55, gain: 0.45 },
    { wave: 'sine', freq: 55, attack: 0.04, hold: 0.3, decay: 0.8, gain: 0.7 }),
  // A badge earned: three bright notes up, a ring after them.
  badge: fx(0.65,
    ...run([880, 1108.7, 1318.5], 0.09, { wave: 'square', duty: 0.25, attack: 0.003, decay: 0.12, gain: 0.35 }, 0.25),
    ...run([1760, 2217.5, 2637], 0.09, { wave: 'sine', attack: 0.003, decay: 0.15, gain: 0.35 }, 0.7),
    { wave: 'sine', freq: 3520, delay: 0.27, decay: 0.5, gain: 0.12 }),

  /* The scrolls' waves. */
  // A roar: a growl in the chest (a saw chopped fast), breath through it, a rumble to close.
  roar: fx(0.95,
    { wave: 'saw', freq: 85, slide: -6, jump: [0.12, 4], trem: [38, 0.9], fm: [2.01, 3], crush: 7, filter: lp(1800, 700, 2), attack: 0.06, hold: 0.5, decay: 0.8 },
    { wave: 'saw', freq: 91, slide: -6, jump: [0.12, 4], trem: [31, 0.8], filter: lp(1200, 500, 2), attack: 0.08, hold: 0.45, decay: 0.8, gain: 0.7 },
    { wave: 'noise', filter: bp(900, 2600, 1.5), attack: 0.1, hold: 0.45, decay: 0.7, gain: 0.75 },
    { wave: 'sine', freq: 55, attack: 0.1, hold: 0.5, decay: 0.9, gain: 0.8 }),
  wail: fx(0.5,
    { wave: 'sine', freq: 700, jump: [0.3, 5], slide: -12, vib: [9, 2.5], attack: 0.1, hold: 0.5, decay: 0.7 },
    { wave: 'saw', freq: 520, jump: [0.3, 5], slide: -10, vib: [9, 2.5], filter: lp(1200), attack: 0.1, hold: 0.5, decay: 0.7, gain: 0.3 }),
  lullaby: fx(0.45,
    ...run([1318.5, 1046.5, 880, 659.3], 0.16, { wave: 'triangle', attack: 0.01, decay: 0.4, gain: 0.6 }, 0.8),
    { wave: 'noise', filter: bp(5000, undefined, 1), attack: 0.2, decay: 0.8, gain: 0.08 }),
  psi: fx(0.9,
    { wave: 'sine', freq: 1200, slide: -36, decay: 0.3, gain: 0.7 },
    { wave: 'noise', filter: hp(3000), decay: 0.15, gain: 0.5 },
    { wave: 'saw', freq: 80, slide: -10, filter: lp(500), decay: 0.4, gain: 0.7 }),

  /* The air of the places. */
  drip: fx(0.5,
    { wave: 'sine', freq: 900, slide: 16, attack: 0.001, decay: 0.12, repeat: [2, 0.12, 0.35] }),
  echoDrip: fx(0.5,
    { wave: 'sine', freq: 780, slide: 16, filter: lp(2600), attack: 0.001, decay: 0.12, repeat: [5, 0.21, 0.55] }),
  trickle: fx(0.4,
    { wave: 'noise', filter: bp(1200, 2200, 1.2), attack: 0.2, hold: 0.3, decay: 0.5, trem: [9, 0.4], gain: 0.7 },
    { wave: 'sine', freq: 500, slide: 12, decay: 0.05, scatter: [6, 1, 8], delay: 0.1, gain: 0.5 }),
  pebble: fx(0.5,
    { wave: 'sine', freq: 1500, decay: 0.03, scatter: [5, 0.3, 8] },
    { wave: 'noise', filter: lp(3500), decay: 0.04, scatter: [5, 0.3], gain: 0.5 }),
  clank: fx(0.6,
    { wave: 'sine', freq: 523, decay: 0.9, shape: 3 },
    { wave: 'sine', freq: 1187, decay: 0.7, shape: 3, gain: 0.7 },
    { wave: 'sine', freq: 1733, decay: 0.5, shape: 3, gain: 0.5 },
    { wave: 'sine', freq: 2417, decay: 0.4, shape: 3, gain: 0.35 },
    { wave: 'noise', filter: hp(3000), decay: 0.01, gain: 0.4 }),
  chain: fx(0.55,
    { wave: 'noise', filter: bp(3500, 2500, 2), decay: 0.03, scatter: [7, 0.55] },
    { wave: 'sine', freq: 1900, decay: 0.06, scatter: [7, 0.55, 10], gain: 0.4 },
    { wave: 'sine', freq: 400, decay: 0.1, gain: 0.3 }),
  hammer: fx(0.6,
    { wave: 'noise', filter: hp(3500), decay: 0.01, gain: 0.5 },
    { wave: 'sine', freq: 1200, decay: 0.6, shape: 3, gain: 0.5 },
    { wave: 'sine', freq: 1730, decay: 0.45, shape: 3, gain: 0.4 },
    { wave: 'sine', freq: 2330, decay: 0.3, shape: 3, gain: 0.3 },
    { wave: 'sine', freq: 640, decay: 0.7, shape: 3 }),
  bellows: fx(0.4, { wave: 'noise', filter: lp(700, 300), attack: 0.35, hold: 0.1, decay: 0.5 }),
  gust: fx(0.4, { wave: 'noise', filter: bp(400, 900, 1), attack: 0.8, hold: 0.2, decay: 1, shape: 1.5 }),
  rumble: fx(0.5,
    { wave: 'triangle', freq: 55, attack: 0.5, hold: 0.4, decay: 0.9 },
    { wave: 'noise', filter: lp(260), attack: 0.5, hold: 0.4, decay: 0.9, gain: 0.8 }),
  sizzle: fx(0.45,
    { wave: 'noise', filter: bp(3500, 6000, 0.8), attack: 0.02, hold: 0.1, decay: 0.4, gain: 0.7 },
    { wave: 'noise', filter: hp(2500), decay: 0.01, scatter: [8, 0.45], gain: 0.5 }),
  crackle: fx(0.5,
    { wave: 'noise', filter: hp(2200), decay: 0.008, shape: 2.5, scatter: [5, 0.3] },
    { wave: 'sine', freq: 1700, decay: 0.012, scatter: [3, 0.3, 14], gain: 0.2 }),
  ember: fx(0.4,
    { wave: 'noise', filter: bp(2500, 900, 1.5), decay: 0.05, shape: 3 },
    { wave: 'sine', freq: 600, slide: -10, decay: 0.04, gain: 0.3 }),

  /* Searching: what the walls answer. */
  // Behind the wall there is a space: a soft knock with a hollow body, and the room answering after it.
  knockHollow: fx(0.6,
    { wave: 'sine', freq: 190, slide: -9, attack: 0.002, decay: 0.12, shape: 2.5 },
    { wave: 'noise', filter: bp(1100, undefined, 1.6), attack: 0.001, decay: 0.025, shape: 3, gain: 0.45 },
    { wave: 'sine', freq: 320, slide: -6, delay: 0.035, attack: 0.004, decay: 0.2, shape: 2.2, gain: 0.35 },
    { wave: 'sine', freq: 245, slide: -5, delay: 0.1, attack: 0.01, decay: 0.28, shape: 2, gain: 0.16 }),
  // Solid stone: a short dull tap, nothing under it, nothing after it.
  knockSolid: fx(0.5,
    { wave: 'noise', filter: lp(1500, 300), attack: 0.001, decay: 0.045, shape: 3 },
    { wave: 'sine', freq: 120, slide: -14, attack: 0.001, decay: 0.05, shape: 3, gain: 0.5 }),

  /* Weak things made vivid. */
  // A sheep: a nasal, wavering baa that sags at the end.
  bleat: fx(0.55,
    { wave: 'saw', freq: 360, slide: -3, jump: [0.55, -2], vib: [26, 2.4], filter: bp(950, 640, 3.2), attack: 0.03, hold: 0.16, decay: 0.2 },
    { wave: 'saw', freq: 372, slide: -3, jump: [0.55, -2], vib: [24, 2], filter: bp(1500, 1000, 3), attack: 0.03, hold: 0.14, decay: 0.18, gain: 0.35 },
    { wave: 'noise', filter: bp(2200, undefined, 1.5), attack: 0.04, hold: 0.12, decay: 0.2, gain: 0.08 }),
  // A spike from the ring: a thin tick and a short bright ping.
  thorns: fx(0.5,
    { wave: 'noise', filter: hp(4500), attack: 0.001, decay: 0.012, shape: 3 },
    { wave: 'triangle', freq: 2300, slide: -10, attack: 0.001, decay: 0.07, shape: 3, gain: 0.5 },
    { wave: 'sine', freq: 3400, delay: 0.012, attack: 0.001, decay: 0.12, gain: 0.2 }),
  // The psionic blast gathering: a whine that climbs and tightens, before the blast itself.
  psiWarn: fx(0.65,
    { wave: 'sine', freq: 380, slide: 28, curve: 1.6, trem: [22, 0.5], attack: 0.01, hold: 0.1, decay: 0.08 },
    { wave: 'triangle', freq: 760, slide: 28, curve: 1.6, attack: 0.03, hold: 0.1, decay: 0.06, gain: 0.35 }),
  // Purity: air clearing, bells rising through it.
  purify: fx(0.5,
    { wave: 'noise', filter: bp(1800, 5200, 0.9), attack: 0.1, hold: 0.1, decay: 0.45, shape: 1.6, gain: 0.35 },
    ...run([1046.5, 1318.5, 1568, 2093], 0.08, { wave: 'sine', attack: 0.004, decay: 0.2, gain: 0.5 }, 0.55, 0.05)),
  // A mirror image arriving: glass shivering in, a bright shimmer settling.
  shimmer: fx(0.5,
    { wave: 'sine', freq: 2600, slide: -8, fm: [1.5, 2], attack: 0.04, hold: 0.06, decay: 0.3, gain: 0.5 },
    { wave: 'sine', freq: 3300, decay: 0.12, scatter: [8, 0.35, 8], gain: 0.25 },
    { wave: 'sine', freq: 1320, slide: 6, delay: 0.1, decay: 0.3, gain: 0.3 }),
  // Floating up: a soft rising breath with a little air in it.
  levitate: fx(0.45,
    { wave: 'sine', freq: 330, slide: 14, trem: [6, 0.3], attack: 0.1, hold: 0.1, decay: 0.4 },
    { wave: 'noise', filter: bp(700, 1800, 1), attack: 0.15, hold: 0.1, decay: 0.35, gain: 0.25 }),
  // An armour's glyph flaring: a short rune-chime, two tones and a spark.
  glyph: fx(0.45,
    { wave: 'triangle', freq: 1175, slide: 4, attack: 0.002, decay: 0.09 },
    { wave: 'sine', freq: 1760, delay: 0.045, attack: 0.002, decay: 0.16, gain: 0.5 },
    { wave: 'noise', filter: hp(5000), decay: 0.008, delay: 0.04, gain: 0.2 }),
  // A heavy sheet of stillness slowing a creature: a low sag with a sticky drip in it.
  slowed: fx(0.45,
    { wave: 'triangle', freq: 520, slide: -26, fm: [1, 1.2], decay: 0.4 },
    { wave: 'sine', freq: 260, slide: -18, delay: 0.04, decay: 0.45, gain: 0.5 }),

  /* The places. */
  // The three wells, each its own: warm and low (health), clear and glassy (awareness), swirling and odd (transmutation).
  wellHealth: fx(0.5,
    ...run([392, 523.3, 659.3], 0.11, { wave: 'sine', attack: 0.01, decay: 0.5, gain: 0.55 }, 0.9),
    { wave: 'triangle', freq: 196, attack: 0.05, hold: 0.2, decay: 0.7, gain: 0.3 }),
  wellAware: fx(0.5,
    ...run([1318.5, 1760, 2349], 0.09, { wave: 'sine', attack: 0.003, decay: 0.45, gain: 0.5 }, 0.8),
    { wave: 'sine', freq: 3136, delay: 0.12, decay: 0.2, scatter: [4, 0.5, 5], gain: 0.15 }),
  wellChange: fx(0.5,
    { wave: 'sine', freq: 440, slide: 12, fm: [1.41, 3], vib: [5, 1.5], attack: 0.05, hold: 0.25, decay: 0.55 },
    { wave: 'sine', freq: 660, slide: -9, fm: [1.41, 2], vib: [6, 1.2], delay: 0.08, attack: 0.05, hold: 0.2, decay: 0.5, gain: 0.5 },
    { wave: 'sine', freq: 1900, decay: 0.07, scatter: [5, 0.7, 12], gain: 0.15 }),
  // The pot bubbling: a low gurgle and a handful of pops, each higher than it began.
  bubble: fx(0.45,
    { wave: 'noise', filter: lp(500, 250, 1), attack: 0.1, hold: 0.25, decay: 0.3, trem: [14, 0.6], gain: 0.5 },
    { wave: 'sine', freq: 420, slide: 16, attack: 0.001, decay: 0.07, scatter: [5, 0.7, 9], gain: 0.7 }),
  // The brew done: the bubbling, then a clear rising chime.
  brewDone: fx(0.55,
    { wave: 'sine', freq: 380, slide: 16, attack: 0.001, decay: 0.07, scatter: [4, 0.3, 8], gain: 0.5 },
    ...run([784, 987.8, 1175, 1568], 0.07, { wave: 'sine', attack: 0.004, decay: 0.18, gain: 0.5 }, 0.5, 0.25)),
  // The altar's fire: a low roar with crackle in it.
  altarFire: fx(0.5,
    { wave: 'noise', filter: lp(420, 260, 0.8), attack: 0.2, hold: 0.4, decay: 0.6, shape: 1.6, trem: [9, 0.35] },
    { wave: 'sine', freq: 62, attack: 0.2, hold: 0.4, decay: 0.6, gain: 0.5 },
    { wave: 'noise', filter: hp(2400), decay: 0.01, shape: 2.5, scatter: [7, 1], gain: 0.4 }),
  // The fire takes the offering: a deep chord and a rise of sparks.
  altarAccept: fx(0.7,
    { wave: 'sine', freq: 130.8, attack: 0.02, hold: 0.2, decay: 1.1, gain: 0.8 },
    { wave: 'sine', freq: 196, attack: 0.04, hold: 0.2, decay: 1, gain: 0.5 },
    { wave: 'triangle', freq: 261.6, attack: 0.06, hold: 0.2, decay: 0.9, gain: 0.35 },
    ...run([784, 1046.5, 1318.5, 1568], 0.1, { wave: 'sine', attack: 0.004, decay: 0.3, gain: 0.25 }, 0.6, 0.15),
    { wave: 'noise', filter: hp(2600), decay: 0.01, scatter: [10, 0.9], gain: 0.3 }),
  // Refused: the flame gutters, a low sour note.
  altarRefuse: fx(0.55,
    { wave: 'saw', freq: 110, slide: -6, filter: lp(600, 220), attack: 0.02, hold: 0.1, decay: 0.5, gain: 0.7 },
    { wave: 'noise', filter: lp(800, 200), attack: 0.02, decay: 0.4, gain: 0.5 }),
  // The statue stirring: stone grinding, cracks snapping through it, a rumble underneath.
  stoneCrack: fx(0.75,
    { wave: 'noise', filter: bp(900, 280, 2.5), attack: 0.05, hold: 0.45, decay: 0.3, trem: [34, 0.7], gain: 0.7 },
    { wave: 'noise', filter: hp(2500), decay: 0.012, shape: 3, scatter: [9, 0.7], gain: 0.7 },
    { wave: 'sine', freq: 52, slide: 4, attack: 0.1, hold: 0.45, decay: 0.4, gain: 0.8 },
    { wave: 'sine', freq: 1500, decay: 0.03, scatter: [4, 0.6, 14], gain: 0.15 }),
  // The statue awake: stone breaking away, a heavy step.
  stoneAwake: fx(0.9,
    { wave: 'noise', filter: lp(2200, 150), attack: 0.002, hold: 0.04, decay: 0.55, shape: 2.2 },
    { wave: 'sine', freq: 70, slide: -28, attack: 0.002, decay: 0.45, gain: 0.9 },
    { wave: 'noise', filter: bp(1500, undefined, 1), decay: 0.03, scatter: [10, 0.5], delay: 0.03, gain: 0.5 },
    { wave: 'sine', freq: 392, delay: 0.02, decay: 0.5, gain: 0.12 }),
  // Pages turned: two dry flaps of paper.
  pages: fx(0.3,
    { wave: 'noise', filter: bp(3200, 1800, 1.1), attack: 0.012, decay: 0.07, shape: 1.8, repeat: [2, 0.13, 0.6] }),
  // The prize on its pedestal: a slow, thin shimmer.
  shine: fx(0.35,
    { wave: 'sine', freq: 2093, attack: 0.02, decay: 0.55, shape: 2.5 },
    { wave: 'sine', freq: 3136, delay: 0.08, attack: 0.02, decay: 0.45, shape: 2.5, gain: 0.5 },
    { wave: 'sine', freq: 4186, delay: 0.17, attack: 0.02, decay: 0.3, shape: 2.5, gain: 0.25 }),
} as const satisfies Record<string, Sfx>;

export type SfxName = keyof typeof SFX;

export const SFX_NAMES = Object.keys(SFX) as SfxName[];

export const hasSfx = (name: string): name is SfxName => Object.hasOwn(SFX, name);
