/** Index cell centres horizontally; the caller retains the exact 3D LOD test. */
export function createCellIndex(cells, bucketSize = 64) {
  const columns = new Map();
  const order = new Map();
  cells.forEach((cell, i) => {
    order.set(cell, i);
    const key = Math.floor(cell.x / bucketSize) + ',' + Math.floor(cell.z / bucketSize);
    if (!columns.has(key)) columns.set(key, []);
    columns.get(key).push(cell);
  });
  return {columns, order, bucketSize, active: new Set()};
}

/** Include old loaded cells so movement, teleports and preset changes unload them. */
export function queryCells(index, x, z, radius) {
  const {columns, bucketSize, active, order} = index;
  const candidates = new Set(active);
  const minX = Math.floor((x - radius) / bucketSize);
  const maxX = Math.floor((x + radius) / bucketSize);
  const minZ = Math.floor((z - radius) / bucketSize);
  const maxZ = Math.floor((z + radius) / bucketSize);
  for (let bx = minX; bx <= maxX; bx++) {
    for (let bz = minZ; bz <= maxZ; bz++) {
      const column = columns.get(bx + ',' + bz);
      if (column) for (const cell of column) candidates.add(cell);
    }
  }
  // Preserve insertion/draw order, including transparent kit materials.
  return [...candidates].sort((a, b) => order.get(a) - order.get(b));
}

/** AO's normal material does not sample shadows; keep the colour pass's map. */
export function withoutShadowUpdate(renderer, render) {
  const {autoUpdate, needsUpdate} = renderer.shadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = false;
  try {
    return render();
  } finally {
    renderer.shadowMap.autoUpdate = autoUpdate;
    renderer.shadowMap.needsUpdate = needsUpdate;
  }
}

/** Sparse, nonblocking GPU samples. No finish(), readback or busy waiting. */
export class GpuTimer {
  constructor(gl, interval = 12, warmupFrames = 60) {
    this.gl = gl;
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.interval = interval;
    this.warmupFrames = warmupFrames;
    this.frame = 0;
    this.pending = [];
    this.current = null;
    this.milliseconds = null;
  }

  begin() {
    if (!this.ext) return;
    const gl = this.gl;
    if (gl.getParameter(this.ext.GPU_DISJOINT_EXT)) {
      for (const query of this.pending) gl.deleteQuery(query);
      this.pending.length = 0;
      this.milliseconds = null;
      return;
    }
    while (this.pending.length &&
        gl.getQueryParameter(this.pending[0], gl.QUERY_RESULT_AVAILABLE)) {
      const query = this.pending.shift();
      const ms = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
      this.milliseconds = this.milliseconds === null ? ms : this.milliseconds * 0.9 + ms * 0.1;
      gl.deleteQuery(query);
    }
    const frame = this.frame++;
    if (frame < this.warmupFrames || frame % this.interval || this.pending.length >= 4) return;
    this.current = gl.createQuery();
    if (this.current) gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.current);
  }

  end() {
    if (!this.current) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.current);
    this.current = null;
  }

  reset() {
    this.end();
    for (const query of this.pending) this.gl.deleteQuery(query);
    this.pending.length = 0;
    this.milliseconds = null;
    this.frame = 0;
  }
}
