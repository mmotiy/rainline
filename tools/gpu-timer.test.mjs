import assert from 'node:assert/strict';
import test from 'node:test';
import {GpuTimer, withoutShadowUpdate} from '../render-performance.mjs';

test('normal-only passes reuse shadows and restore state after errors', () => {
  const renderer = {shadowMap: {autoUpdate: true, needsUpdate: true}};
  assert.throws(() => withoutShadowUpdate(renderer, () => {
    assert.deepEqual(renderer.shadowMap, {autoUpdate: false, needsUpdate: false});
    throw new Error('render failed');
  }), /render failed/);
  assert.deepEqual(renderer.shadowMap, {autoUpdate: true, needsUpdate: true});
});

function context() {
  const ext = {TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2};
  const gl = {
    QUERY_RESULT_AVAILABLE: 3, QUERY_RESULT: 4, available: false, disjoint: false,
    deleted: 0, reads: 0,
    getExtension: () => ext, createQuery: () => ({}),
    beginQuery() {}, endQuery() {},
    getParameter() { return this.disjoint; },
    getQueryParameter(q, parameter) {
      if (parameter === this.QUERY_RESULT_AVAILABLE) return this.available;
      this.reads++; return 12000000;
    },
    deleteQuery() { this.deleted++; },
  };
  return gl;
}

test('GPU timing polls asynchronously and converts nanoseconds to milliseconds', () => {
  const gl = context();
  const timer = new GpuTimer(gl, 1, 0);
  timer.begin(); timer.end(); timer.begin(); timer.end();
  assert.equal(gl.reads, 0, 'Never read a pending GPU result');
  assert.equal(timer.milliseconds, null);
  gl.available = true;
  timer.begin(); timer.end();
  assert.equal(timer.milliseconds, 12);
  assert.equal(gl.deleted, 2);
});

test('disjoint timing discards results and clears the displayed sample', () => {
  const gl = context();
  const timer = new GpuTimer(gl, 1, 0);
  timer.begin(); timer.end(); gl.available = true;
  timer.begin(); timer.end();
  gl.disjoint = true;
  timer.begin(); timer.end();
  assert.equal(timer.milliseconds, null);
  assert.equal(timer.pending.length, 0);
});

test('unsupported GPU timing is a no-op', () => {
  const timer = new GpuTimer({getExtension: () => null});
  timer.begin(); timer.end();
  assert.equal(timer.milliseconds, null);
});

test('shader warmup is excluded and reset releases stale samples', () => {
  const gl = context();
  const timer = new GpuTimer(gl, 1, 2);
  timer.begin(); timer.end(); timer.begin(); timer.end();
  assert.equal(timer.pending.length, 0);
  timer.begin(); timer.end();
  assert.equal(timer.pending.length, 1);
  timer.reset();
  assert.equal(timer.pending.length, 0);
  assert.equal(gl.deleted, 1);
  assert.equal(timer.milliseconds, null);
});
