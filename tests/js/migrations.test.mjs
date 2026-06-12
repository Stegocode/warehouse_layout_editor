import test from 'node:test';
import assert from 'node:assert/strict';

import { migrate, detectVersion } from '../../app/js/migrations.js';
import { SCHEMA_VERSION } from '../../app/js/schema.js';

const legacyV1 = {
  meta: { name: 'OLD', version: 1 },
  settings: { snap: 0.3, grid: 3 },
  binTypes: {},
  zones: [],
  nodes: [],
  edges: [],
  racks: [],
  bg: null,
};

test('a layout without schemaVersion is treated as v1', () => {
  assert.equal(detectVersion(legacyV1), 1);
});

test('migrate lifts v1 to the current schema version', () => {
  const up = migrate(legacyV1);
  assert.equal(up.schemaVersion, SCHEMA_VERSION);
});

test('migrate moves meta.version out of meta', () => {
  const up = migrate(legacyV1);
  assert.ok(!('version' in up.meta));
  assert.equal(up.meta.name, 'OLD');
});

test('migrate does not mutate its input', () => {
  const before = JSON.parse(JSON.stringify(legacyV1));
  migrate(legacyV1);
  assert.deepEqual(legacyV1, before);
});

test('an already-current layout passes through unchanged in version', () => {
  const current = { ...legacyV1, schemaVersion: SCHEMA_VERSION, meta: { name: 'NEW' } };
  assert.equal(migrate(current).schemaVersion, SCHEMA_VERSION);
});

test('a future schema version throws rather than silently downgrading', () => {
  const future = { ...legacyV1, schemaVersion: SCHEMA_VERSION + 1 };
  assert.throws(() => migrate(future), /newer than this app supports/);
});
