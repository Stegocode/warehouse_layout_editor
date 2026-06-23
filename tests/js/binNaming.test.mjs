import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { migrate } from '../../app/js/migrations.js';
import { fromDbConnect } from '../../app/js/dbconnect.js';
import { validateLayout, SCHEMA_VERSION } from '../../app/js/schema.js';
import { expandBins } from '../../app/js/geometry.js';

const defaultLayout = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../app/data/default_layout.json', import.meta.url)), 'utf8'),
);

// ── Minimal v4 state used as a base fixture ──────────────────────────────

const STD = { w: 3, d: 1, h: 6, color: '#6f93c4' };
const FLOOR = { w: 3, d: 6, h: 0, color: '#c4a05f' };

function makeState(rackOverrides = {}, stateOverrides = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { name: 'TEST' },
    settings: { snap: 1, grid: 1 },
    naming: { separator: '-', bayPad: 2 },
    binOverrides: {},
    binTypes: { STD, FLOOR },
    zones: [],
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
        x: 0,
        y: 0,
        ...rackOverrides,
      },
    ],
    bg: null,
    ...stateOverrides,
  };
}

// ── Layer 1: default pattern ROW-BAY-LEVEL ────────────────────────────────

test('generated label is ROW-BAY-LEVEL with no zone prefix', () => {
  const bins = expandBins(makeState());
  // First bin: rowToken=C, bay=1 (bayPad=2 → "01"), level=1
  assert.equal(bins[0].bin_label, 'C-01-1');
});

test('bin_label and whse_location are identical', () => {
  const bins = expandBins(makeState());
  bins.forEach((b) => assert.equal(b.bin_label, b.whse_location));
});

test('bay is zero-padded to naming.bayPad', () => {
  const state = makeState({ bays: 10 }, { naming: { separator: '-', bayPad: 3 } });
  const bins = expandBins(state);
  assert.equal(bins[0].bin_label, 'C-001-1'); // bay 1 padded to 3 digits
  assert.equal(bins.find((b) => b.bay === 10).bin_label, 'C-010-1');
});

test('naming.separator is used between tokens', () => {
  const state = makeState({}, { naming: { separator: '/', bayPad: 2 } });
  const bins = expandBins(state);
  assert.equal(bins[0].bin_label, 'C/01/1');
});

test('level is 1-based in the generated label', () => {
  const bins = expandBins(makeState());
  const level1 = bins.filter((b) => b.level === 1);
  const level2 = bins.filter((b) => b.level === 2);
  assert.ok(level1.every((b) => b.bin_label.endsWith('-1')));
  assert.ok(level2.every((b) => b.bin_label.endsWith('-2')));
});

// ── Layer 2: per-rack overrides ───────────────────────────────────────────

test('rowToken controls the first segment of the label', () => {
  const bins = expandBins(makeState({ rowToken: '12' }));
  assert.equal(bins[0].bin_label, '12-01-1');
});

test('bayStart offsets bay numbering without changing physical position', () => {
  const normalBins = expandBins(makeState({ bays: 3 }));
  const offsetBins = expandBins(makeState({ bays: 3, bayStart: 10 }));

  // Physical positions must be identical
  assert.equal(normalBins[0].x, offsetBins[0].x);
  assert.equal(normalBins[0].y, offsetBins[0].y);

  // Bay numbers are offset — filter level-1 bins so index maps 1:1 to physical bay
  const l1 = offsetBins.filter((b) => b.level === 1);
  assert.equal(l1[0].bay, 10); // first physical bay
  assert.equal(l1[1].bay, 11);
  assert.equal(l1[2].bay, 12); // third physical bay
  assert.equal(l1[0].bin_label, 'C-10-1');
});

test('bayReverse reverses bay numbering while physical order is unchanged', () => {
  const fwd = expandBins(makeState({ bays: 3 }));
  const rev = expandBins(makeState({ bays: 3, bayReverse: true }));

  // Physical positions must be identical
  assert.equal(fwd[0].x, rev[0].x);
  assert.equal(fwd[0].y, rev[0].y);

  // Bay numbers are flipped: first physical bay gets number 3, last gets 1
  // levels=2, so bins per bay = 2: third physical bay (b=2) starts at index 4
  assert.equal(rev[0].bay, 3); // first physical bay, level 1
  assert.equal(rev[4].bay, 1); // third physical bay (b=2), level 1 → 2 levels × 2 bays = index 4
});

test('bayReverse with bayStart: last bay has number bayStart', () => {
  // bays=3, bayStart=10, bayReverse=true → physical 0→12, 1→11, 2→10
  const bins = expandBins(makeState({ bays: 3, bayStart: 10, bayReverse: true }));
  // First physical bay gets the highest bay number
  assert.equal(bins[0].bay, 12);
  // Last physical bay (index 2) gets bayStart
  const lastBayBins = bins.filter((b) => b.level === 1).reverse();
  assert.equal(lastBayBins[0].bay, 10);
});

// ── Layer 3: per-bin overrides ────────────────────────────────────────────

test('per-bin override wins over generated label', () => {
  const state = makeState();
  // Override key: "rackId|bayIndex|level" — bayIndex is 0-based
  state.binOverrides['ROW-C|0|1'] = 'CUSTOM-LABEL';
  const bins = expandBins(state);
  assert.equal(bins[0].bin_label, 'CUSTOM-LABEL');
  assert.equal(bins[0].whse_location, 'CUSTOM-LABEL');
});

test('non-overridden bins still use generated label', () => {
  const state = makeState();
  state.binOverrides['ROW-C|0|1'] = 'CUSTOM';
  const bins = expandBins(state);
  // Second bin (bayIndex=0, level=2) should be generated
  assert.equal(bins[1].bin_label, 'C-01-2');
});

test('override_key uses 0-based bay index, not bay number', () => {
  // With bayStart=5, bayIndex=0 has bay number 5, but key uses index 0
  const state = makeState({ bayStart: 5 });
  state.binOverrides['ROW-C|0|1'] = 'OVERRIDDEN';
  const bins = expandBins(state);
  assert.equal(bins[0].bin_label, 'OVERRIDDEN');
  assert.equal(bins[0].bay, 5); // bay number is still 5
});

test('override_key is exposed on each bin', () => {
  const bins = expandBins(makeState());
  assert.equal(bins[0].override_key, 'ROW-C|0|1');
  assert.equal(bins[1].override_key, 'ROW-C|0|2'); // same bay, next level
  assert.equal(bins[2].override_key, 'ROW-C|1|1'); // next bay, level 1
});

// ── Migration 3 → 4 ───────────────────────────────────────────────────────

const v3Layout = {
  schemaVersion: 3,
  meta: { name: 'OUTLET WAREHOUSE' },
  settings: { snap: 1, grid: 1 },
  binTypes: { STD: { w: 3, d: 1, h: 6, color: '#6f93c4' } },
  zones: [],
  nodes: [],
  edges: [],
  racks: [
    { id: 'ROW-C', type: 'STD', dir: 'N', bays: 5, levels: 3, levelHeights: [6, 6, 6], x: 0, y: 0 },
    { id: 'ROW-12', type: 'STD', dir: 'E', bays: 2, levels: 1, levelHeights: [6], x: 10, y: 0 },
  ],
  bg: null,
};

test('migration from v3 seeds rowToken from rack id', () => {
  const up = migrate(v3Layout);
  // v5 db_connect format: version lives in editor block
  assert.equal(up.editor.schemaVersion, SCHEMA_VERSION);
  assert.equal(up.racks[0].rowToken, 'C'); // ROW-C → C
  assert.equal(up.racks[1].rowToken, '12'); // ROW-12 → 12
});

test('3→4 migration sets bayStart=1 and bayReverse=false', () => {
  const up = migrate(v3Layout);
  up.racks.forEach((r) => {
    assert.equal(r.bayStart, 1);
    assert.equal(r.bayReverse, false);
  });
});

test('migration adds naming defaults under editor block', () => {
  const up = migrate(v3Layout);
  // naming moved to editor.naming in v5 format
  assert.deepEqual(up.editor.naming, { separator: '-', bayPad: 2 });
});

test('migration adds empty binOverrides under editor block', () => {
  const up = migrate(v3Layout);
  assert.deepEqual(up.editor.binOverrides, {});
});

test('migration preserves existing binOverrides under editor block', () => {
  const withOverrides = { ...v3Layout, binOverrides: { 'ROW-C|0|1': 'KEPT' } };
  const up = migrate(withOverrides);
  assert.equal(up.editor.binOverrides['ROW-C|0|1'], 'KEPT');
});

test('3→4 migration does not mutate input', () => {
  const before = JSON.parse(JSON.stringify(v3Layout));
  migrate(v3Layout);
  assert.deepEqual(v3Layout, before);
});

test('migrated v3 layout labels use 3-part ROW-BAY-LEVEL (no zone)', () => {
  // Pre-migration label was ZONE-ROW-BAY-LEVEL e.g. "1-C-01-1"
  // Post-migration label is ROW-BAY-LEVEL e.g. "C-01-1" (zone dropped intentionally)
  const v3sim = {
    schemaVersion: 3,
    meta: { name: 'OUTLET WAREHOUSE' },
    settings: { snap: 1, grid: 1 },
    binTypes: { STD: { w: 3, d: 1, h: 6, color: '#6f93c4' } },
    zones: [],
    nodes: [],
    edges: [],
    racks: [{ id: 'ROW-C', type: 'STD', dir: 'N', bays: 3, levels: 1, levelHeights: [6], x: 0, y: 0 }],
    bg: null,
  };

  const up = migrate(v3sim);
  const state = fromDbConnect(up);
  const bins = expandBins(state);
  // First bin: rowToken=C, bay=1 (padded 2 digits → "01"), level=1 → "C-01-1"
  assert.equal(bins[0].bin_label, 'C-01-1');
  // Non-zone parts of old label ("C-01-1") match new label exactly
});

test('shipped default_layout.json validates at current schema version', () => {
  // v5 file: version lives in editor block; convert to editor state before validating
  assert.equal(defaultLayout.editor.schemaVersion, SCHEMA_VERSION);
  const state = fromDbConnect(defaultLayout);
  const { ok, errors } = validateLayout(state);
  assert.ok(ok, `default_layout.json invalid: ${errors.join('; ')}`);
});

// ── expandBins z fix (DEBT-002 resolved) ─────────────────────────────────

test('expandBins z uses cumulative levelHeights not uniform formula', () => {
  // levelHeights [4, 6] → level 1 z=0, level 2 z=4 (not 1*(h||0)=6)
  const state = makeState({ levelHeights: [4, 6] });
  const bins = expandBins(state);
  const l1 = bins.find((b) => b.level === 1);
  const l2 = bins.find((b) => b.level === 2);
  assert.equal(l1.z, 0); // levelBaseZ(heights, 0) = 0
  assert.equal(l2.z, 4); // levelBaseZ(heights, 1) = 4, NOT 6*(l-1)=6
});

test('expandBins z matches levelBaseZ for uniform heights', () => {
  // Uniform heights [6, 6, 6] → same as old formula at each level
  const state = makeState({ levels: 3, levelHeights: [6, 6, 6] });
  const bins = expandBins(state);
  const byLevel = [1, 2, 3].map((l) => bins.find((b) => b.level === l));
  assert.equal(byLevel[0].z, 0); // levelBaseZ([6,6,6], 0) = 0
  assert.equal(byLevel[1].z, 6); // levelBaseZ([6,6,6], 1) = 6
  assert.equal(byLevel[2].z, 12); // levelBaseZ([6,6,6], 2) = 12
});

// ── validateLayout v4 ─────────────────────────────────────────────────────

test('validateLayout v4 accepts a valid layout', () => {
  const { ok, errors } = validateLayout(makeState());
  assert.ok(ok, errors.join('; '));
});

test('validateLayout rejects missing naming', () => {
  const state = makeState();
  delete state.naming;
  const { ok } = validateLayout(state);
  assert.equal(ok, false);
});

test('validateLayout rejects non-integer naming.bayPad', () => {
  const state = makeState({}, { naming: { separator: '-', bayPad: 1.5 } });
  const { ok } = validateLayout(state);
  assert.equal(ok, false);
});

test('validateLayout rejects missing binOverrides', () => {
  const state = makeState();
  delete state.binOverrides;
  const { ok } = validateLayout(state);
  assert.equal(ok, false);
});

test('validateLayout rejects empty rowToken', () => {
  const state = makeState({ rowToken: '' });
  const { ok } = validateLayout(state);
  assert.equal(ok, false);
});

test('validateLayout rejects bayStart < 1', () => {
  const state = makeState({ bayStart: 0 });
  const { ok } = validateLayout(state);
  assert.equal(ok, false);
});

test('validateLayout rejects non-boolean bayReverse', () => {
  const state = makeState({ bayReverse: 1 });
  const { ok } = validateLayout(state);
  assert.equal(ok, false);
});
