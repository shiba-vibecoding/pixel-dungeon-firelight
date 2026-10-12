/*
 * Sound effects and music of the original. Browsers (and Telegram on iOS)
 * only allow audio after a user gesture, so everything starts on the first
 * tap; music pauses while the app is in the background.
 */

export type Sound =
  | 'hit' | 'miss' | 'step' | 'water' | 'death' | 'levelup' | 'descend' | 'door_open' | 'secret' | 'alert'
  | 'click' | 'boss' | 'gold' | 'item' | 'drink' | 'bones' | 'read' | 'teleport' | 'trap' | 'lightning' | 'burning'
  | 'zap' | 'unlock' | 'ghost' | 'eat' | 'shatter' | 'dewdrop' | 'puff' | 'rocks' | 'falling' | 'blast' | 'evoke';

type Track = 'theme' | 'game';

const SOUNDS: readonly Sound[] = [
  'hit', 'miss', 'step', 'water', 'death', 'levelup', 'descend', 'door_open', 'secret', 'alert',
  'click', 'boss', 'gold', 'item', 'drink', 'bones', 'read', 'teleport', 'trap', 'lightning', 'burning', 'zap', 'unlock', 'ghost',
  'eat', 'shatter', 'dewdrop', 'puff', 'rocks', 'falling', 'blast', 'evoke',
];

class Audio {
  private context: AudioContext | null = null;
  private readonly buffers = new Map<Sound, AudioBuffer>();
  private music: HTMLAudioElement | null = null;
  private track: Track | null = null;
  private unlocked = false;
  enabled: boolean;

  constructor(private readonly base: string) {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem('pd-sound');
    } catch {
      // Defaults to on.
    }
    this.enabled = saved !== 'off';
    const unlock = (): void => this.unlock();
    addEventListener('pointerdown', unlock, { capture: true });
    addEventListener('keydown', unlock, { capture: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.music?.pause();
      else this.startMusic();
    });
  }

  private unlock(): void {
    if (this.unlocked) {
      void this.context?.resume();
      return;
    }
    this.unlocked = true;
    try {
      this.context = new AudioContext();
      void this.context.resume();
      for (const name of SOUNDS) void this.load(name);
    } catch {
      this.context = null;
    }
    this.startMusic();
  }

  private async load(name: Sound): Promise<void> {
    const response = await fetch(`${this.base}${name}.mp3`);
    const data = await response.arrayBuffer();
    this.buffers.set(name, await this.context!.decodeAudioData(data));
  }

  play(name: Sound, rate = 1, volume = 1): void {
    if (!this.enabled || !this.context || document.hidden) return;
    const buffer = this.buffers.get(name);
    if (!buffer) return;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const gain = this.context.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(this.context.destination);
    source.start();
  }

  playMusic(track: Track | null): void {
    if (track === this.track) return;
    this.track = track;
    this.music?.pause();
    this.music = null;
    this.startMusic();
  }

  private startMusic(): void {
    if (!this.unlocked || !this.enabled || !this.track || document.hidden) return;
    if (!this.music) {
      this.music = new window.Audio(`${this.base}${this.track}.mp3`);
      this.music.loop = true;
      this.music.volume = 0.45;
    }
    void this.music.play().catch(() => undefined);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    try {
      localStorage.setItem('pd-sound', enabled ? 'on' : 'off');
    } catch {
      // Not remembered.
    }
    if (enabled) this.startMusic();
    else this.music?.pause();
  }
}

export const audio = new Audio(`${import.meta.env.BASE_URL}audio/`);
