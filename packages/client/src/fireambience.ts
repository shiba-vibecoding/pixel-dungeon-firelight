/*
 * The camp's fire, made here and never the same twice: three layers, all random, all scheduled ahead on the audio clock (a timer
 * tops the schedule up every 200 ms), none of it a loop of one recording.
 *
 *   1. The roar: brown noise through a low-pass round 400-700 Hz, its level and its cut-off moved by a few slow waves of lengths
 *      that never line up (0.13, 0.27, 0.41 Hz), so the fire breathes; and a thin hiss of high noise under it.
 *   2. The crackle: clicks of 1 to 5 ms of noise, high-passed above 2 kHz, at random (Poisson) intervals, each with its own
 *      loudness (mostly faint, now and then sharp) and place between the speakers; sometimes a cluster of 3 to 8 quick pops.
 *   3. The snaps: now and then a bigger pop with a short ringing body (a band-pass of 600-1500 Hz, 30-80 ms) and a shower of clicks.
 *
 * Quiet by design: it goes through the game's ambience bus (the sound level and the mute apply), under the music. Nodes are
 * made only when a click is scheduled (a few a second), nothing in a frame, nothing kept after it has sounded.
 */

/** What a running fire gives back: its output (faded in, faded out by the caller), the long-running nodes, and the timer ticking. */
export interface Fire {
  gain: GainNode;
  nodes: AudioScheduledSourceNode[];
  timers: number[];
}

const AHEAD = 0.7;
const TICK_MS = 200;

/** Brown noise: white noise integrated, so the low end carries it (the body of a fire). */
function brownNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  // A leaky integral has no long memory, so the seam of the loop is a step the low-pass swallows.
  return buffer;
}

const between = (a: number, b: number): number => a + Math.random() * (b - a);

/** Starts the fire into `out` (an ambience bus); `noise` is the game's shared white noise. */
export function startFire(ctx: AudioContext, out: AudioNode, noise: AudioBuffer): Fire {
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(out);
  master.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
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

  // 1. The roar and the hiss.
  const roar = ctx.createBufferSource();
  roar.buffer = brownNoise(ctx, 7);
  roar.loop = true;
  const body = ctx.createBiquadFilter();
  body.type = 'lowpass';
  body.frequency.value = between(450, 650);
  body.Q.value = 0.6;
  const roarLevel = ctx.createGain();
  roarLevel.gain.value = 0.1;
  roar.connect(body).connect(roarLevel).connect(master);
  lfo(0.13, 0.03, roarLevel.gain);
  lfo(0.27, 0.022, roarLevel.gain);
  lfo(0.41, 0.014, roarLevel.gain);
  lfo(0.11, 120, body.frequency);
  lfo(0.31, 70, body.frequency);
  roar.start(0, Math.random() * 5);
  nodes.push(roar);

  const hiss = ctx.createBufferSource();
  hiss.buffer = noise;
  hiss.loop = true;
  const hissFilter = ctx.createBiquadFilter();
  hissFilter.type = 'highpass';
  hissFilter.frequency.value = 4200;
  const hissLevel = ctx.createGain();
  hissLevel.gain.value = 0.007;
  hiss.connect(hissFilter).connect(hissLevel).connect(master);
  lfo(0.19, 0.004, hissLevel.gain);
  lfo(0.37, 0.003, hissLevel.gain);
  hiss.start(0, Math.random() * 2);
  nodes.push(hiss);

  // The clicks all go through one high-pass; each has its own envelope and place.
  const clicks = ctx.createBiquadFilter();
  clicks.type = 'highpass';
  clicks.frequency.value = 2200;
  clicks.Q.value = 0.7;
  clicks.connect(master);

  const noiseLength = noise.duration;
  /** One noise burst of `seconds` at `time`, `level` loud, `pan` to one side, into `to`. */
  const burst = (time: number, seconds: number, level: number, pan: number, to: AudioNode, filter?: { hz: number; q: number }): void => {
    const source = ctx.createBufferSource();
    source.buffer = noise;
    const env = ctx.createGain();
    env.gain.setValueAtTime(level, time);
    env.gain.exponentialRampToValueAtTime(0.0001, time + seconds);
    let tail: AudioNode = source;
    if (filter) {
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = filter.hz;
      band.Q.value = filter.q;
      tail = tail.connect(band);
    }
    tail = tail.connect(env);
    if (ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      tail = tail.connect(panner);
    }
    tail.connect(to);
    source.start(time, Math.random() * (noiseLength - seconds - 0.05), seconds + 0.01);
    source.onended = () => env.disconnect();
  };

  // 2 and 3: a schedule that runs ahead of the clock. The fire's liveliness drifts slowly, so a quiet spell and a busy one come and go.
  let cursor = ctx.currentTime + 0.1;
  let nextSnap = ctx.currentTime + between(1.5, 4);
  let busy = 1;
  const click = (time: number, loud: number): void => {
    // Mostly faint, now and then sharp.
    burst(time, between(0.001, 0.005), 0.025 + loud * loud * loud * 0.28, between(-0.85, 0.85), clicks);
  };
  const topUp = (): void => {
    const now = ctx.currentTime;
    if (cursor < now) cursor = now;
    while (cursor < now + AHEAD) {
      busy = Math.min(2, Math.max(0.35, busy + between(-0.12, 0.12)));
      // Poisson arrivals: exponential gaps, about 9 a second in a busy spell, fewer in a quiet one.
      cursor += -Math.log(1 - Math.random()) / (9 * busy);
      if (Math.random() < 0.11) {
        // A cluster of 3 to 8 quick pops, within a tenth or two of a second.
        const count = 3 + Math.floor(Math.random() * 6);
        const span = between(0.06, 0.2);
        const loud = Math.random();
        for (let i = 0; i < count; i++) click(cursor + Math.random() * span, loud * between(0.5, 1));
        cursor += span;
      } else {
        click(cursor, Math.random());
      }
    }
    // The bigger snaps: a short ringing body behind a sharp click, and a few small pops after.
    while (nextSnap < now + AHEAD) {
      const at = Math.max(now, nextSnap);
      const pan = between(-0.7, 0.7);
      const hz = between(600, 1500);
      burst(at, between(0.03, 0.08), between(0.1, 0.28), pan, master, { hz, q: between(3, 8) });
      burst(at, 0.004, between(0.15, 0.3), pan, clicks);
      const after = Math.floor(Math.random() * 4);
      for (let i = 0; i < after; i++) click(at + between(0.02, 0.15), between(0.2, 0.7));
      nextSnap = at + between(2.2, 7);
    }
  };
  topUp();
  const fire: Fire = { gain: master, nodes, timers: [0] };
  const tick = (): void => {
    topUp();
    fire.timers[0] = window.setTimeout(tick, TICK_MS);
  };
  fire.timers[0] = window.setTimeout(tick, TICK_MS);
  return fire;
}
