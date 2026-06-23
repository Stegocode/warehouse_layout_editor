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
import { expandBins, edgeLength, zoneOf } from './geometry.js';

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

  // 4 -> 5: adopt db_connect as the native save format (Step 4).
  // Restructures the editor-native v4 layout into the db_connect JSON shape:
  //   - naming/binOverrides/schemaVersion move into an `editor` extension block
  //   - rack `dir` is KEPT intact (orientation belongs only in the file format,
  //     written by toDbConnect and read by fromDbConnect — not in working state)
  //   - meta gains coordinate_system and bin_label_format declarations
  //   - empty pass-through sections seeded if absent (categories, vehicles, etc.)
  //   - bins array generated (3-part HomeSource whse_location, zone dropped from label)
  //   - nodes enriched with zone (derived) and emergency_exit default
  //   - edges enriched with distance_m (always >= 0)
  // Existing layouts migrate cleanly and render identically after round-trip.
  4: (v4) => {
    const COORDINATE_SYSTEM = {
      units: 'metres',
      origin: {
        description: 'Receiving station. All coordinates are signed relative to this point.',
        physical_marker: 'Set by site survey',
        x: 0,
        y: 0,
        z: 0,
      },
      x_axis: 'East is positive. West into warehouse = negative X.',
      y_axis: 'North is positive. Into warehouse interior = positive Y.',
      z_axis: 'Up is positive. Floor slab = 0.',
    };

    const BIN_LABEL_FORMAT = {
      field_name: 'whse_location',
      pattern: '{row}-{bay:02d}-{level}',
      note: 'HomeSource 3-part join key: row token, 2-digit bay, level. Zone is carried as a separate field on each bin record and does not appear in the label string. Intentionally diverges from db_connect sample (4-part zone-prefixed pattern) to match the WMS join-key format.',
    };

    // Generate bins from v4 state (racks still have dir) BEFORE translation.
    const rawBins = expandBins(v4);
    const bins = rawBins.map(({ bin_label, override_key, ...b }) => {
      void bin_label;
      void override_key;
      return b;
    });

    const racks = (v4.racks || []).map((r) => ({
      ...r,
      access_face: r.access_face ?? null,
      back_to_back_spine: r.back_to_back_spine ?? null,
    }));

    const nodes = (v4.nodes || []).map((n) => {
      const z = zoneOf(v4.zones || [], n.x, n.y);
      return {
        ...n,
        zone: n.zone ?? (z ? z.id : null),
        emergency_exit: n.emergency_exit ?? false,
      };
    });

    const edges = (v4.edges || []).map((e) => ({
      ...e,
      distance_m: edgeLength(v4.nodes || [], e),
    }));

    const { coordinate_system, bin_label_format, ...metaRest } = v4.meta ?? {};
    const meta = {
      ...metaRest,
      schema_version: 2,
      coordinate_system: coordinate_system ?? COORDINATE_SYSTEM,
      bin_label_format: bin_label_format ?? BIN_LABEL_FORMAT,
    };

    return {
      meta,
      settings: { ...(v4.settings ?? {}), units: 'metres' },
      categories: v4.categories ?? {},
      binTypes: v4.binTypes ?? {},
      vehicles: v4.vehicles ?? {},
      dwell_times: v4.dwell_times ?? {},
      zones: v4.zones ?? [],
      nodes,
      edges,
      racks,
      bg: v4.bg ?? null,
      bins,
      editor: {
        schemaVersion: 5,
        naming: v4.naming ?? { separator: '-', bayPad: 2 },
        binOverrides: v4.binOverrides ?? {},
      },
    };
  },
};

// A layout with no explicit schemaVersion predates the field; treat it as v1.
// v5 db_connect files carry the version inside the `editor` block; check that
// first so a stale top-level `schemaVersion` from an older format does not win.
export function detectVersion(layout) {
  if (Number.isInteger(layout?.editor?.schemaVersion)) return layout.editor.schemaVersion;
  if (Number.isInteger(layout?.schemaVersion)) return layout.schemaVersion;
  return 1;
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
