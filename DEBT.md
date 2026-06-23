# Debt Ledger

Tracked deferrals. Each entry: date introduced, scope, and what unblocks resolution.

---

## DEBT-001 — editor.js exceeds the 400-line file cap

- **Introduced:** 2026-06-23 (pre-existing at Step 2)
- **Current size:** ~1060 lines after Step 3 additions
- **Why deferred:** editor.js is a single-file browser module with no build step.
  Splitting it cleanly requires either a bundler or careful ES module re-wiring.
  Out of scope for Steps 2–3, which are data-model changes.
- **Unblocks at:** Step 4 (adopt db_connect format) — that step restructures the
  persistence layer and is the right moment to also split editor concerns.

## DEBT-002 — expandBins() z-coordinate uniform formula **PAID (Step 3)**

- **Introduced:** 2026-06-23 (Step 2)
- **Resolved:** 2026-06-23 (Step 3)
- `expandBins` now uses `levelBaseZ(r.levelHeights, l - 1)` for the z coordinate,
  eliminating the old `(l-1)*(t.h||0)` uniform formula. Confirmed by tests in
  `tests/js/binNaming.test.mjs`.

## DEBT-003 — changing binType.h does not auto-update existing levelHeights

- **Introduced:** 2026-06-23 (Step 2)
- **Why deferred:** levelHeights is now an explicit user setting per rack. If the
  user edits a bin type's height after racks are drawn, their levelHeights remain
  at the old values (which is actually correct — they reflect the user's intent).
  However, there is no affordance to "reset to bin type default."
- **Unblocks at:** Step 4 — add a "Reset to type default" button per rack.

## DEBT-004 — bin label overrides panel is v1 / minimal

- **Introduced:** 2026-06-23 (Step 3)
- **Why deferred:** The per-bin override list is a collapsible `<details>` panel
  inside the rack properties pane. It shows all bins for the selected rack and lets
  users type a custom `whse_location`, but there is no bulk-edit affordance,
  no search/filter for large racks, and no visual indicator on the canvas that a
  bin has an override.
- **Unblocks at:** Step 4 or later — extend when override workflows are better
  understood from real usage.

## DEBT-005 — node kind vocabulary mismatch (Step 4, 2026-06-23)

- **Introduced:** 2026-06-23 (Step 4)
- **Current state:** Editor uses `door/ramp/junction/dock/staging/charge`.
  db_connect uses `access_point/waypoint/staging_area/reference_marker`. The
  validator now tolerates all ten kinds so db_connect files import cleanly, but
  no translation or UI rename is performed.
- **Unblocks at:** Step 5 — decide on canonical vocabulary; add translate-on-import
  or unified kind list.

## DEBT-006 — rack access_face / back_to_back_spine have no editing UI (Step 4, 2026-06-23)

- **Introduced:** 2026-06-23 (Step 4)
- **Current state:** Pass-through on load/save; new racks get `null`.
- **Unblocks at:** Step 5 — add rack property panel fields.

## DEBT-007 — zone operations block has no editing UI (Step 4, 2026-06-23)

- **Introduced:** 2026-06-23 (Step 4)
- **Current state:** Pass-through on load/save; new zones get `null`.
- **Unblocks at:** Step 5 — add zone property panel fields.

## DEBT-008 — edge attributes have no editing UI (Step 4, 2026-06-23)

- **Introduced:** 2026-06-23 (Step 4)
- **Current state:** `traffic_class`, `width_m`, `direction`, `speed_limit_mps`,
  `vertical_clearance_m`, `surface` pass through on load/save; new edges get
  `null` for each.
- **Unblocks at:** Step 5 — add edge property panel fields.

## DEBT-009 — settings.units hardcoded to "metres" (Step 4, 2026-06-23)

- **Introduced:** 2026-06-23 (Step 4)
- **Declared boundary:** No multi-unit mode. `settings.units = "metres"` is
  authored on every save. This is an intentional scope decision, not an oversight.
- **Unblocks at:** Never unless the product adds unit conversion.

## DEBT-010 — coordinate origin declared but not site-calibrated (Step 4, 2026-06-23)

- **Introduced:** 2026-06-23 (Step 4)
- **Current state:** `meta.coordinate_system.origin` is declared with placeholder
  text ("Set by site survey"). The editor accepts the user's coordinate frame
  as-is; no GPS/survey anchor is wired.
- **Unblocks at:** Step 5 or later — add site-survey UI or import from a survey
  tool.

## DEBT-011 — whse_location format intentionally diverges from db_connect sample (Step 4, 2026-06-23)

- **Introduced:** 2026-06-23 (Step 4)
- **Decision:** The editor emits 3-part HomeSource join keys (`ROW-BAY-LEVEL`,
  e.g. `"C-01-1"`). The db_connect sample uses a 4-part zone-prefixed pattern
  (`ZONE-ROW-BAY-LEVEL`, e.g. `"1-C-01-1"`). The 3-part form is the WMS join
  key; the zone is a separate field on each bin record. This divergence is
  intentional and documented in `meta.bin_label_format.note`.
- **Unblocks at:** If db_connect ever adopts the 3-part form, remove this note.
