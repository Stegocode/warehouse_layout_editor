// dbconnect.js — serialization between editor-native state and the db_connect
// on-disk format (v5).
//
// Editor state uses:  dir / naming / binOverrides at top level
// File format uses:   orientation / editor.naming / editor.binOverrides
//
// Owns:   toDbConnect(), fromDbConnect()
// Must not: import schema.js or migrations.js (would create circular deps)
// May import: geometry.js (pure functions)

import { expandBins, edgeLength, zoneOf } from './geometry.js';

const DIR_TO_ORIENTATION = { E: 'length_along_x', N: 'length_along_y' };
const ORIENTATION_TO_DIR = { length_along_x: 'E', length_along_y: 'N' };

const DEFAULT_COORDINATE_SYSTEM = {
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

const DEFAULT_BIN_LABEL_FORMAT = {
  field_name: 'whse_location',
  pattern: '{row}-{bay:02d}-{level}',
  note: 'HomeSource 3-part join key: row token, 2-digit bay, level. Zone is carried as a separate field on each bin record and does not appear in the label string. This intentionally diverges from the db_connect sample (4-part zone-prefixed pattern) to match the WMS join-key format used by HomeSource.',
};

// Convert editor-native state to the db_connect file format (v5).
// Generates the bins array. Pass-through sections are written back unchanged.
export function toDbConnect(state) {
  const { schemaVersion: _sv, naming, binOverrides, categories, vehicles, dwell_times, ...rest } = state;
  void _sv;

  const editor = {
    schemaVersion: 5,
    naming: naming ?? { separator: '-', bayPad: 2 },
    binOverrides: binOverrides ?? {},
  };

  const { coordinate_system, bin_label_format, ...metaRest } = state.meta ?? {};
  const meta = {
    ...metaRest,
    schema_version: 2,
    coordinate_system: coordinate_system ?? DEFAULT_COORDINATE_SYSTEM,
    bin_label_format: bin_label_format ?? DEFAULT_BIN_LABEL_FORMAT,
  };

  const racks = (state.racks ?? []).map(({ dir, ...r }) => ({
    ...r,
    orientation: DIR_TO_ORIENTATION[dir] ?? 'length_along_y',
  }));

  const nodes = (state.nodes ?? []).map((n) => {
    const z = zoneOf(state.zones ?? [], n.x, n.y);
    return { ...n, zone: n.zone ?? (z ? z.id : null) };
  });

  const edges = (state.edges ?? []).map((e) => ({
    ...e,
    distance_m: edgeLength(state.nodes ?? [], e),
  }));

  const rawBins = expandBins(state);
  const bins = rawBins.map(({ bin_label, override_key, ...b }) => {
    void bin_label;
    void override_key;
    return b;
  });

  return {
    meta,
    settings: { ...(state.settings ?? {}), units: 'metres' },
    categories: categories ?? {},
    binTypes: state.binTypes ?? {},
    vehicles: vehicles ?? {},
    dwell_times: dwell_times ?? {},
    zones: rest.zones ?? [],
    nodes,
    edges,
    racks,
    bg: rest.bg ?? null,
    bins,
    editor,
  };
}

// Convert a db_connect file format layout to editor-native state.
// Strips derived fields (zone on nodes, distance_m on edges, units from settings).
// Pass-through sections (categories, vehicles, dwell_times, zone.operations,
// edge attributes, rack access_face/back_to_back_spine, binType extras) are
// preserved on their respective objects.
export function fromDbConnect(dbLayout) {
  const editor = dbLayout.editor ?? {};
  const { schema_version: _sv, ...metaRest } = dbLayout.meta ?? {};
  void _sv;

  const racks = (dbLayout.racks ?? []).map(({ orientation, ...r }) => ({
    ...r,
    dir: ORIENTATION_TO_DIR[orientation] ?? 'N',
  }));

  const edges = (dbLayout.edges ?? []).map(({ distance_m: _dm, ...e }) => {
    void _dm;
    return e;
  });

  const nodes = (dbLayout.nodes ?? []).map(({ zone: _z, ...n }) => {
    void _z;
    return n;
  });

  const { units: _u, ...settingsRest } = dbLayout.settings ?? {};
  void _u;

  return {
    schemaVersion: editor.schemaVersion ?? 5,
    meta: metaRest,
    settings: settingsRest,
    naming: editor.naming ?? { separator: '-', bayPad: 2 },
    binOverrides: editor.binOverrides ?? {},
    categories: dbLayout.categories ?? {},
    binTypes: dbLayout.binTypes ?? {},
    vehicles: dbLayout.vehicles ?? {},
    dwell_times: dbLayout.dwell_times ?? {},
    zones: dbLayout.zones ?? [],
    nodes,
    edges,
    racks,
    bg: dbLayout.bg ?? null,
  };
}
