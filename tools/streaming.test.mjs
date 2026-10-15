import assert from 'node:assert/strict';
import test from 'node:test';
import {createCellIndex, queryCells} from '../render-performance.mjs';

test('spatial queries preserve all distance transitions and source order', () => {
  const cells = [];
  for (let x = -600; x <= 600; x += 16) {
    for (let z = -600; z <= 600; z += 16) {
      cells.push({x, y: (x + z) % 144, z, state: 0});
    }
  }
  const index = createCellIndex(cells);
  let examined = 0;
  for (const [cx, cy, cz, radius] of [
    [0, 2, 0, 258.8], [8, 2, 0, 258.8], [-130, 170, 90, 128.8],
    [580, 0, -590, 70], [-580, 0, 590, 258.8], [9000, 0, 9000, 258.8],
  ]) {
    const candidates = queryCells(index, cx, cz, radius);
    examined += candidates.length;
    const relevant = cells.filter(cell => cell.state ||
      Math.hypot(cell.x - cx, cell.y - cy, cell.z - cz) < radius);
    assert.deepEqual(candidates.filter(cell => relevant.includes(cell)), relevant);
    for (const cell of candidates) {
      cell.state = Math.hypot(cell.x - cx, cell.y - cy, cell.z - cz) < radius ? 1 : 0;
      if (cell.state) index.active.add(cell);
      else index.active.delete(cell);
    }
    assert.equal(index.active.size, cells.filter(cell => cell.state).length);
  }
  assert.ok(examined < cells.length * 6 * 0.5, 'Queries must avoid scanning the whole city');
});

test('negative coordinates, exact bucket edges and loaded far cells are included', () => {
  const cells = [
    {x: -64, y: 0, z: -64}, {x: 0, y: 0, z: 0},
    {x: 64, y: 0, z: 64}, {x: 1000, y: 0, z: 1000},
  ];
  const index = createCellIndex(cells);
  index.active.add(cells[3]);
  assert.deepEqual(queryCells(index, 0, 0, 64), cells);
  assert.deepEqual(queryCells(index, -64, -64, 0), [cells[0], cells[3]]);
});
