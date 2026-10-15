import * as THREE from 'three';

/**
 * Static city batches cache instance bounds instead of transforming them in
 * every colour, normal and shadow pass. Internal draw-list fields match the
 * pinned Three.js r170; revalidate this adapter before upgrading Three.js.
 */
export class CityBatch extends THREE.BatchedMesh {
  constructor(...args) {
    super(...args);
    this.instanceBounds = [];
    this.instanceGroups = [];
    this.cullGroups = new Map();
    this.cullFrustum = new THREE.Frustum();
    this.cullMatrix = new THREE.Matrix4();
    this.lastCullMatrix = null;
    this.perObjectFrustumCulled = true;
    this.sortObjects = false;
    // The aggregate bounds change during streaming. Group bounds below
    // are checked against each pass's own camera, including the shadow camera.
    this.frustumCulled = false;
  }

  setMatrixAt(id, matrix) {
    super.setMatrixAt(id, matrix);
    const sphere = this.instanceBounds[id] || new THREE.Sphere();
    this.getBoundingSphereAt(this._instanceInfo[id].geometryIndex, sphere);
    sphere.applyMatrix4(matrix);
    this.instanceBounds[id] = sphere;
    const old = this.instanceGroups[id];
    if (old) {
      old.ids.delete(id);
      old.dirty = true;
      if (!old.ids.size) this.cullGroups.delete(old.key);
    }
    const key = Math.floor(sphere.center.x / 32) + ',' +
        Math.floor(sphere.center.y / 32) + ',' + Math.floor(sphere.center.z / 32);
    let group = this.cullGroups.get(key);
    if (!group) {
      group = {key, ids: new Set(), sphere: new THREE.Sphere(), dirty: true};
      this.cullGroups.set(key, group);
    }
    group.ids.add(id);
    group.dirty = true;
    this.instanceGroups[id] = group;
    this._visibilityChanged = true;
    return this;
  }

  onBeforeRender(renderer, scene, camera, geometry, material) {
    if (!this.perObjectFrustumCulled || this.sortObjects) {
      this.lastCullMatrix = null;
      super.onBeforeRender(renderer, scene, camera, geometry, material);
      return;
    }
    this.cullMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
        .multiply(this.matrixWorld);
    if (!this._visibilityChanged && this.lastCullMatrix?.equals(this.cullMatrix)) return;
    if (!this.lastCullMatrix) this.lastCullMatrix = new THREE.Matrix4();
    this.lastCullMatrix.copy(this.cullMatrix);
    this.cullFrustum.setFromProjectionMatrix(this.cullMatrix, renderer.coordinateSystem);
    const bytes = geometry.index ? geometry.index.array.BYTES_PER_ELEMENT : 1;
    const indirect = this._indirectTexture.image.data;
    let count = 0;
    let changed = false;
    for (const group of this.cullGroups.values()) {
      if (group.dirty) {
        group.sphere.makeEmpty();
        for (const id of group.ids) group.sphere.union(this.instanceBounds[id]);
        group.dirty = false;
      }
      group.visible = this.cullFrustum.intersectsSphere(group.sphere);
    }
    for (let id = 0; id < this._instanceInfo.length; id++) {
      const instance = this._instanceInfo[id];
      if (!instance.active || !instance.visible) continue;
      if (!this.instanceGroups[id]?.visible) continue;
      const range = this._geometryInfo[instance.geometryIndex];
      this._multiDrawStarts[count] = range.start * bytes;
      this._multiDrawCounts[count] = range.count;
      if (indirect[count] !== id) { indirect[count] = id; changed = true; }
      count++;
    }
    this._multiDrawCount = count;
    if (changed) this._indirectTexture.needsUpdate = true;
    this._visibilityChanged = false;
  }
}
