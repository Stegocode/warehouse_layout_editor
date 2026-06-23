# Debt Ledger

Tracked deferrals. Each entry: date introduced, scope, and what unblocks resolution.

---

## DEBT-001 — editor.js exceeds the 400-line file cap
- **Introduced:** 2026-06-23 (pre-existing at Step 2)
- **Current size:** ~985 lines
- **Why deferred:** editor.js is a single-file browser module with no build step.
  Splitting it cleanly requires either a bundler or careful ES module re-wiring.
  Out of scope for Step 2, which is a data-model change.
- **Unblocks at:** Step 4 (adopt db_connect format) — that step restructures the
  persistence layer and is the right moment to also split editor concerns.

## DEBT-002 — expandBins() z-coordinate still uses the uniform formula
- **Introduced:** 2026-06-23 (Step 2)
- **Location:** `app/js/geometry.js` → `expandBins()`, line using `(l-1)*(t.h||0)`
- **Why deferred:** The task spec says not to touch bin naming or db_connect format
  until Steps 3–4. The `z` field in the export payload is part of that format.
- **Unblocks at:** Step 3 or Step 4 — once the export format is finalised, update
  `expandBins` to use `levelBaseZ(r.levelHeights, l - 1)` instead of the uniform
  formula so exported z positions reflect per-level heights.

## DEBT-003 — changing binType.h does not auto-update existing levelHeights
- **Introduced:** 2026-06-23 (Step 2)
- **Why deferred:** levelHeights is now an explicit user setting per rack. If the
  user edits a bin type's height after racks are drawn, their levelHeights remain
  at the old values (which is actually correct — they reflect the user's intent).
  However, there is no affordance to "reset to bin type default." 
- **Unblocks at:** Step 3 (properties panel work) — add a "Reset to type default"
  button per rack in the properties panel.
