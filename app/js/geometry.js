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

// Expand rack runs into individual bins with labels and world coordinates.
// This is the data a downstream seed script or WMS import would consume.
export function expandBins(state) {
  const bins = [];
  for (const r of state.racks) {
    const t = state.binTypes[r.type];
    if (!t) continue;
    const zone = zoneOf(state.zones, r.x, r.y);
    const zid = zone ? zone.id : '?';
    const zoneElev = zone ? zone.elev : 0;
    for (let b = 0; b < r.bays; b++) {
      const cx = r.x + (r.dir === 'E' ? b * t.w + t.w / 2 : t.d / 2);
      const cy = r.y + (r.dir === 'N' ? b * t.w + t.w / 2 : t.d / 2);
      for (let l = 1; l <= Math.max(r.levels, 1); l++) {
        bins.push({
          bin_label: `${zid}-${r.id.replace(/^.*?-/, '')}-${String(b + 1).padStart(2, '0')}-${l}`,
          zone: zid,
          row: r.id,
          bay: b + 1,
          level: l,
          bin_type: r.type,
          x: +cx.toFixed(1),
          y: +cy.toFixed(1),
          z: +(zoneElev + (l - 1) * (t.h || 0)).toFixed(1),
        });
      }
    }
  }
  return bins;
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
