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
