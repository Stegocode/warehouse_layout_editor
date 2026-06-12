// store.js — where a layout comes from and where the working draft is cached.
//
// Source of truth at startup:
//   1. If the browser has a saved draft in localStorage, use it (migrated).
//   2. Otherwise fetch the shipped default from data/default_layout.json.
//
// The localStorage copy is a convenience draft cache so a reload doesn't lose
// in-progress edits. It is NOT a substitute for Export JSON (or, later, the
// Postgres backend) — see README and docs/postgres.md.

import { migrate } from './migrations.js';

export const LS_KEY = 'warehouse_layout_editor_v1';
const DEFAULT_LAYOUT_URL = 'data/default_layout.json';

export async function fetchDefaultLayout() {
  const res = await fetch(DEFAULT_LAYOUT_URL, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Could not load ${DEFAULT_LAYOUT_URL} (HTTP ${res.status})`);
  }
  return migrate(await res.json());
}

// Returns { layout, fromCache }. Throws only if BOTH localStorage and the
// default fetch fail (e.g. opened from a file:// URL).
export async function loadInitialLayout() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { layout: migrate(JSON.parse(raw)), fromCache: true };
  } catch (err) {
    // Corrupt cache shouldn't be fatal — fall through to the default.
    console.warn('Ignoring unreadable localStorage draft:', err);
  }
  return { layout: await fetchDefaultLayout(), fromCache: false };
}

// Synchronously write the working draft. Throws on quota errors so the caller
// can warn the user to export.
export function saveLayout(layout) {
  localStorage.setItem(LS_KEY, JSON.stringify(layout));
}

export function clearDraft() {
  localStorage.removeItem(LS_KEY);
}
