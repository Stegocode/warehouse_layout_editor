# Step 4 — Field Mapping: Editor v4 → db_connect format

Phase 1 deliverable. Describes field-by-field how the editor's internal model maps onto
db_connect's `sample.json` shape. Implementation (Phase 2) does not begin until this mapping
is approved.

Reference: `https://github.com/markariosd3/db_connect` — `sample.json`.

---

## Top-level structure

| Editor v4 key         | db_connect key              | Disposition                                                                                                                           |
| --------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion: 4`    | `meta.schema_version: 2`    | **Restructure** — version moves into `meta`; editor's migration counter moves to `editor.schemaVersion` (see §Editor extension block) |
| `meta.name`           | `meta.name`                 | **Direct**                                                                                                                            |
| _(absent)_            | `meta.description`          | **Pass-through**                                                                                                                      |
| _(absent)_            | `meta.coordinate_system`    | **Author** — declare in v5 migration (see §Coordinate system)                                                                         |
| _(absent)_            | `meta.bin_label_format`     | **Author** — `{ field_name: "whse_location", pattern: "{row}-{bay:02d}-{level}" }` (3-part, zone dropped per ROADMAP locked decision) |
| _(absent)_            | `meta.node_kinds`           | **Pass-through**                                                                                                                      |
| _(absent)_            | `meta.rack_orientation_key` | **Pass-through**                                                                                                                      |
| _(absent)_            | `meta.location`             | **Pass-through**                                                                                                                      |
| _(absent)_            | `meta.bin_status`           | **Pass-through**                                                                                                                      |
| `settings.snap`       | `settings.snap`             | **Direct**                                                                                                                            |
| `settings.grid`       | `settings.grid`             | **Direct**                                                                                                                            |
| _(absent)_            | `settings.units`            | **Add** `"metres"` on write                                                                                                           |
| `naming`              | _(no standard key)_         | **Editor extension block** → `editor.naming`                                                                                          |
| `binOverrides`        | _(no standard key)_         | **Editor extension block** → `editor.binOverrides`                                                                                    |
| _(absent)_            | `categories`                | **Pass-through** (`{}` on new files)                                                                                                  |
| `binTypes.*`          | `binTypes.*`                | Base fields `w/d/h/color` authored; extra fields pass-through (see §binTypes)                                                         |
| _(absent)_            | `vehicles`                  | **Pass-through** (`{}` on new files)                                                                                                  |
| _(absent)_            | `dwell_times`               | **Pass-through** (`{}` on new files)                                                                                                  |
| `zones`               | `zones`                     | See §Zones                                                                                                                            |
| `nodes`               | `nodes`                     | See §Nodes                                                                                                                            |
| `edges`               | `edges`                     | See §Edges                                                                                                                            |
| `racks`               | `racks`                     | See §Racks                                                                                                                            |
| `bg`                  | `bg`                        | **Direct** (`null`)                                                                                                                   |
| _(derived on export)_ | `bins`                      | **Generated** — see §Bins                                                                                                             |

---

## §Zones

| Editor field | db_connect field | Disposition                                                              |
| ------------ | ---------------- | ------------------------------------------------------------------------ |
| `id`         | `id`             | Direct                                                                   |
| `x, y, w, d` | `x, y, w, d`     | Direct                                                                   |
| `elev`       | `elev`           | Direct                                                                   |
| `clearH`     | `clearH`         | Direct                                                                   |
| `color`      | `color`          | Direct                                                                   |
| _(absent)_   | `operations`     | **Pass-through** — hold blob, write back unchanged. `null` on new zones. |

---

## §Nodes

| Editor field          | db_connect field   | Disposition                                               |
| --------------------- | ------------------ | --------------------------------------------------------- |
| `id`                  | `id`               | Direct                                                    |
| `x, y`                | `x, y`             | Direct                                                    |
| `kind`                | `kind`             | **Vocabulary mismatch** — see below                       |
| _(derived on export)_ | `zone`             | **Generated** — `zoneOf(zones, x, y).id`                  |
| _(absent)_            | `emergency_exit`   | **Pass-through** — boolean. Default `false` on new nodes. |
| other extra fields    | other extra fields | **Pass-through** (`egress_note`, `description`, etc.)     |

### Node kinds vocabulary mismatch

| Editor kind | db_connect kind    | Mapping                             |
| ----------- | ------------------ | ----------------------------------- |
| `door`      | `access_point`     | Functionally equivalent             |
| `ramp`      | `access_point`     | Ramps are a form of access point    |
| `junction`  | `waypoint`         | Equivalent routing concept          |
| `dock`      | `access_point`     | Dock doors are access points        |
| `staging`   | `staging_area`     | Direct                              |
| `charge`    | _(no equivalent)_  | Editor-only; pass through as-is     |
| _(absent)_  | `reference_marker` | db_connect-only; pass through as-is |

**Proposal:** keep the editor's kind vocabulary for editing — `door/ramp/dock` are operationally
distinct to a warehouse operator, finer-grained than `access_point`. Emit them as-is in the JSON
(db_connect's JSONB stores any string value). Add `reference_marker` to the editor's allowed kinds
so db_connect files validate cleanly on import. No translation in either direction. Full alignment
deferred to Step 5 (DEBT-005).

---

## §Edges

| Editor field           | db_connect field       | Disposition                                                                                                       |
| ---------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `a, b`                 | `a, b`                 | Direct                                                                                                            |
| `ramp`                 | `ramp`                 | Direct                                                                                                            |
| _(computed on export)_ | `distance_m`           | **Generated** — `Math.hypot(Δx, Δy)`. Always ≥ 0; non-negativity guarded by a new test (see §Distance invariant). |
| _(absent)_             | `traffic_class`        | **Pass-through** (`null` on new edges)                                                                            |
| _(absent)_             | `width_m`              | **Pass-through**                                                                                                  |
| _(absent)_             | `direction`            | **Pass-through**                                                                                                  |
| _(absent)_             | `speed_limit_mps`      | **Pass-through**                                                                                                  |
| _(absent)_             | `vertical_clearance_m` | **Pass-through**                                                                                                  |
| _(absent)_             | `surface`              | **Pass-through**                                                                                                  |
| other extra fields     | other extra fields     | **Pass-through**                                                                                                  |

---

## §Racks

| Editor field   | db_connect field                | Disposition                                                        |
| -------------- | ------------------------------- | ------------------------------------------------------------------ |
| `id`           | `id`                            | Direct                                                             |
| `type`         | `type`                          | Direct                                                             |
| `bays`         | `bays`                          | Direct                                                             |
| `levels`       | `levels`                        | Direct                                                             |
| `x, y`         | `x, y`                          | Direct                                                             |
| `dir: "E"`     | `orientation: "length_along_x"` | **Translate** on write; reverse on read                            |
| `dir: "N"`     | `orientation: "length_along_y"` | **Translate** on write; reverse on read                            |
| _(absent)_     | `access_face`                   | **Pass-through** (`null` on new racks)                             |
| _(absent)_     | `access_face_note`              | **Pass-through**                                                   |
| _(absent)_     | `back_to_back_spine`            | **Pass-through** (`null` on new racks)                             |
| `levelHeights` | _(no standard key)_             | **Stay on rack object** as extra key — db_connect JSONB ignores it |
| `rowToken`     | _(no standard key)_             | **Stay on rack object**                                            |
| `bayStart`     | _(no standard key)_             | **Stay on rack object**                                            |
| `bayReverse`   | _(no standard key)_             | **Stay on rack object**                                            |

---

## §binTypes (extended fields)

| Editor field     | db_connect field     | Disposition      |
| ---------------- | -------------------- | ---------------- |
| `w, d, h, color` | `w, d, h, color`     | **Authored**     |
| _(absent)_       | `description`        | **Pass-through** |
| _(absent)_       | `dimensions_note`    | **Pass-through** |
| _(absent)_       | `allowed_categories` | **Pass-through** |
| _(absent)_       | `max_weight_kg`      | **Pass-through** |

---

## §Editor extension block

Editor-specific top-level keys that have no standard db_connect home are collected under a
single `editor` top-level key. db_connect's JSONB storage ignores extra keys, so this
round-trips losslessly.

```json
"editor": {
  "schemaVersion": 5,
  "naming": { "separator": "-", "bayPad": 2 },
  "binOverrides": { "ROW-C|0|1": "CUSTOM" }
}
```

On load: the deserializer reads `editor.*` and merges into internal state.
On save: serializer writes it back under `editor`.

Existing v4 files (with `schemaVersion`/`naming`/`binOverrides` at the top level) migrate to
this shape in the v4 → v5 migration.

---

## §Coordinate system

The `meta.coordinate_system` block the editor will author on every save:

```json
"coordinate_system": {
  "units": "metres",
  "origin": {
    "description": "Receiving station / southeast dock corner. All coordinates are signed relative to this point.",
    "physical_marker": "Set by site survey",
    "x": 0,
    "y": 0,
    "z": 0
  },
  "x_axis": "East is positive. West into warehouse = negative X.",
  "y_axis": "North is positive. Into warehouse interior = positive Y.",
  "z_axis": "Up is positive. Floor slab = 0."
}
```

**No coordinate shift.** Positions stay signed relative to the declared origin. Negative
coordinates are valid (x = −65 means 65 m west of the receiving station). The editor does
not shift all coordinates to positive.

---

## §Bins (generated)

Bins are **derived on every save** from `racks × naming × binOverrides × levelHeights`.
They are never stored on the rack objects. The saved `bins` array matches db_connect's
exact shape:

| Field           | Source                                                 |
| --------------- | ------------------------------------------------------ |
| `whse_location` | `binOverrides[key] ?? generated ROW-BAY-LEVEL string`  |
| `zone`          | `zoneOf(zones, x, y).id`                               |
| `row`           | `rack.id`                                              |
| `bay`           | Computed bay number (respects `bayStart`/`bayReverse`) |
| `level`         | 1-based level index                                    |
| `bin_type`      | `rack.type`                                            |
| `x, y`          | Bay centroid world coordinates                         |
| `z`             | `zoneElev + levelBaseZ(levelHeights, level − 1)`       |

Internal-only fields (`bin_label`, `override_key`) are **not** written to the saved file.

---

## §Distance invariant

`distance_m` on edges is always `Math.hypot(Δx, Δy)` — a Euclidean magnitude, always ≥ 0
even when both endpoints have negative coordinates. Phase 2 adds a regression test
asserting this property for edges where all node coordinates are negative.

---

## §Migration v4 → v5

The migration function:

1. Moves `schemaVersion` → `editor.schemaVersion: 5`
2. Expands `meta` with `coordinate_system` (declared; no coordinate shifts) and
   `meta.schema_version: 2` (db_connect's own version counter)
3. Moves `naming` → `editor.naming`; moves `binOverrides` → `editor.binOverrides`
4. Translates each rack: `dir: "E"` → `orientation: "length_along_x"`,
   `dir: "N"` → `orientation: "length_along_y"`; removes `dir`
5. Seeds `access_face: null`, `back_to_back_spine: null` on racks that lack them
6. Seeds empty pass-through sections if absent: `categories: {}`, `vehicles: {}`,
   `dwell_times: {}`
7. Generates the `bins` array

Existing layouts must migrate cleanly and render identically (no visual change).

---

## §Debt items

| ID       | Item                                                                                                                                                                                                                                        | Unblocks at           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| DEBT-005 | Node kind vocabulary mismatch — editor uses `door/ramp/junction/dock/staging/charge`; db_connect uses `access_point/waypoint/staging_area/reference_marker`. Current proposal: pass through as-is, add `reference_marker` to allowed kinds. | Step 5                |
| DEBT-006 | `access_face` / `back_to_back_spine` have no editing UI — pass-through; new racks get `null`.                                                                                                                                               | Step 5                |
| DEBT-007 | Zone `operations` block has no editing UI — pass-through.                                                                                                                                                                                   | Step 5                |
| DEBT-008 | Edge attributes (`traffic_class`, `width_m`, `direction`, `speed_limit_mps`, `vertical_clearance_m`, `surface`) have no editing UI — pass-through.                                                                                          | Step 5                |
| DEBT-009 | `settings.units` is hardcoded `"metres"` — no multi-unit mode. Declared boundary.                                                                                                                                                           | Never (design choice) |
| DEBT-010 | Coordinate origin declared but not set from a real survey point — editor accepts the user's coordinate frame as-is. Site calibration / GPS anchor deferred.                                                                                 | Step 5 or later       |
