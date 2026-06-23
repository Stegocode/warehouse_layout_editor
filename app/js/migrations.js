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

  // 2 -> 3: per-level rack heights (levelHeights).
  // v2 assumed every level shared the bin type's `h`. v3 makes heights explicit
  // so each level can differ. The upgrade seeds levelHeights from the bin type's h
  // so the 3D view renders identically after migration.
  2: (layout) => {
    const binTypes = layout.binTypes || {};
    const racks = (layout.racks || []).map((r) => {
      if (r.levelHeights) return { ...r };
      const t = binTypes[r.type];
      const uniformH = t && t.h > 0 ? t.h : 0.12;
      return {
        ...r,
        levelHeights: Array.from({ length: Math.max(r.levels, 1) }, () => uniformH),
      };
    });
    return { ...layout, schemaVersion: 3, racks };
  },

  // 3 -> 4: bin naming system (three-layer model).
  // v3 had no naming config and derived bin labels as ZONE-ROW-BAY-LEVEL. v4 adds:
  //   - naming: { separator, bayPad } — shared label format config
  //   - binOverrides: {} — per-bin custom whse_location strings, keyed by
  //       "rackId|bayIndex|level" so overrides survive rack renaming
  //   - per-rack: rowToken (literal label token), bayStart, bayReverse
  // rowToken is seeded from the existing id so the non-zone parts of generated
  // labels are identical to v3. The ZONE segment is intentionally dropped:
  // whse_location is ROW-BAY-LEVEL per the WMS join-key format.
  3: (layout) => {
    const naming = layout.naming ?? { separator: '-', bayPad: 2 };
    const binOverrides = layout.binOverrides ?? {};
    const racks = (layout.racks || []).map((r) => {
      const rowToken = r.rowToken ?? r.id.replace(/^[^-]+-/, '');
      return {
        ...r,
        rowToken,
        bayStart: r.bayStart ?? 1,
        bayReverse: r.bayReverse ?? false,
      };
    });
    return { ...layout, schemaVersion: 4, naming, binOverrides, racks };
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
