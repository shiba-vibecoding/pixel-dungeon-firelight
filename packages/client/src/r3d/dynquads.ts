/*
 * A mesh of quads that is written again when something moves: a preallocated geometry (the same attributes the level's meshes have, so
 * the fog and haze shaders read it), `begin`, then quads written with levelgeom's writers, then `end`, which uploads exactly what was
 * written. It makes no garbage after it is made. Used for what is small and changes now and then (doors' lights, a grate, cracks, sparks).
 */
import { BufferAttribute, BufferGeometry, DynamicDrawUsage, type Material, Mesh } from 'three';
import { type Buffers, makeBuffers } from './levelgeom';
import { still } from './quadbatch';

export class DynamicQuads {
  readonly buffers: Buffers;
  readonly mesh: Mesh;
  private readonly geometry = new BufferGeometry();
  private readonly capacity: number;

  constructor(capacityQuads: number, material: Material, renderOrder = 1) {
    this.capacity = capacityQuads;
    const b = (this.buffers = makeBuffers(capacityQuads * 4, capacityQuads * 6));
    const make = (array: Float32Array, size: number): BufferAttribute => new BufferAttribute(array, size).setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('position', make(b.pos, 3));
    this.geometry.setAttribute('normal', make(b.normal, 3));
    this.geometry.setAttribute('uv', make(b.uv, 2));
    this.geometry.setAttribute('color', make(b.color, 3));
    this.geometry.setAttribute('aFog', make(b.fog, 2));
    this.geometry.setIndex(new BufferAttribute(b.index, 1).setUsage(DynamicDrawUsage));
    this.geometry.setDrawRange(0, 0);
    this.mesh = new Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.visible = false;
    still(this.mesh);
  }

  /** Starts writing: whatever was there is gone. */
  begin(): Buffers {
    this.buffers.verts = this.buffers.indices = 0;
    return this.buffers;
  }

  /** Whether `quads` more fit. */
  has(quads: number): boolean {
    return this.buffers.verts / 4 + quads <= this.capacity;
  }

  /** Uploads what was written. */
  end(): void {
    const g = this.geometry;
    for (const name of ['position', 'normal', 'uv', 'color', 'aFog'] as const) (g.getAttribute(name) as BufferAttribute).needsUpdate = true;
    g.getIndex()!.needsUpdate = true;
    g.setDrawRange(0, this.buffers.indices);
    this.mesh.visible = this.buffers.indices > 0;
  }

  dispose(): void {
    this.geometry.dispose();
  }
}
