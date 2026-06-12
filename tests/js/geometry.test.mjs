import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { zoneOf, ptSegDist, edgeLength, expandBins, enrichForExport } from '../../app/js/geometry.js';

const defaultLayout = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../app/data/default_layout.json', import.meta.url)), 'utf8'),
);

test('zoneOf finds the containing zone', () => {
  const z = zoneOf(defaultLayout.zones, 70, 45);
  assert.equal(z.id, 'D');
});

test('zoneOf returns null outside every zone', () => {
  assert.equal(zoneOf(defaultLayout.zones, -50, -50), null);
});

test('ptSegDist: distance to a horizontal segment', () => {
  assert.equal(ptSegDist(5, 3, 0, 0, 10, 0), 3);
});

test('ptSegDist: clamps to the nearest endpoint', () => {
  assert.equal(ptSegDist(-4, 0, 0, 0, 10, 0), 4);
});

test('edgeLength rounds the straight-line distance', () => {
  const nodes = [
    { id: 'A', x: 0, y: 0 },
    { id: 'B', x: 3, y: 4 },
  ];
  assert.equal(edgeLength(nodes, { a: 'A', b: 'B' }), 5);
});

test('edgeLength is null when an endpoint is missing', () => {
  assert.equal(edgeLength([{ id: 'A', x: 0, y: 0 }], { a: 'A', b: 'X' }), null);
});

test('expandBins produces bays x levels bins per run', () => {
  const expected = defaultLayout.racks.reduce((sum, r) => sum + r.bays * Math.max(r.levels, 1), 0);
  assert.equal(expandBins(defaultLayout).length, expected);
});

test('expanded bin labels follow ZONE-ROW-BAY-LEVEL', () => {
  const bins = expandBins(defaultLayout);
  assert.match(bins[0].bin_label, /^[A-Z?]+-[A-Za-z0-9]+-\d{2}-\d+$/);
});

test('enrichForExport adds zone, distance and bins without mutating state', () => {
  const snapshot = JSON.parse(JSON.stringify(defaultLayout));
  const out = enrichForExport(defaultLayout);
  assert.ok(Array.isArray(out.bins));
  assert.ok('zone' in out.nodes[0]);
  assert.ok('distance_m' in out.edges[0]);
  assert.deepEqual(defaultLayout, snapshot); // input untouched
});
