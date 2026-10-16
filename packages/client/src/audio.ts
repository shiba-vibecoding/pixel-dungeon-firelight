import { onPause, onResume, paused } from './lifecycle';
import { MusicPlayer, planLayers, type LayerPlan, SONGS, type SongName, songLength, type StingerName } from './music';
import { type Place, heard } from './spatial';
import { hasSfx, makeBuffer, SFX, type SfxName } from './sfx-synth';

/*
 * Sound effects, music and the dungeon's own air.
 *
 * Everything goes through one Web Audio graph: sounds, music and ambience have
 * their own levels (the music's and the sounds' are the player's to set), and
 * meet in a compressor so that a fight never clips. A sound can come from a
 * place in the world: it is then panned to the side it came from, quieter and
 * duller the farther it is from the hero. No sound plays twice the same: pitch and
 * level wander a little, and a sound piling up on itself is thinned out.
 *
 * Firelight makes its own sounds (sfx-synth.ts): every effect is rendered once from a few
 * numbers and kept, so nothing is downloaded. The original's samples stay as files for the
 * two that are iconic (the boss's cry and the badge's chime), and for the player who sets
 * «Sounds: original» (then the whole set, and the original's title and dungeon tunes, are
 * fetched and played in place of ours). Each region has its air as well: a fire's crackle at
 * the camp, running water and drips in the sewers, the prison's hum and chains, wind and
 * falling pebbles in the caves, the dwarven city's forge, the demon halls' rumble and embers.
 *
 * The music is played here too (music.ts): a tune for the camp and one a region, each in three
 * layers (calm, danger, boss) that crossfade as enemies come into sight and a boss is fought,
 * and two stingers, for a victory and for the hero's death.
 *
 * Browsers (and Telegram on iOS) only allow audio after a user gesture, so it
 * all starts on the first tap; everything is suspended while the app is hidden.
 */

/** The original's samples, as files. */
export type Sample =
  | 'hit' | 'miss' | 'step' | 'water' | 'death' | 'levelup' | 'descend' | 'door_open' | 'secret' | 'alert'
  | 'click' | 'boss' | 'gold' | 'item' | 'drink' | 'bones' | 'read' | 'teleport' | 'trap' | 'lightning' | 'burning'
  | 'zap' | 'unlock' | 'ghost' | 'eat' | 'shatter' | 'dewdrop' | 'puff' | 'rocks' | 'falling' | 'blast' | 'evoke'
  | 'beacon' | 'bee' | 'cursed' | 'badge' | 'degrade';

export type Sound = Sample | SfxName;

/** The music: the original's tunes from files (the title's and the dungeon's), or one played here. */
export type Track = 'theme' | 'game' | SongName;

/** Whose sounds: Firelight's own, or the original's samples and tunes. */
export type SoundSet = 'firelight' | 'original';

const SONG_NAMES: ReadonlySet<string> = new Set<string>(SONGS);
const isSong = (track: Track): track is SongName => SONG_NAMES.has(track);

/** A tune playing, faded in and out through its own gain: from a file through an element, or played here. */
interface Music {
  track: Track;
  element: HTMLAudioElement | null;
  player: MusicPlayer | null;
  gain: GainNode | null;
}

const SAMPLES: readonly Sample[] = [
  'hit', 'miss', 'step', 'water', 'death', 'levelup', 'descend', 'door_open', 'secret', 'alert',
  'click', 'boss', 'gold', 'item', 'drink', 'bones', 'read', 'teleport', 'trap', 'lightning', 'burning', 'zap', 'unlock', 'ghost',
  'eat', 'shatter', 'dewdrop', 'puff', 'rocks', 'falling', 'blast', 'evoke', 'beacon', 'bee', 'cursed', 'badge', 'degrade',
];

/** The two sounds that stay the original's in every set: the boss's cry and the badge's chime. */
const KEPT: ReadonlySet<string> = new Set(['boss', 'badge']);

/** How much a sound's pitch wanders from play to play (a fraction), if not the default. */
const VARY: Partial<Record<Sound, number>> = {
  click: 0, tick: 0, levelup: 0, boss: 0, badge: 0, descend: 0, secret: 0.02, death: 0.02, quip: 0.03, equip: 0.03, alarm: 0, roar: 0.03,
  step: 0.07, stepGrass: 0.1, stepWood: 0.08, hit: 0.08, thump: 0.08, miss: 0.08, coin: 0.06, rustle: 0.12, drip: 0.15,
};
const DEFAULT_VARY = 0.04;
/** The fewest milliseconds between two of the same sound, and how many may sound at once. */
const GAP_MS = 28;
const VOICES = 3;
const MAX_VOICES = 28;

/* The regions' air: beds of filtered noise, drones, and sounds now and then. */

interface Bed {
  /** Noise through a filter: its kind, centre, level; `sway` slowly moves the centre (wind); `flicker` makes the level flare and fall (fire). */
  type: BiquadFilterType;
  hz: number;
  q?: number;
  gain: number;
  sway?: number;
  flicker?: number;
}

interface Air {
  beds: readonly Bed[];
  /** Low tones held under everything. */
  drone?: { hz: readonly number[]; gain: number };
  /** Now-and-then sounds: which, how often (ms between), how loud, at what pitches. Each keeps its own time. */
  events: ReadonlyArray<{ sound: Sound; every: readonly [number, number]; volume: number; rate: readonly [number, number] }>;
}

/** The camp: a fire's body and hiss, crackles and a spark now and then. */
const CAMP_AIR: Air = {
  beds: [
    { type: 'lowpass', hz: 340, q: 0.7, gain: 0.05, sway: 60, flicker: 0.5 },
    { type: 'bandpass', hz: 2600, q: 0.6, gain: 0.011, flicker: 0.8 },
  ],
  events: [
    { sound: 'crackle', every: [260, 1100], volume: 0.3, rate: [0.8, 1.35] },
    { sound: 'ember', every: [2500, 6500], volume: 0.12, rate: [0.8, 1.2] },
  ],
};

const AIRS: readonly Air[] = [
  // The sewers: water running somewhere, drips from the pipes.
  {
    beds: [{ type: 'lowpass', hz: 420, gain: 0.07, sway: 80 }],
    events: [
      { sound: 'drip', every: [1500, 4500], volume: 0.18, rate: [0.8, 1.35] },
      { sound: 'trickle', every: [6000, 13000], volume: 0.1, rate: [0.8, 1.1] },
    ],
  },
  // The prison: a low hum, chains, a wind far down the corridors, torches.
  {
    beds: [{ type: 'lowpass', hz: 220, gain: 0.05 }],
    drone: { hz: [58], gain: 0.012 },
    events: [
      { sound: 'chain', every: [7000, 16000], volume: 0.1, rate: [0.7, 1] },
      { sound: 'gust', every: [9000, 18000], volume: 0.1, rate: [0.8, 1.2] },
      { sound: 'sizzle', every: [3500, 8000], volume: 0.06, rate: [0.8, 1.2] },
    ],
  },
  // The caves: wind through the tunnels, drops echoing, stones falling.
  {
    beds: [{ type: 'bandpass', hz: 520, q: 0.8, gain: 0.09, sway: 260 }],
    events: [
      { sound: 'echoDrip', every: [3500, 8000], volume: 0.14, rate: [0.6, 1] },
      { sound: 'pebble', every: [6000, 13000], volume: 0.12, rate: [0.7, 1.1] },
    ],
  },
  // The dwarven city: the forge's hum and bellows, far-off hammers on the anvil.
  {
    beds: [{ type: 'lowpass', hz: 260, gain: 0.04, flicker: 0.25 }],
    drone: { hz: [55, 82.5], gain: 0.01 },
    events: [
      { sound: 'hammer', every: [4500, 10000], volume: 0.07, rate: [0.9, 1.1] },
      { sound: 'bellows', every: [7000, 14000], volume: 0.1, rate: [0.8, 1.1] },
      { sound: 'knock', every: [8000, 15000], volume: 0.07, rate: [0.6, 0.8] },
    ],
  },
  // The demon halls: the ground rumbles, embers hiss.
  {
    beds: [{ type: 'lowpass', hz: 170, gain: 0.08, sway: 40 }],
    drone: { hz: [41, 61.5, 82], gain: 0.016 },
    events: [
      { sound: 'rumble', every: [6000, 13000], volume: 0.2, rate: [0.8, 1.2] },
      { sound: 'sizzle', every: [2500, 6000], volume: 0.09, rate: [0.7, 1.1] },
      { sound: 'burning', every: [9000, 16000], volume: 0.05, rate: [0.7, 0.9] },
    ],
  },
];

/** A region's air, playing: its nodes, faded out and stopped when the region changes. */
interface Playing {
  gain: GainNode;
  nodes: AudioScheduledSourceNode[];
  timers: number[];
}

/** White noise from a fixed seed. */
function noiseSource(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
}

function stored(key: string, fallback: number): number {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : Math.max(0, Math.min(1, Number(value)));
  } catch {
    return fallback;
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered.
  }
}

class Audio {
  private context: AudioContext | null = null;
  /** The original's samples, decoded. */
  private readonly files = new Map<Sample, AudioBuffer>();
  private readonly loading = new Set<Sample>();
  /** Our sounds, rendered when first wanted (or in the quiet after the first tap). */
  private readonly made = new Map<SfxName, AudioBuffer>();
  private unlocked = false;
  /** The graph: master → compressor → out; each bus into master. */
  private sfx: GainNode | null = null;
  private air: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private musicDuck: GainNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  /** Where the stingers go: past the duck and the muffle, so a death is heard. */
  private stingers: GainNode | null = null;
  private sting: MusicPlayer | null = null;
  private music: Music | null = null;
  private track: Track | null = null;
  private region: number | null = null;
  private playing: Playing | null = null;
  private noise: AudioBuffer | null = null;
  /** The layer the music plays in: calm, danger or boss, kept (held a while) by `situation`. */
  private layer: LayerPlan = { mode: 'calm', holdUntil: 0 };
  /** Where the hero is, world pixels: sounds with a place are heard from there. */
  private listener: Place | null = null;
  private readonly last = new Map<Sound, number>();
  private readonly voices = new Map<Sound, number>();
  private total = 0;
  enabled: boolean;
  /** The player's levels, 0 to 1. */
  musicVolume: number;
  soundVolume: number;
  soundSet: SoundSet;

  constructor(private readonly base: string) {
    let saved: string | null = null;
    let set: string | null = null;
    try {
      saved = localStorage.getItem('pd-sound');
      set = localStorage.getItem('pd-sound-set');
    } catch {
      // Defaults to on, and to ours.
    }
    this.enabled = saved !== 'off';
    this.soundSet = set === 'original' ? 'original' : 'firelight';
    this.musicVolume = stored('pd-music-volume', 0.6);
    this.soundVolume = stored('pd-sound-volume', 0.8);
    const unlock = (): void => this.unlock();
    // Safari on iOS lets sound start only from touchend or click, not pointerdown: every one of them
    // tries, until the context runs.
    for (const type of ['pointerdown', 'touchend', 'click', 'keydown']) addEventListener(type, unlock, { capture: true });
    // Out of sight (the tab hidden, the window minimised, Telegram's «deactivated»): the music's timer and the context stop.
    onPause(() => {
      this.music?.element?.pause();
      this.music?.player?.pause();
      void this.context?.suspend();
    });
    onResume(() => {
      void this.context?.resume();
      this.startMusic();
    });
  }

  /** A moment of silence played inside the gesture: what finally wakes a context on iOS. */
  private silence(ctx: AudioContext): void {
    try {
      const source = ctx.createBufferSource();
      source.buffer = ctx.createBuffer(1, 1, 22050);
      source.connect(ctx.destination);
      source.start(0);
    } catch {
      // Nothing to wake.
    }
  }

  private unlock(): void {
    if (this.unlocked) {
      if (this.context && this.context.state !== 'running' && !paused()) {
        void this.context.resume();
        this.silence(this.context);
      }
      return;
    }
    this.unlocked = true;
    try {
      const ctx = new AudioContext();
      this.context = ctx;
      void ctx.resume();
      this.silence(ctx);
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 10;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.2;
      const master = ctx.createGain();
      master.gain.value = 0.95;
      master.connect(compressor).connect(ctx.destination);
      this.sfx = ctx.createGain();
      this.air = ctx.createGain();
      this.musicBus = ctx.createGain();
      this.musicDuck = ctx.createGain();
      this.stingers = ctx.createGain();
      this.musicFilter = ctx.createBiquadFilter();
      this.musicFilter.type = 'lowpass';
      this.musicFilter.frequency.value = 20000;
      this.sfx.connect(master);
      this.air.connect(master);
      this.musicFilter.connect(this.musicDuck).connect(this.musicBus).connect(master);
      this.stingers.connect(this.musicBus);
      this.levels();
      this.loadFiles();
      this.warm();
      const white = noiseSource(12345);
      const noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = white();
      this.noise = noise;
    } catch {
      this.context = null;
    }
    this.startMusic();
    this.startAir();
  }

  /** Fetches the original's samples that are wanted: the two kept, or all of them in the original set. */
  private loadFiles(): void {
    for (const name of SAMPLES) if (this.soundSet === 'original' || KEPT.has(name)) void this.load(name);
  }

  private async load(name: Sample): Promise<void> {
    if (this.files.has(name) || this.loading.has(name) || !this.context) return;
    this.loading.add(name);
    try {
      const response = await fetch(`${this.base}${name}.mp3`);
      const data = await response.arrayBuffer();
      this.files.set(name, await this.context.decodeAudioData(data));
    } catch {
      // Without that sound.
    } finally {
      this.loading.delete(name);
    }
  }

  /** Renders our sounds in the quiet after the first tap, a few at a time, so the first fight does not stutter on them. */
  private warm(): void {
    const queue = (Object.keys(SFX) as SfxName[]).filter((name) => !this.made.has(name));
    const next = (): void => {
      for (const name of queue.splice(0, 1)) this.make(name);
      if (queue.length) window.setTimeout(next, 25);
    };
    window.setTimeout(next, 250);
  }

  private make(name: SfxName): AudioBuffer | undefined {
    let buffer = this.made.get(name);
    if (!buffer && this.context) {
      buffer = makeBuffer(this.context, SFX[name], name);
      this.made.set(name, buffer);
    }
    return buffer;
  }

  /** The buffer to play for a sound: the original's file in the original set (and for the two kept), else ours. */
  private buffer(name: Sound): AudioBuffer | undefined {
    const file = this.files.get(name as Sample);
    const ours = hasSfx(name);
    if (!ours) return file;
    if (file && (this.soundSet === 'original' || KEPT.has(name))) return file;
    return this.make(name);
  }

  /** Applies the player's levels to the buses. */
  private levels(): void {
    const ctx = this.context;
    if (!ctx || !this.sfx || !this.air || !this.musicBus) return;
    const on = this.enabled ? 1 : 0;
    const at = ctx.currentTime;
    this.sfx.gain.setTargetAtTime(on * this.soundVolume, at, 0.05);
    this.air.gain.setTargetAtTime(on * this.soundVolume, at, 0.3);
    // The music's level is a gentle curve: half way sounds like half.
    this.musicBus.gain.setTargetAtTime(on * this.musicVolume * this.musicVolume * 0.75, at, 0.1);
    if (this.music?.element && !this.music.gain) this.music.element.volume = on * this.musicVolume * 0.6;
  }

  /** The hero's place, world pixels: what sounds from somewhere is heard from here. */
  listen(x: number, y: number): void {
    this.listener = { x, y };
  }

  /**
   * Plays a sound: `rate` (pitch), `volume`, and where in the world it comes from, if anywhere.
   * Its pitch wanders a little unless `rate` is given exactly... it wanders around `rate`.
   */
  play(name: Sound, rate = 1, volume = 1, at?: Place, pan?: number): void {
    const ctx = this.context;
    if (!this.enabled || !ctx || !this.sfx || paused() || ctx.state !== 'running') return;
    const buffer = this.buffer(name);
    if (!buffer) return;
    const now = performance.now();
    // Not the same sound on top of itself, nor too many at once.
    if (now - (this.last.get(name) ?? -1e9) < GAP_MS) return;
    if ((this.voices.get(name) ?? 0) >= VOICES || this.total >= MAX_VOICES) return;

    let gainValue = volume * (0.92 + Math.random() * 0.16);
    let panValue = pan ?? 0;
    let cutoff = 20000;
    if (at && this.listener) {
      const place = heard(at, this.listener);
      if (!place.audible) return;
      panValue = place.pan;
      gainValue *= place.gain;
      cutoff = place.cutoff;
    }
    if (gainValue < 0.01) return;
    this.last.set(name, now);
    const vary = VARY[name] ?? DEFAULT_VARY;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * vary);
    const gain = ctx.createGain();
    gain.gain.value = gainValue;
    let tail: AudioNode = source.connect(gain);
    if (cutoff < 15000) {
      // Far away: duller.
      const air = ctx.createBiquadFilter();
      air.type = 'lowpass';
      air.frequency.value = cutoff;
      tail = tail.connect(air);
    }
    if (panValue !== 0 && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = panValue;
      tail = tail.connect(panner);
    }
    tail.connect(this.sfx);
    this.voices.set(name, (this.voices.get(name) ?? 0) + 1);
    this.total++;
    source.onended = () => {
      this.voices.set(name, Math.max(0, (this.voices.get(name) ?? 1) - 1));
      this.total = Math.max(0, this.total - 1);
      gain.disconnect();
    };
    source.start();
  }

  /** Plays a sound a little later (a sequence: a chest's creak, then what is inside). */
  later(ms: number, name: Sound, rate = 1, volume = 1, at?: Place): void {
    window.setTimeout(() => this.play(name, rate, volume, at), ms);
  }

  /** Coins: one clink for a few, a little cascade for a pile. */
  coins(amount: number, at?: Place): void {
    const clinks = Math.min(6, 1 + Math.floor(Math.log2(Math.max(1, amount))));
    for (let i = 0; i < clinks; i++) this.later(i * 55 + Math.random() * 25, 'coin', 0.92 + i * 0.05, 0.5 - i * 0.05, at);
  }

  /** Whose sounds are heard (the original's samples and tunes, or Firelight's own). */
  setSoundSet(set: SoundSet): void {
    if (set === this.soundSet) return;
    this.soundSet = set;
    store('pd-sound-set', set);
    if (set === 'original') this.loadFiles();
    // The title's and the sewers' tunes come from the files in the original set.
    this.retune();
  }

  playMusic(track: Track | null): void {
    if (track === this.track) return;
    this.track = track;
    const old = this.music;
    this.music = null;
    if (old) this.fadeOut(old);
    this.startMusic();
  }

  /**
   * What is happening, once a frame: how many enemies are awake in sight, and whether a boss is being fought. The music plays
   * its calm layer, its danger layer or its boss layer and crossfades between them; danger and boss linger a few seconds after.
   */
  situation(danger: number, boss: boolean): void {
    const plan = planLayers(this.layer, { danger, boss }, performance.now() / 1000);
    const changed = plan.mode !== this.layer.mode;
    this.layer = plan;
    if (!changed) return;
    this.music?.player?.setMode(plan.mode);
    this.retune();
  }

  /** The music at rest: a new run or the title, nothing to be wary of yet. */
  calmDown(): void {
    this.layer = { mode: 'calm', holdUntil: 0 };
    this.music?.player?.setMode('calm');
    this.retune();
  }

  /** The track to hear for the one asked for: in the original set, the calm title and sewers play the original's tunes. */
  private resolve(track: Track): Track {
    if (this.soundSet === 'original' && this.layer.mode === 'calm') {
      if (track === 'camp') return 'theme';
      if (track === 'sewers') return 'game';
    }
    return track;
  }

  /** Changes the tune playing if what should be heard is not it (the set changed, or a fight began on a file's tune). */
  private retune(): void {
    if (!this.music || !this.track) return;
    if (this.music.track === this.resolve(this.track)) return;
    const old = this.music;
    this.music = null;
    this.fadeOut(old);
    this.startMusic();
  }

  /**
   * Fades a track out over a second and a half (while the next comes in), then lets it go:
   * the element paused, or the player's notes stopped and its nodes disconnected.
   */
  private fadeOut(old: Music): void {
    const ctx = this.context;
    const stop = (): void => {
      old.element?.pause();
      old.player?.dispose();
      old.gain?.disconnect();
    };
    if (ctx && old.gain) {
      // Its own fade-in may not have begun yet: that is dropped, and the fade-out starts from where it is.
      old.gain.gain.cancelScheduledValues(ctx.currentTime);
      old.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
      window.setTimeout(stop, 1800);
    } else {
      stop();
    }
  }

  /** A gain into the music's filter that brings a new track in rather than starting it at full. */
  private fadeIn(ctx: AudioContext, filter: AudioNode): GainNode {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(filter);
    gain.gain.setTargetAtTime(1, ctx.currentTime + 0.05, 0.6);
    return gain;
  }

  private startMusic(): void {
    if (!this.unlocked || !this.enabled || !this.track || paused()) return;
    const ctx = this.context;
    if (!this.music) {
      const track = this.resolve(this.track);
      if (isSong(track)) {
        // A tune played here needs the audio graph; without one there is no such music.
        if (!ctx || !this.musicFilter) return;
        const gain = this.fadeIn(ctx, this.musicFilter);
        this.music = { track, element: null, player: new MusicPlayer(ctx, track, gain, { mode: this.layer.mode }), gain };
      } else {
        const element = new window.Audio(`${this.base}${track}.mp3`);
        element.loop = true;
        element.preload = 'auto';
        let gain: GainNode | null = null;
        if (ctx && this.musicFilter) {
          try {
            const source = ctx.createMediaElementSource(element);
            gain = this.fadeIn(ctx, this.musicFilter);
            source.connect(gain);
          } catch {
            gain = null;
          }
        }
        this.music = { track, element, player: null, gain };
      }
      this.levels();
    }
    if (this.music.element) void this.music.element.play().catch(() => undefined);
    this.music.player?.play();
  }

  /** The music dips for a moment under something that matters (a boss, a level gained, death). */
  duck(depth = 0.35, ms = 1200): void {
    const ctx = this.context;
    if (!ctx || !this.musicDuck) return;
    const at = ctx.currentTime;
    const gain = this.musicDuck.gain;
    gain.cancelScheduledValues(at);
    gain.setTargetAtTime(depth, at, 0.06);
    gain.setTargetAtTime(1, at + ms / 1000, 0.5);
  }

  /** A short piece of music over everything: a fanfare for a victory, a falling phrase for the hero's death. The music dips under it. */
  stinger(name: StingerName): void {
    const ctx = this.context;
    if (!this.enabled || !ctx || !this.stingers || paused() || ctx.state !== 'running') return;
    this.sting?.dispose();
    this.duck(0.2, songLength(name).loop * 1000 + 400);
    const player: MusicPlayer = new MusicPlayer(ctx, name, this.stingers, {
      onEnd: () => {
        player.dispose();
        if (this.sting === player) this.sting = null;
      },
    });
    this.sting = player;
    player.play();
  }

  /** Muffled, as if through a door: while a window is open over the game, or the hero has fallen. */
  muffle(on: boolean): void {
    const ctx = this.context;
    if (!ctx || !this.musicFilter) return;
    this.musicFilter.frequency.setTargetAtTime(on ? 700 : 20000, ctx.currentTime, on ? 0.12 : 0.25);
  }

  /** The air of a region (0 sewers ... 4 demon halls), or the camp's (the title). */
  ambience(region: number | null): void {
    if (region === this.region) return;
    this.region = region;
    this.stopAir();
    this.startAir();
  }

  private stopAir(): void {
    const playing = this.playing;
    const ctx = this.context;
    this.playing = null;
    if (!playing || !ctx) return;
    for (const timer of playing.timers) window.clearTimeout(timer);
    playing.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.6);
    window.setTimeout(() => {
      for (const node of playing.nodes) {
        try {
          node.stop();
        } catch {
          // Already stopped.
        }
      }
      playing.gain.disconnect();
    }, 2500);
  }

  private startAir(): void {
    const ctx = this.context;
    const air = this.region === null ? CAMP_AIR : AIRS[this.region];
    if (!ctx || !this.air || !this.noise || !air || this.playing) return;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.air);
    gain.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
    const nodes: AudioScheduledSourceNode[] = [];
    const lfo = (hz: number, depth: number, into: AudioParam): void => {
      const osc = ctx.createOscillator();
      osc.frequency.value = hz;
      const amount = ctx.createGain();
      amount.gain.value = depth;
      osc.connect(amount).connect(into);
      osc.start();
      nodes.push(osc);
    };
    for (const bed of air.beds) {
      const source = ctx.createBufferSource();
      source.buffer = this.noise;
      source.loop = true;
      // Each bed from its own place in the noise, so two beds are not one hiss.
      const filter = ctx.createBiquadFilter();
      filter.type = bed.type;
      filter.frequency.value = bed.hz;
      filter.Q.value = bed.q ?? 0.7;
      const level = ctx.createGain();
      level.gain.value = bed.gain;
      source.connect(filter).connect(level).connect(gain);
      // The wind rises and falls.
      if (bed.sway) lfo(0.07, bed.sway, filter.frequency);
      // A fire flares and sinks: two slow waves of different lengths on its level.
      if (bed.flicker) {
        lfo(0.9, bed.gain * bed.flicker * 0.5, level.gain);
        lfo(2.3, bed.gain * bed.flicker * 0.3, level.gain);
      }
      source.start(0, Math.random() * 2);
      nodes.push(source);
    }
    for (const hz of air.drone?.hz ?? []) {
      const tone = ctx.createOscillator();
      tone.type = 'sine';
      tone.frequency.value = hz;
      tone.detune.value = (Math.random() - 0.5) * 8;
      const level = ctx.createGain();
      level.gain.value = air.drone!.gain;
      tone.connect(level).connect(gain);
      tone.start();
      nodes.push(tone);
    }
    const playing: Playing = { gain, nodes, timers: [] };
    this.playing = playing;
    // Now and then, somewhere to one side or the other: each sound keeps its own time.
    air.events.forEach((event, index) => {
      const next = (): void => {
        if (this.playing !== playing) return;
        if (!paused()) {
          const rate = event.rate[0] + Math.random() * (event.rate[1] - event.rate[0]);
          this.playAir(event.sound, rate, event.volume, (Math.random() * 2 - 1) * 0.8, gain);
        }
        playing.timers[index] = window.setTimeout(next, event.every[0] + Math.random() * (event.every[1] - event.every[0]));
      };
      playing.timers[index] = window.setTimeout(next, 800 + Math.random() * event.every[1]);
    });
  }

  /** An ambient one-off through the region's own fade. */
  private playAir(name: Sound, rate: number, volume: number, pan: number, into: GainNode): void {
    const ctx = this.context;
    const buffer = this.buffer(name);
    if (!ctx || !buffer || ctx.state !== 'running') return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    source.connect(gain).connect(panner).connect(into);
    source.onended = () => panner.disconnect();
    source.start();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    store('pd-sound', enabled ? 'on' : 'off');
    this.levels();
    if (enabled) this.startMusic();
    else {
      this.music?.element?.pause();
      this.music?.player?.pause();
    }
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    store('pd-music-volume', String(this.musicVolume));
    this.levels();
  }

  setSoundVolume(volume: number): void {
    this.soundVolume = Math.max(0, Math.min(1, volume));
    store('pd-sound-volume', String(this.soundVolume));
    this.levels();
  }
}

export const audio = new Audio(`${import.meta.env.BASE_URL}audio/`);
