import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { zoneOf, ptSegDist, edgeLength, expandBins, enrichForExport } from '../../app/js/geometry.js';

const defaultLayout = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../app/data/default_layout.json', import.meta.url)), 'utf8'),
);

test('zoneOf finds the containing zone', () => {
  // zone "1": x:-70, y:0, w:75, d:60 — point (-40, 30) is inside
  const z = zoneOf(defaultLayout.zones, -40, 30);
  assert.equal(z.id, '1');
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

test('expanded bin labels follow ROW-BAY-LEVEL (no zone prefix)', () => {
  const bins = expandBins(defaultLayout);
  // Format: rowToken-paddedBay-level, e.g. "C-01-1"
  assert.match(bins[0].bin_label, /^[A-Za-z0-9]+-\d+-\d+$/);
  // bin_label and whse_location must be identical
  assert.equal(bins[0].bin_label, bins[0].whse_location);
});

test('enrichForExport adds zone, distance and bins without mutating state', () => {
  const layout = JSON.parse(JSON.stringify(defaultLayout));
  layout.nodes = [
    { id: 'N1', kind: 'junction', x: -40, y: 30 },
    { id: 'N2', kind: 'junction', x: -50, y: 30 },
  ];
  layout.edges = [{ a: 'N1', b: 'N2', ramp: false }];
  const snapshot = JSON.parse(JSON.stringify(layout));
  const out = enrichForExport(layout);
  assert.ok(Array.isArray(out.bins));
  assert.ok('zone' in out.nodes[0]);
  assert.ok('distance_m' in out.edges[0]);
  assert.deepEqual(layout, snapshot); // input untouched
});
