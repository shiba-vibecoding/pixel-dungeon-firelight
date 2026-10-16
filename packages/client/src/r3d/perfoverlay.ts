/*
 * The dev overlay (?perf=1): frames a second, CPU and GPU time of the 3D frame, draw calls, triangles and textures, so a real
 * phone can say what the renderer costs. Updated twice a second; made only when asked for.
 */
import type { PerfSample } from './world3d';

export class PerfOverlay {
  private readonly el = document.createElement('pre');
  private frames = 0;
  private cpu = 0;
  private cpuMax = 0;
  private since = 0;
  private last = 0;
  /** The last numbers shown, for tests and the console. */
  readonly latest = { fps: 0, cpuMs: 0, cpuMax: 0, gpuMs: 0, calls: 0, triangles: 0, textures: 0, geometries: 0, hz: 0, tier: '' };

  constructor() {
    this.el.id = 'pd-perf';
    this.el.style.cssText =
      'position:fixed;left:4px;top:4px;z-index:99;margin:0;padding:4px 6px;font:10px/1.35 ui-monospace,monospace;color:#9f9;' +
      'background:rgba(0,0,0,.62);pointer-events:none;white-space:pre';
    document.body.append(this.el);
  }

  note(now: number, sample: PerfSample, hz: number, tier: string): void {
    this.frames++;
    this.cpu += sample.cpuMs;
    this.cpuMax = Math.max(this.cpuMax, sample.cpuMs);
    if (this.since === 0) this.since = now;
    if (now - this.since < 500) return;
    const seconds = (now - this.since) / 1000;
    const l = this.latest;
    l.fps = Math.round(this.frames / seconds);
    l.cpuMs = this.cpu / this.frames;
    l.cpuMax = this.cpuMax;
    l.gpuMs = sample.gpuMs;
    l.calls = sample.calls;
    l.triangles = sample.triangles;
    l.textures = sample.textures;
    l.geometries = sample.geometries;
    l.hz = hz;
    l.tier = tier;
    this.el.textContent =
      `3D ${l.fps} fps (screen ${hz} Hz) tier ${tier}\n` +
      `cpu ${l.cpuMs.toFixed(2)} ms (max ${l.cpuMax.toFixed(1)})  gpu ${l.gpuMs ? l.gpuMs.toFixed(2) : 'n/a'} ms\n` +
      `calls ${l.calls}  tris ${l.triangles}\ntextures ${l.textures}  geometries ${l.geometries}`;
    this.frames = 0;
    this.cpu = 0;
    this.cpuMax = 0;
    this.since = now;
    this.last = now;
  }

  remove(): void {
    this.el.remove();
  }

  get updated(): number {
    return this.last;
  }
}
