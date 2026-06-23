import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  zoneOf,
  ptSegDist,
  edgeLength,
  expandBins,
  enrichForExport,
  bayOf,
  resolveBayLabel,
} from '../../app/js/geometry.js';
import { fromDbConnect } from '../../app/js/dbconnect.js';

const defaultLayout = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../app/data/default_layout.json', import.meta.url)), 'utf8'),
);
// v5 file — convert to editor-native state for functions that expect it
const defaultState = fromDbConnect(defaultLayout);

test('zoneOf finds the containing zone', () => {
  // zone "1": x:-70, y:0, w:75, d:60 — point (-40, 30) is inside
  const z = zoneOf(defaultState.zones, -40, 30);
  assert.equal(z.id, '1');
});

test('zoneOf returns null outside every zone', () => {
  assert.equal(zoneOf(defaultState.zones, -50, -50), null);
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
  const expected = defaultState.racks.reduce((sum, r) => sum + r.bays * Math.max(r.levels, 1), 0);
  assert.equal(expandBins(defaultState).length, expected);
});

test('expanded bin labels follow ROW-BAY-LEVEL (no zone prefix)', () => {
  const bins = expandBins(defaultState);
  // Format: rowToken-paddedBay-level, e.g. "C-01-1"
  assert.match(bins[0].bin_label, /^[A-Za-z0-9]+-\d+-\d+$/);
  // bin_label and whse_location must be identical
  assert.equal(bins[0].bin_label, bins[0].whse_location);
});

// ── bayOf ────────────────────────────────────────────────────────────────────

const BT = { STD: { w: 3, d: 2 } };

test('bayOf dir=E: returns correct bay index for interior point', () => {
  const rack = { id: 'R', type: 'STD', dir: 'E', bays: 4, x: 0, y: 0 };
  assert.equal(bayOf(rack, BT, 1.5, 1), 0); // first bay
  assert.equal(bayOf(rack, BT, 3.5, 1), 1); // second bay
  assert.equal(bayOf(rack, BT, 9.5, 1), 3); // fourth bay
});

test('bayOf dir=E: returns null outside the footprint', () => {
  const rack = { id: 'R', type: 'STD', dir: 'E', bays: 3, x: 0, y: 0 };
  assert.equal(bayOf(rack, BT, -1, 1), null); // left of rack
  assert.equal(bayOf(rack, BT, 10, 1), null); // right of rack (3*3=9)
  assert.equal(bayOf(rack, BT, 1, 3), null); // above rack (d=2)
});

test('bayOf dir=N: returns correct bay index for interior point', () => {
  const rack = { id: 'R', type: 'STD', dir: 'N', bays: 4, x: 0, y: 0 };
  assert.equal(bayOf(rack, BT, 1, 1.5), 0); // first bay (y 0-3)
  assert.equal(bayOf(rack, BT, 1, 4.5), 1); // second bay (y 3-6)
});

test('bayOf dir=N: returns null outside the footprint', () => {
  const rack = { id: 'R', type: 'STD', dir: 'N', bays: 3, x: 0, y: 0 };
  assert.equal(bayOf(rack, BT, 1, -1), null);
  assert.equal(bayOf(rack, BT, 3, 1), null); // outside depth (d=2)
});

test('bayOf: unknown bin type returns null', () => {
  const rack = { id: 'R', type: 'MISSING', dir: 'E', bays: 3, x: 0, y: 0 };
  assert.equal(bayOf(rack, {}, 1, 1), null);
});

// ── resolveBayLabel ───────────────────────────────────────────────────────────

const NAMING_STATE = { naming: { separator: '-', bayPad: 2 }, binOverrides: {} };

test('resolveBayLabel: first bay is 01 with default naming', () => {
  const rack = { id: 'ROW-C', rowToken: 'C', bayStart: 1, bayReverse: false, bays: 13, type: 'STD' };
  assert.equal(resolveBayLabel(NAMING_STATE, rack, 0), 'C-01');
});

test('resolveBayLabel: last bay reflects bays count', () => {
  const rack = { id: 'ROW-C', rowToken: 'C', bayStart: 1, bayReverse: false, bays: 13, type: 'STD' };
  assert.equal(resolveBayLabel(NAMING_STATE, rack, 12), 'C-13');
});

test('resolveBayLabel: bayReverse reverses the numbering', () => {
  const rack = { id: 'ROW-C', rowToken: 'C', bayStart: 1, bayReverse: true, bays: 13, type: 'STD' };
  assert.equal(resolveBayLabel(NAMING_STATE, rack, 0), 'C-13');
  assert.equal(resolveBayLabel(NAMING_STATE, rack, 12), 'C-01');
});

test('resolveBayLabel: bayStart offsets the number', () => {
  const rack = { id: 'ROW-A', rowToken: 'A', bayStart: 5, bayReverse: false, bays: 4, type: 'STD' };
  assert.equal(resolveBayLabel(NAMING_STATE, rack, 0), 'A-05');
  assert.equal(resolveBayLabel(NAMING_STATE, rack, 3), 'A-08');
});

test('resolveBayLabel: custom separator and bayPad', () => {
  const state = { naming: { separator: '/', bayPad: 3 }, binOverrides: {} };
  const rack = { id: 'ROW-X', rowToken: 'X', bayStart: 1, bayReverse: false, bays: 2, type: 'STD' };
  assert.equal(resolveBayLabel(state, rack, 0), 'X/001');
});

test('resolveBayLabel matches expandBins level-1 prefix for every bay', () => {
  const state = {
    naming: { separator: '-', bayPad: 2 },
    binOverrides: {},
    binTypes: { STD: { w: 3, d: 2, h: 6, color: '#aaa' } },
    zones: [],
    racks: [
      {
        id: 'ROW-C',
        type: 'STD',
        dir: 'N',
        bays: 4,
        levels: 2,
        levelHeights: [6, 6],
        rowToken: 'C',
        bayStart: 1,
        bayReverse: true,
        x: 0,
        y: 0,
      },
    ],
  };
  const rack = state.racks[0];
  const sep = state.naming.separator;
  const level1 = expandBins(state).filter((b) => b.row === rack.id && b.level === 1);
  for (let b = 0; b < rack.bays; b++) {
    const bayLabel = resolveBayLabel(state, rack, b);
    assert.equal(level1[b].whse_location, `${bayLabel}${sep}1`, `bay ${b} mismatch`);
  }
});

test('enrichForExport adds zone, distance and bins without mutating state', () => {
  const state = JSON.parse(JSON.stringify(defaultState));
  state.nodes = [
    { id: 'N1', kind: 'junction', x: -40, y: 30 },
    { id: 'N2', kind: 'junction', x: -50, y: 30 },
  ];
  state.edges = [{ a: 'N1', b: 'N2', ramp: false }];
  const snapshot = JSON.parse(JSON.stringify(state));
  const out = enrichForExport(state);
  assert.ok(Array.isArray(out.bins));
  assert.ok('zone' in out.nodes[0]);
  assert.ok('distance_m' in out.edges[0]);
  assert.deepEqual(state, snapshot); // input untouched
});
