// geometry.js — pure layout math. No DOM, no THREE, no side effects, so every
// function here is straightforward to unit-test.

// The zone whose footprint contains (x, y), or null.
export function zoneOf(zones, x, y) {
  return zones.find((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.d) || null;
}

// Distance from point (px,py) to the segment (x1,y1)-(x2,y2). Used for edge hit-testing.
export function ptSegDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// Straight-line length of an edge from its two endpoint nodes, or null if an
// endpoint is missing.
export function edgeLength(nodes, edge) {
  const a = nodes.find((n) => n.id === edge.a);
  const b = nodes.find((n) => n.id === edge.b);
  return a && b ? +Math.hypot(a.x - b.x, a.y - b.y).toFixed(1) : null;
}

// Expand rack runs into individual bins with whse_location labels and world
// coordinates. Three naming layers apply in priority order:
//   1. binOverrides["rackId|bayIndex|level"] — wins over everything
//   2. Per-rack fields: rowToken, bayStart, bayReverse
//   3. Top-level naming: { separator, bayPad }
// z is computed cumulatively from r.levelHeights via levelBaseZ().
export function expandBins(state) {
  const naming = state.naming ?? { separator: '-', bayPad: 2 };
  const overrides = state.binOverrides ?? {};
  const sep = typeof naming.separator === 'string' ? naming.separator : '-';
  const bayPad = Number.isInteger(naming.bayPad) && naming.bayPad >= 1 ? naming.bayPad : 2;
  const bins = [];
  for (const r of state.racks) {
    const t = state.binTypes[r.type];
    if (!t) continue;
    const zone = zoneOf(state.zones, r.x, r.y);
    const zid = zone ? zone.id : '?';
    const zoneElev = zone ? zone.elev : 0;
    const rowToken = r.rowToken ?? r.id.replace(/^[^-]+-/, '');
    const bayStart = Number.isInteger(r.bayStart) && r.bayStart >= 1 ? r.bayStart : 1;
    const bayReverse = r.bayReverse === true;
    const rowLevelHeights = Array.isArray(r.levelHeights)
      ? r.levelHeights
      : Array.from({ length: Math.max(r.levels, 1) }, () => t.h || 0.12);
    for (let b = 0; b < r.bays; b++) {
      const blo = r.bayLevelOverrides?.[b];
      const effectiveLevels = blo?.levels ?? Math.max(r.levels, 1);
      const effectiveLevelHeights = blo?.levelHeights ?? rowLevelHeights;
      const cx = r.x + (r.dir === 'E' ? b * t.w + t.w / 2 : t.d / 2);
      const cy = r.y + (r.dir === 'N' ? b * t.w + t.w / 2 : t.d / 2);
      const bayNum = bayReverse ? bayStart + r.bays - 1 - b : bayStart + b;
      const bayStr = String(bayNum).padStart(bayPad, '0');
      for (let l = 1; l <= effectiveLevels; l++) {
        const overrideKey = `${r.id}|${b}|${l}`;
        const generated = `${rowToken}${sep}${bayStr}${sep}${l}`;
        const whse_location = overrides[overrideKey] ?? generated;
        bins.push({
          bin_label: whse_location,
          whse_location,
          override_key: overrideKey,
          zone: zid,
          row: r.id,
          bay: bayNum,
          level: l,
          bin_type: r.type,
          x: +cx.toFixed(1),
          y: +cy.toFixed(1),
          z: +(zoneElev + levelBaseZ(effectiveLevelHeights, l - 1)).toFixed(1),
        });
      }
    }
  }
  return bins;
}

// Returns the cumulative z base (bottom edge) of level `levelIndex` given an
// array of per-level heights. Level 0 starts at z=0; each subsequent level
// starts at the sum of all preceding level heights.
export function levelBaseZ(levelHeights, levelIndex) {
  let z = 0;
  for (let i = 0; i < levelIndex; i++) z += levelHeights[i];
  return z;
}

// Return the 0-based bay index that world point (x, y) falls within for the
// given rack, or null if the point is outside the rack's footprint.
export function bayOf(rack, binTypes, x, y) {
  const t = binTypes[rack.type];
  if (!t) return null;
  if (rack.dir === 'E') {
    if (x < rack.x || x > rack.x + rack.bays * t.w || y < rack.y || y > rack.y + t.d) return null;
    const b = Math.floor((x - rack.x) / t.w);
    return b >= 0 && b < rack.bays ? b : null;
  }
  if (x < rack.x || x > rack.x + t.d || y < rack.y || y > rack.y + rack.bays * t.w) return null;
  const b = Math.floor((y - rack.y) / t.w);
  return b >= 0 && b < rack.bays ? b : null;
}

// Resolve the row-bay label for a single bay (no level suffix). Uses the same
// naming fields as expandBins so the result always matches the prefix of the
// whse_location that expandBins emits for level 1 of this bay (no overrides).
export function resolveBayLabel(state, rack, bayIndex) {
  const naming = state.naming ?? { separator: '-', bayPad: 2 };
  const sep = typeof naming.separator === 'string' ? naming.separator : '-';
  const bayPad = Number.isInteger(naming.bayPad) && naming.bayPad >= 1 ? naming.bayPad : 2;
  const rowToken = rack.rowToken ?? rack.id.replace(/^[^-]+-/, '');
  const bayStart = Number.isInteger(rack.bayStart) && rack.bayStart >= 1 ? rack.bayStart : 1;
  const bayReverse = rack.bayReverse === true;
  const bayNum = bayReverse ? bayStart + rack.bays - 1 - bayIndex : bayStart + bayIndex;
  return `${rowToken}${sep}${String(bayNum).padStart(bayPad, '0')}`;
}

// Produce the export payload: a deep copy of the editor state enriched with
// derived fields (node zone, edge distance, expanded bins) that are convenient
// for downstream consumers but are not part of the editable model.
export function enrichForExport(state) {
  const out = JSON.parse(JSON.stringify(state));
  out.nodes.forEach((n) => {
    const z = zoneOf(state.zones, n.x, n.y);
    n.zone = z ? z.id : null;
  });
  out.edges.forEach((ed) => {
    ed.distance_m = edgeLength(state.nodes, ed);
  });
  out.bins = expandBins(state);
  return out;
}
