// schema.js — the layout data contract.
//
// SCHEMA_VERSION is the version of the on-disk/in-storage layout format. Bump it
// whenever the shape of a layout changes, and add a migration in migrations.js
// that upgrades the previous version to the new one. validateLayout() is a
// lightweight structural check used by import and by the test suite; it is not a
// full JSON-Schema validator, just enough to catch obviously broken files.

export const SCHEMA_VERSION = 3;

export const NODE_KINDS = ['door', 'ramp', 'junction', 'dock', 'staging', 'charge'];
export const RACK_DIRS = ['E', 'N'];

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// Returns { ok: boolean, errors: string[] }.
export function validateLayout(layout) {
  const errors = [];
  const push = (m) => errors.push(m);

  if (layout == null || typeof layout !== 'object') {
    return { ok: false, errors: ['layout is not an object'] };
  }
  if (layout.schemaVersion !== SCHEMA_VERSION) {
    push(`schemaVersion must be ${SCHEMA_VERSION} (got ${layout.schemaVersion}); run a migration first`);
  }
  if (!layout.meta || typeof layout.meta.name !== 'string') {
    push('meta.name must be a string');
  }

  for (const key of ['zones', 'nodes', 'edges', 'racks']) {
    if (!Array.isArray(layout[key])) push(`${key} must be an array`);
  }
  if (!layout.binTypes || typeof layout.binTypes !== 'object') {
    push('binTypes must be an object');
  }

  (layout.zones || []).forEach((z, i) => {
    for (const k of ['x', 'y', 'w', 'd', 'elev', 'clearH']) {
      if (!isFiniteNumber(z[k])) push(`zones[${i}].${k} must be a number`);
    }
    if (typeof z.id !== 'string') push(`zones[${i}].id must be a string`);
  });

  const nodeIds = new Set();
  (layout.nodes || []).forEach((n, i) => {
    if (typeof n.id !== 'string') push(`nodes[${i}].id must be a string`);
    else nodeIds.add(n.id);
    if (!isFiniteNumber(n.x) || !isFiniteNumber(n.y)) push(`nodes[${i}] needs numeric x,y`);
    if (n.kind && !NODE_KINDS.includes(n.kind)) push(`nodes[${i}].kind "${n.kind}" is not a known kind`);
  });

  (layout.edges || []).forEach((e, i) => {
    if (!nodeIds.has(e.a)) push(`edges[${i}].a "${e.a}" references a missing node`);
    if (!nodeIds.has(e.b)) push(`edges[${i}].b "${e.b}" references a missing node`);
  });

  const binTypeNames = Object.keys(layout.binTypes || {});
  (layout.racks || []).forEach((r, i) => {
    if (typeof r.id !== 'string') push(`racks[${i}].id must be a string`);
    if (!RACK_DIRS.includes(r.dir)) push(`racks[${i}].dir must be one of ${RACK_DIRS.join(', ')}`);
    if (!Number.isInteger(r.bays) || r.bays < 1) push(`racks[${i}].bays must be a positive integer`);
    if (!Number.isInteger(r.levels) || r.levels < 1) push(`racks[${i}].levels must be a positive integer`);
    if (!Array.isArray(r.levelHeights)) {
      push(`racks[${i}].levelHeights must be an array`);
    } else {
      if (r.levelHeights.length !== r.levels) {
        push(`racks[${i}].levelHeights.length (${r.levelHeights.length}) must equal levels (${r.levels})`);
      }
      if (!r.levelHeights.every((h) => isFiniteNumber(h) && h > 0)) {
        push(`racks[${i}].levelHeights must contain only positive numbers`);
      }
    }
    if (!binTypeNames.includes(r.type)) push(`racks[${i}].type "${r.type}" is not a defined bin type`);
  });

  return { ok: errors.length === 0, errors };
}
