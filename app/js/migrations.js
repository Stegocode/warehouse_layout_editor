// migrations.js — forward-only schema migrations.
//
// A layout loaded from localStorage, an imported file, or the database may have
// been written by an older version of the app. migrate() walks it up to the
// current SCHEMA_VERSION one step at a time. Each migration takes a layout at
// version N and returns a layout at version N+1.
//
// Rules:
//   - Migrations never mutate their input; they return a new object.
//   - Add a new entry here whenever you bump SCHEMA_VERSION in schema.js.

import { SCHEMA_VERSION } from './schema.js';

// version N  ->  function that produces version N+1
const MIGRATIONS = {
  // 1 -> 2: separate the data-format version from building metadata.
  // v1 stored the format version at `meta.version`, which conflated the schema
  // version with user-facing building info. v2 lifts it to a top-level
  // `schemaVersion` and leaves `meta` for the building name only.
  1: (layout) => {
    const next = { ...layout, schemaVersion: 2 };
    if (next.meta && 'version' in next.meta) {
      const { version, ...rest } = next.meta;
      void version;
      next.meta = rest;
    }
    return next;
  },
};

// A layout with no explicit schemaVersion predates the field; treat it as v1.
export function detectVersion(layout) {
  return Number.isInteger(layout?.schemaVersion) ? layout.schemaVersion : 1;
}

export function migrate(layout) {
  let current = layout;
  let version = detectVersion(current);

  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) {
      throw new Error(`No migration registered from schema version ${version}`);
    }
    current = step(current);
    const nextVersion = detectVersion(current);
    if (nextVersion <= version) {
      throw new Error(`Migration from ${version} did not advance the schema version`);
    }
    version = nextVersion;
  }

  if (version > SCHEMA_VERSION) {
    throw new Error(
      `Layout schema version ${version} is newer than this app supports (${SCHEMA_VERSION}). Update the app.`,
    );
  }
  return current;
}
