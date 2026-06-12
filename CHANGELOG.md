# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

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
