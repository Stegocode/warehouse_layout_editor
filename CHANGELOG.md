# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.2.0] — 2026-06-23

### Added

- **db_connect-native save format** (schema v4→v5): layouts are now saved and
  loaded in the db_connect shape — top-level `meta` (with `coordinate_system` and
  `bin_label_format`), `settings`, `categories`, `binTypes`, `vehicles`,
  `dwell_times`, `zones`, `nodes`, `edges`, `racks`, generated `bins`, and an
  `editor` extension block (`naming`, `binOverrides`, `schemaVersion`). Feed
  directly into the WMS db_connect pipeline.
- **Generated `whse_location` bins**: on every save, bins are expanded from rack
  definitions and written to the file. Each bin carries a `whse_location` — the
  3-part HomeSource join key `ROW-BAY-LEVEL` (e.g. `C-01-1`). Zone is a separate
  field on the bin record and does not appear in the label string.
- **Lossless pass-through**: `categories`, `vehicles`, `dwell_times`,
  `zone.operations`, edge traffic attributes, and rack `access_face` /
  `back_to_back_spine` are preserved unchanged across load/save cycles.
- **Coordinate system declaration** (`meta.coordinate_system`): origin at the
  receiving station, +X East, +Y North, +Z Up, signed positions, no coordinate
  shift. Set by site survey (DEBT-010).
- **`app/js/dbconnect.js`**: `toDbConnect()` / `fromDbConnect()` translator pair.
- **Three-layer bin naming** (schema v3→v4): `pattern` (separator + bay-pad) +
  per-rack `rowToken` / `bayStart` / `bayReverse` overrides + per-bin
  `binOverrides`. Labels take the form `ROW-BAY-LEVEL` (e.g. `C-01-1`).
- **Per-level rack heights** (schema v2→v3): each rack stores an explicit
  `levelHeights` array; bin z-coordinates use cumulative heights.

### Fixed

- Mac 3D preview: touch-action pan/zoom conflict resolved (pointer-events
  suppressed on the canvas overlay).

### Schema

- `schemaVersion` is now `5` (in `editor.schemaVersion` in the file format).
  Migrations `2→3`, `3→4`, `4→5` are forward-only and run automatically on load.

## [0.1.0] — 2026-06-12

### Added

- 2D plan editor: zones, rack rows, path nodes, and path edges with select/move,
  add, and delete tools; snap and grid settings; background tracing image with
  two-point scale calibration.
- 3D preview of the current layout, including an origin marker, labeled X/Y/Z
  axes, and a north arrow.
- Origin axes and a fixed north compass in the 2D plan.
- JSON import/export; export enriches the layout with zone containment, edge
  distances, and expanded per-bin records.
- Layout **schema versioning** (`schemaVersion`) with forward-only migrations.
- Decoupled seed data: the default layout lives in `app/data/default_layout.json`.
- Python dev server that serves the `app/` web root with correct MIME types.
- Postgres persistence layer (schema + `LayoutRepository`) and a seed command.
- Test suite (pytest + `node --test`), linting/formatting (ruff, eslint,
  prettier), and GitHub Actions CI.

### Schema

- `schemaVersion` is now `2`. Migration `1 -> 2` lifts the format version out of
  `meta.version` into a top-level `schemaVersion`.
