// main.js — application entry point. Loads the working layout (from the
// localStorage draft, or the shipped default), then hands it to the editor.
// Any failure (most likely: opened from a file:// URL so fetch is blocked)
// surfaces as a visible message instead of a blank screen.

import { loadInitialLayout } from './store.js';
import { initEditor } from './editor.js';

function showError(message) {
  const el = document.getElementById('bootError');
  el.innerHTML =
    `<b>Could not start the editor.</b><br>${message}<br>` +
    `<span class="muted">Serve the <code>app/</code> folder over HTTP — e.g. ` +
    `<code>python -m server.dev_server</code> from the repo root — and open the printed URL. ` +
    `Opening index.html directly with a file:// URL will not work.</span>`;
  el.style.display = 'flex';
}

(async () => {
  try {
    const { layout } = await loadInitialLayout();
    initEditor(layout);
  } catch (err) {
    console.error(err);
    showError(err && err.message ? err.message : String(err));
  }
})();
