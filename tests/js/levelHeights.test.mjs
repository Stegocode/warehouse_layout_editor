import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { migrate } from '../../app/js/migrations.js';
import { fromDbConnect } from '../../app/js/dbconnect.js';
import { validateLayout, SCHEMA_VERSION } from '../../app/js/schema.js';
import { levelBaseZ } from '../../app/js/geometry.js';

const defaultLayout = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../app/data/default_layout.json', import.meta.url)), 'utf8'),
);

// A synthetic v2 layout that mirrors the real default_layout.json data so we
// can exercise the 2→3 migration path explicitly.
const defaultV2 = {
  schemaVersion: 2,
  meta: { name: 'OUTLET WAREHOUSE' },
  settings: { snap: 1, grid: 1 },
  binTypes: {
    STD: { w: 3, d: 1, h: 6, color: '#6f93c4' },
    TALL: { w: 4.5, d: 4, h: 8.5, color: '#5fb878' },
    FLOOR: { w: 3, d: 6, h: 0, color: '#c4a05f' },
    TYPE1: { w: 4.5, d: 4, h: 6, color: '#8f7fc4' },
  },
  zones: [],
  nodes: [],
  edges: [],
  racks: [
    { id: 'ROW-C', type: 'STD', dir: 'N', bays: 13, levels: 3, x: -65, y: 15 },
    { id: 'ROW-B', type: 'STD', dir: 'N', bays: 13, levels: 3, x: -64, y: 15 },
  ],
  bg: null,
};

// A v2 layout with a zero-height (FLOOR) bin type to test the 0.12 fallback.
const v2WithFloor = {
  schemaVersion: 2,
  meta: { name: 'TEST' },
  settings: { snap: 1, grid: 1 },
  binTypes: {
    STD: { w: 3, d: 1, h: 6, color: '#6f93c4' },
    FLOOR: { w: 3, d: 6, h: 0, color: '#c4a05f' },
  },
  zones: [],
  nodes: [],
  edges: [],
  racks: [
    { id: 'ROW-A', type: 'STD', dir: 'N', bays: 5, levels: 3, x: 0, y: 0 },
    { id: 'ROW-B', type: 'FLOOR', dir: 'E', bays: 2, levels: 1, x: 10, y: 0 },
  ],
  bg: null,
};

// ── 2→3 migration ─────────────────────────────────────────────────────────

test('2→3 migration produces levelHeights with length === levels', () => {
  const up = migrate(v2WithFloor);
  // v5 db_connect format: version lives in editor block
  assert.equal(up.editor.schemaVersion, SCHEMA_VERSION);
  assert.equal(up.racks[0].levelHeights.length, 3);
  assert.equal(up.racks[1].levelHeights.length, 1);
});

test('2→3 migration seeds uniform height from binType.h', () => {
  const up = migrate(v2WithFloor);
  // STD has h=6; all 3 levels should be seeded with 6
  assert.deepEqual(up.racks[0].levelHeights, [6, 6, 6]);
});

test('2→3 migration falls back to 0.12 for zero-height bin types', () => {
  const up = migrate(v2WithFloor);
  // FLOOR has h=0; fallback is 0.12 so the visual renders identically
  assert.deepEqual(up.racks[1].levelHeights, [0.12]);
});

test('2→3 migration does not mutate its input', () => {
  const before = JSON.parse(JSON.stringify(v2WithFloor));
  migrate(v2WithFloor);
  assert.deepEqual(v2WithFloor, before);
});

test('2→3 migration skips racks that already have levelHeights', () => {
  const withExisting = {
    ...v2WithFloor,
    racks: [{ ...v2WithFloor.racks[0], levelHeights: [4, 5, 6] }],
  };
  const up = migrate(withExisting);
  assert.deepEqual(up.racks[0].levelHeights, [4, 5, 6]);
});

test('real default_layout.json data (v2 snapshot) migrates to current schema version', () => {
  const up = migrate(defaultV2);
  // v5 db_connect format: version lives in editor block
  assert.equal(up.editor.schemaVersion, SCHEMA_VERSION);
  // Each rack seeded with 3 levels of h=6 (STD bin type) by the 2→3 step
  up.racks.forEach((r) => {
    assert.equal(r.levelHeights.length, r.levels);
    assert.ok(r.levelHeights.every((h) => h === 6));
  });
  // Convert to editor-native state before validating
  const state = fromDbConnect(up);
  const { ok, errors } = validateLayout(state);
  assert.ok(ok, `Validation failed after migration: ${errors.join('; ')}`);
});

test('shipped default_layout.json passes validation after fromDbConnect', () => {
  // v5 file: version lives in editor block; convert to editor state before validating
  assert.equal(defaultLayout.editor.schemaVersion, SCHEMA_VERSION);
  const state = fromDbConnect(defaultLayout);
  const { ok, errors } = validateLayout(state);
  assert.ok(ok, `default_layout.json is invalid: ${errors.join('; ')}`);
});

// ── validateLayout for v3 ─────────────────────────────────────────────────

const validV3Rack = {
  id: 'ROW-A',
  type: 'STD',
  dir: 'N',
  bays: 5,
  levels: 3,
  levelHeights: [6, 7, 8],
  rowToken: 'A',
  bayStart: 1,
  bayReverse: false,
  x: 0,
  y: 0,
};

const validV3 = {
  schemaVersion: SCHEMA_VERSION,
  meta: { name: 'TEST' },
  settings: { snap: 1, grid: 1 },
  naming: { separator: '-', bayPad: 2 },
  binOverrides: {},
  binTypes: { STD: { w: 3, d: 1, h: 6, color: '#6f93c4' } },
  zones: [],
  nodes: [],
  edges: [],
  racks: [validV3Rack],
  bg: null,
};

test('validateLayout accepts a rack with matching levelHeights', () => {
  const { ok, errors } = validateLayout(validV3);
  assert.ok(ok, errors.join('; '));
});

test('validateLayout accepts per-level heights that differ from bin type h', () => {
  const layout = { ...validV3, racks: [{ ...validV3Rack, levelHeights: [4, 6, 10] }] };
  const { ok, errors } = validateLayout(layout);
  assert.ok(ok, errors.join('; '));
});

test('validateLayout rejects levelHeights with length shorter than levels', () => {
  const bad = { ...validV3, racks: [{ ...validV3Rack, levels: 3, levelHeights: [6, 6] }] };
  const { ok } = validateLayout(bad);
  assert.equal(ok, false);
});

test('validateLayout rejects levelHeights with length longer than levels', () => {
  const bad = { ...validV3, racks: [{ ...validV3Rack, levels: 2, levelHeights: [6, 6, 6] }] };
  const { ok } = validateLayout(bad);
  assert.equal(ok, false);
});

test('validateLayout rejects a zero height entry', () => {
  const bad = { ...validV3, racks: [{ ...validV3Rack, levelHeights: [6, 0, 6] }] };
  const { ok } = validateLayout(bad);
  assert.equal(ok, false);
});

test('validateLayout rejects a negative height entry', () => {
  const bad = { ...validV3, racks: [{ ...validV3Rack, levelHeights: [6, -1, 6] }] };
  const { ok } = validateLayout(bad);
  assert.equal(ok, false);
});

test('validateLayout rejects a non-numeric height entry', () => {
  const bad = { ...validV3, racks: [{ ...validV3Rack, levelHeights: [6, 'tall', 6] }] };
  const { ok } = validateLayout(bad);
  assert.equal(ok, false);
});

test('validateLayout rejects non-array levelHeights', () => {
  const bad = { ...validV3, racks: [{ ...validV3Rack, levelHeights: 6 }] };
  const { ok } = validateLayout(bad);
  assert.equal(ok, false);
});

test('validateLayout rejects missing levelHeights', () => {
  const rackNoLH = Object.assign({}, validV3Rack);
  delete rackNoLH.levelHeights;
  const bad = { ...validV3, racks: [rackNoLH] };
  const { ok } = validateLayout(bad);
  assert.equal(ok, false);
});

// ── cumulative-z stacking math (levelBaseZ) ───────────────────────────────

test('levelBaseZ returns 0 for the first level', () => {
  assert.equal(levelBaseZ([6, 8, 10], 0), 0);
});

test('levelBaseZ accumulates the preceding level heights', () => {
  assert.equal(levelBaseZ([6, 8, 10], 1), 6);
  assert.equal(levelBaseZ([6, 8, 10], 2), 14);
});

test('levelBaseZ with uniform heights matches old index × h formula', () => {
  const h = 6;
  const heights = [h, h, h];
  for (let l = 0; l < 3; l++) {
    assert.equal(levelBaseZ(heights, l), l * h);
  }
});

test('levelBaseZ center position matches old formula for uniform heights', () => {
  // Old render: center = elev + h/2 + l * t.h
  // New render: center = elev + levelBaseZ(levelHeights, l) + lh/2
  // With uniform heights these must be equal.
  const h = 6;
  const heights = [h, h, h];
  for (let l = 0; l < 3; l++) {
    const oldCenter = h / 2 + l * h;
    const newCenter = levelBaseZ(heights, l) + h / 2;
    assert.equal(newCenter, oldCenter);
  }
});
