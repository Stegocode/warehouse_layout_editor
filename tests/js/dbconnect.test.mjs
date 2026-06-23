import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { toDbConnect, fromDbConnect } from '../../app/js/dbconnect.js';
import { migrate } from '../../app/js/migrations.js';
import { validateLayout, SCHEMA_VERSION } from '../../app/js/schema.js';
import { expandBins } from '../../app/js/geometry.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function readFixture(name) {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), 'utf8'));
}

// Minimal v4 editor-native layout suitable as a migration source.
const V4_RACK = {
  id: 'ROW-A',
  type: 'STD',
  dir: 'N',
  bays: 3,
  levels: 2,
  levelHeights: [6, 8],
  rowToken: 'A',
  bayStart: 1,
  bayReverse: false,
  x: 5,
  y: 10,
};

const V4_LAYOUT = {
  schemaVersion: 4,
  meta: { name: 'TEST WAREHOUSE' },
  settings: { snap: 1, grid: 1 },
  naming: { separator: '-', bayPad: 2 },
  binOverrides: {},
  binTypes: { STD: { w: 3, d: 1, h: 6, color: '#6f93c4' } },
  zones: [{ id: 'MAIN', x: 0, y: 0, w: 50, d: 40, elev: 0, clearH: 10, color: '#55657d' }],
  nodes: [],
  edges: [],
  racks: [V4_RACK],
  bg: null,
};

// Minimal editor-native state (v5 schemaVersion) for toDbConnect / fromDbConnect tests.
function makeEditorState(overrides = {}) {
  return {
    schemaVersion: 5,
    meta: { name: 'TEST' },
    settings: { snap: 1, grid: 1 },
    naming: { separator: '-', bayPad: 2 },
    binOverrides: {},
    binTypes: { STD: { w: 3, d: 1, h: 6, color: '#6f93c4' } },
    zones: [{ id: 'ZONE1', x: 0, y: 0, w: 50, d: 50, elev: 0, clearH: 8, color: '#aaa' }],
    nodes: [],
    edges: [],
    racks: [
      {
        id: 'ROW-C',
        type: 'STD',
        dir: 'N',
        bays: 3,
        levels: 2,
        levelHeights: [6, 8],
        rowToken: 'C',
        bayStart: 1,
        bayReverse: false,
        x: 5,
        y: 5,
      },
    ],
    bg: null,
    ...overrides,
  };
}

// ── 1. whse_location is 3-part ROW-BAY-LEVEL, zone NOT in string ─────────────

test('toDbConnect bins use 3-part whse_location with no zone prefix', () => {
  const db = toDbConnect(makeEditorState());
  const first = db.bins[0];
  // Format: rowToken-bay-level, e.g. "C-01-1"
  assert.match(first.whse_location, /^[A-Za-z0-9]+-\d+-\d+$/);
  // Zone must not appear in the label string
  assert.equal(first.whse_location.includes('ZONE1'), false);
  assert.equal(first.whse_location, 'C-01-1');
});

test('bin record carries zone field but zone is absent from whse_location string', () => {
  const db = toDbConnect(makeEditorState());
  const first = db.bins[0];
  // The bin record has the zone field (set to the zone id)
  assert.equal(first.zone, 'ZONE1');
  // But whse_location is just ROW-BAY-LEVEL
  assert.equal(first.whse_location.includes('ZONE1'), false);
});

test('binOverride wins over generated whse_location', () => {
  const state = makeEditorState();
  state.binOverrides['ROW-C|0|1'] = 'CUSTOM-LABEL';
  const db = toDbConnect(state);
  const overridden = db.bins.find((b) => b.bay === 1 && b.level === 1);
  assert.equal(overridden.whse_location, 'CUSTOM-LABEL');
  // Non-overridden bins use generated label
  const other = db.bins.find((b) => b.bay === 2 && b.level === 1);
  assert.equal(other.whse_location, 'C-02-1');
});

// ── 2. Lossless round-trip on the test fixture ────────────────────────────────

test('fromDbConnect -> toDbConnect: pass-through sections survive unchanged', () => {
  const orig = readFixture('dbconnect_sample.json');
  const state = fromDbConnect(orig);
  const out = toDbConnect(state);

  // categories, vehicles, dwell_times must be deep-equal to original
  assert.deepEqual(out.categories, orig.categories);
  assert.deepEqual(out.vehicles, orig.vehicles);
  assert.deepEqual(out.dwell_times, orig.dwell_times);
});

test('fromDbConnect -> toDbConnect: editor block survives', () => {
  const orig = readFixture('dbconnect_sample.json');
  const state = fromDbConnect(orig);
  const out = toDbConnect(state);

  assert.equal(out.editor.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(out.editor.naming, orig.editor.naming);
  assert.deepEqual(out.editor.binOverrides, orig.editor.binOverrides);
});

test('fromDbConnect -> toDbConnect: zone.operations passes through', () => {
  const orig = readFixture('dbconnect_sample.json');
  const state = fromDbConnect(orig);
  const out = toDbConnect(state);

  const origOps = orig.zones[0].operations;
  const outOps = out.zones[0].operations;
  assert.deepEqual(outOps, origOps);
});

test('fromDbConnect -> toDbConnect: edge pass-through attributes survive', () => {
  const orig = readFixture('dbconnect_sample.json');
  const state = fromDbConnect(orig);
  const out = toDbConnect(state);

  const origEdge = orig.edges[0];
  const outEdge = out.edges[0];
  assert.equal(outEdge.traffic_class, origEdge.traffic_class);
  assert.equal(outEdge.width_m, origEdge.width_m);
  assert.equal(outEdge.direction, origEdge.direction);
  assert.equal(outEdge.speed_limit_mps, origEdge.speed_limit_mps);
  assert.equal(outEdge.surface, origEdge.surface);
  // distance_m is regenerated — assert it is non-negative
  assert.ok(outEdge.distance_m >= 0);
});

test('fromDbConnect -> toDbConnect: rack pass-through attributes survive', () => {
  const orig = readFixture('dbconnect_sample.json');
  const state = fromDbConnect(orig);
  const out = toDbConnect(state);

  const origRack = orig.racks[0];
  const outRack = out.racks[0];
  assert.equal(outRack.access_face, origRack.access_face);
  assert.equal(outRack.access_face_note, origRack.access_face_note);
  assert.equal(outRack.back_to_back_spine, origRack.back_to_back_spine);
});

test('fromDbConnect -> toDbConnect: binType extras survive', () => {
  const orig = readFixture('dbconnect_sample.json');
  const state = fromDbConnect(orig);
  const out = toDbConnect(state);

  const origBT = orig.binTypes['STD'];
  const outBT = out.binTypes['STD'];
  assert.equal(outBT.description, origBT.description);
  assert.equal(outBT.max_weight_kg, origBT.max_weight_kg);
  assert.deepEqual(outBT.allowed_categories, origBT.allowed_categories);
});

test('round-trip bins are regenerated to 3-part HomeSource format', () => {
  const orig = readFixture('dbconnect_sample.json');
  const state = fromDbConnect(orig);
  const out = toDbConnect(state);

  // All output bins must use 3-part format
  assert.ok(out.bins.every((b) => /^[A-Za-z0-9]+-\d+-\d+$/.test(b.whse_location)));
  // Count must match racks × bays × levels
  const expectedCount = state.racks.reduce((s, r) => s + r.bays * r.levels, 0);
  assert.equal(out.bins.length, expectedCount);
});

// ── 3. dir -> orientation -> dir round-trip ───────────────────────────────────

test('dir E -> orientation length_along_x -> dir E (no flip)', () => {
  const state = makeEditorState({
    racks: [{ ...makeEditorState().racks[0], dir: 'E' }],
  });
  const db = toDbConnect(state);
  assert.equal(db.racks[0].orientation, 'length_along_x');
  const back = fromDbConnect(db);
  assert.equal(back.racks[0].dir, 'E');
});

test('dir N -> orientation length_along_y -> dir N (no flip)', () => {
  const state = makeEditorState();
  const db = toDbConnect(state);
  assert.equal(db.racks[0].orientation, 'length_along_y');
  const back = fromDbConnect(db);
  assert.equal(back.racks[0].dir, 'N');
});

// ── 4. Migration v4 -> v5 validates and renders identically ──────────────────

test('migrate v4 layout produces valid v5 editor state', () => {
  const db = migrate(V4_LAYOUT);
  assert.equal(db.editor.schemaVersion, SCHEMA_VERSION);
  const state = fromDbConnect(db);
  const { ok, errors } = validateLayout(state);
  assert.ok(ok, `Validation failed: ${errors.join('; ')}`);
});

test('migrate v4 -> v5: rack positions and bin labels are identical to pre-migration', () => {
  // expandBins on the original v4 layout
  const preBins = expandBins(V4_LAYOUT);

  // Migrate then round-trip to editor state
  const db = migrate(V4_LAYOUT);
  const state = fromDbConnect(db);
  const postBins = expandBins(state);

  assert.equal(postBins.length, preBins.length);
  preBins.forEach((pre, i) => {
    const post = postBins[i];
    assert.equal(post.x, pre.x, `bin[${i}].x differs`);
    assert.equal(post.y, pre.y, `bin[${i}].y differs`);
    assert.equal(post.z, pre.z, `bin[${i}].z differs`);
    assert.equal(post.whse_location, pre.whse_location, `bin[${i}].whse_location differs`);
  });
});

test('migrate v4 -> v5: naming and binOverrides survive in editor block', () => {
  const withOverride = {
    ...V4_LAYOUT,
    naming: { separator: '/', bayPad: 3 },
    binOverrides: { 'ROW-A|0|1': 'KEPT' },
  };
  const db = migrate(withOverride);
  assert.deepEqual(db.editor.naming, { separator: '/', bayPad: 3 });
  assert.equal(db.editor.binOverrides['ROW-A|0|1'], 'KEPT');
});

test('migrate v4 -> v5: coordinate_system is declared with receiving-station origin', () => {
  const db = migrate(V4_LAYOUT);
  const cs = db.meta.coordinate_system;
  assert.ok(cs, 'coordinate_system must be present');
  assert.equal(cs.units, 'metres');
  assert.equal(cs.origin.x, 0);
  assert.equal(cs.origin.y, 0);
  assert.equal(cs.origin.z, 0);
  assert.ok(cs.x_axis.includes('East'));
  assert.ok(cs.y_axis.includes('North'));
});

// ── 5. Distance is always >= 0 even with all-negative coordinates ─────────────

test('edge distance_m >= 0 when both endpoints have negative coordinates', () => {
  const state = makeEditorState({
    nodes: [
      { id: 'A', x: -100, y: -50 },
      { id: 'B', x: -80, y: -30 },
    ],
    edges: [{ a: 'A', b: 'B', ramp: false }],
  });
  const db = toDbConnect(state);
  assert.equal(db.edges.length, 1);
  const d = db.edges[0].distance_m;
  assert.ok(d >= 0, `distance_m was ${d}`);
  // Expected: sqrt(((-80)-(-100))^2 + ((-30)-(-50))^2) = sqrt(400+400) ≈ 28.3
  assert.equal(d, +Math.hypot(20, 20).toFixed(1));
});

test('migration v4->v5 edge distance_m >= 0 with negative-coordinate nodes', () => {
  const v4WithNegNodes = {
    ...V4_LAYOUT,
    nodes: [
      { id: 'N1', x: -65, y: -10 },
      { id: 'N2', x: -40, y: -30 },
    ],
    edges: [{ a: 'N1', b: 'N2', ramp: false }],
  };
  const db = migrate(v4WithNegNodes);
  db.edges.forEach((e) => {
    assert.ok(e.distance_m >= 0, `distance_m was ${e.distance_m}`);
  });
});
