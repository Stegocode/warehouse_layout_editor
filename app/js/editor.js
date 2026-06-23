// editor.js — the 2D plan editor. Owns the live `state`, the canvas camera, the
// toolset, and the side-panel UI. Pure layout math lives in geometry.js;
// persistence lives in store.js; the 3D view lives in preview3d.js.

import { ptSegDist, enrichForExport, expandBins } from './geometry.js';
import { saveLayout, fetchDefaultLayout } from './store.js';
import { createPreview3D } from './preview3d.js';

let state;
let preview;

// DOM refs (resolved in initEditor)
let cv;
let ctx;
let props;
let toolHint;

// 2D camera: world center (cx, cy) in metres + zoom in px/m
const view = { cx: 61, cy: 27, zoom: 10 };

// interaction state
let tool = 'select';
let sel = null; // { kind, obj }
let pendingEdgeNode = null;
let dragDraw = null;
let dragMove = null;
let panning = null;
let calMode = false;
let calClicks = [];
let mode3d = false;
let bgImage = null;
let saveTimer = null;

// ---------- coordinate transforms ----------
const sx = (x) => (x - view.cx) * view.zoom * devicePixelRatio + cv.width / 2;
const sy = (y) => cv.height / 2 - (y - view.cy) * view.zoom * devicePixelRatio;
const wx = (px) => (px * devicePixelRatio - cv.width / 2) / (view.zoom * devicePixelRatio) + view.cx;
const wy = (py) => (cv.height / 2 - py * devicePixelRatio) / (view.zoom * devicePixelRatio) + view.cy;
const snap = (v) => {
  const s = +state.settings.snap || 0;
  return s > 0 ? Math.round(v / s) * s : v;
};

// Draw a line from (x1,y1) to (x2,y2) with an arrowhead at the end, in device px.
function drawArrow(x1, y1, x2, y2, color) {
  const dpr = devicePixelRatio;
  const head = 7 * dpr;
  const ang = Math.atan2(y2 - y1, x2 - x1);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2 * dpr;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(ang - 0.4), y2 - head * Math.sin(ang - 0.4));
  ctx.lineTo(x2 - head * Math.cos(ang + 0.4), y2 - head * Math.sin(ang + 0.4));
  ctx.closePath();
  ctx.fill();
}

// ---------- persistence (debounced draft cache + saved flag) ----------
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      saveLayout(state);
      flagSaved('saved');
    } catch {
      flagSaved('not saved — export!', true);
    }
  }, 400);
}
function flagSaved(text, warn) {
  const el = document.getElementById('savedFlag');
  el.textContent = text;
  el.style.color = warn ? 'var(--node)' : 'var(--ok)';
  if (!warn) {
    setTimeout(() => {
      if (el.textContent === text) el.textContent = '';
    }, 2200);
  }
}

function loadBgImage() {
  if (state.bg && state.bg.dataURL) {
    bgImage = new Image();
    bgImage.onload = draw;
    bgImage.src = state.bg.dataURL;
  } else {
    bgImage = null;
  }
}

// ---------- canvas sizing ----------
function resize() {
  cv.width = cv.clientWidth * devicePixelRatio;
  cv.height = cv.clientHeight * devicePixelRatio;
  draw();
}

// ---------- draw ----------
function draw() {
  if (mode3d) return;
  const W = cv.width;
  const H = cv.height;
  const z = view.zoom * devicePixelRatio;
  ctx.fillStyle = '#14181d';
  ctx.fillRect(0, 0, W, H);

  if (bgImage && state.bg) {
    ctx.save();
    ctx.globalAlpha = (state.bg.opacity ?? 35) / 100;
    const s = state.bg.mPerPx * z;
    ctx.translate(sx(state.bg.ox), sy(state.bg.oy + bgImage.height * state.bg.mPerPx));
    ctx.scale(s, s);
    ctx.drawImage(bgImage, 0, 0);
    ctx.restore();
  }

  const g = +state.settings.grid || 10;
  const x0 = Math.floor(wx(0) / g) * g;
  const x1 = wx(cv.clientWidth);
  const y1 = Math.floor(wy(cv.clientHeight) / g) * g;
  const y0 = wy(0);
  ctx.strokeStyle = '#212931';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = x0; x <= x1; x += g) {
    ctx.moveTo(sx(x), 0);
    ctx.lineTo(sx(x), H);
  }
  for (let y = y1; y <= y0; y += g) {
    ctx.moveTo(0, sy(y));
    ctx.lineTo(W, sy(y));
  }
  ctx.stroke();
  ctx.strokeStyle = '#3a4654';
  ctx.beginPath();
  ctx.moveTo(sx(0), 0);
  ctx.lineTo(sx(0), H);
  ctx.moveTo(0, sy(0));
  ctx.lineTo(W, sy(0));
  ctx.stroke();

  // origin axes at (0,0): +x = East (screen right), +y = North (screen up)
  const dpr = devicePixelRatio;
  const aLen = 56 * dpr;
  const ox = sx(0);
  const oy = sy(0);
  drawArrow(ox, oy, ox + aLen, oy, '#d4453a');
  drawArrow(ox, oy, ox, oy - aLen, '#5fb878');
  ctx.font = `600 ${12 * dpr}px Consolas`;
  ctx.fillStyle = '#d4453a';
  ctx.fillText('x → E', ox + aLen + 4 * dpr, oy + 4 * dpr);
  ctx.fillStyle = '#5fb878';
  ctx.fillText('y ↑ N', ox + 5 * dpr, oy - aLen - 5 * dpr);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(ox, oy, 3 * dpr, 0, 7);
  ctx.fill();
  ctx.fillStyle = '#aeb8c2';
  ctx.font = `${11 * dpr}px Consolas`;
  ctx.fillText('0,0', ox + 7 * dpr, oy + 15 * dpr);

  // fixed north compass, top-right of the canvas (north is always screen-up in 2D)
  const cxp = W - 40 * dpr;
  const cyp = 50 * dpr;
  drawArrow(cxp, cyp + 20 * dpr, cxp, cyp - 20 * dpr, '#5fb878');
  ctx.fillStyle = '#9fb4cf';
  ctx.font = `600 ${14 * dpr}px Consolas`;
  ctx.textAlign = 'center';
  ctx.fillText('N', cxp, cyp - 26 * dpr);
  ctx.textAlign = 'left';

  state.zones.forEach((zn) => {
    const seld = sel && sel.kind === 'zone' && sel.obj === zn;
    ctx.fillStyle = zn.color + '55';
    ctx.strokeStyle = seld ? '#5fa8e8' : zn.color;
    ctx.lineWidth = seld ? 3 : 1.5;
    const x = sx(zn.x);
    const y = sy(zn.y + zn.d);
    const w = zn.w * z;
    const h = zn.d * z;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#eef2f6';
    ctx.font = `600 ${Math.max(12, z * 4)}px Consolas`;
    ctx.fillText('ZONE ' + zn.id, x + 8, y + Math.max(16, z * 5));
    ctx.fillStyle = '#9aa6b3';
    ctx.font = `${Math.max(10, z * 2.4)}px Consolas`;
    ctx.fillText(`${zn.w}×${zn.d}  elev ${zn.elev}`, x + 8, y + Math.max(30, z * 8.4));
  });

  state.racks.forEach((r) => {
    const t = state.binTypes[r.type] || { w: 4, d: 4, color: '#888' };
    const seld = sel && sel.kind === 'rack' && sel.obj === r;
    for (let b = 0; b < r.bays; b++) {
      let bx = r.x;
      let by = r.y;
      let bw;
      let bd;
      if (r.dir === 'E') {
        bx += b * t.w;
        bw = t.w;
        bd = t.d;
      } else {
        by += b * t.w;
        bw = t.d;
        bd = t.w;
      }
      ctx.fillStyle = t.color + (seld ? 'cc' : '88');
      ctx.strokeStyle = seld ? '#5fa8e8' : '#10141a';
      ctx.lineWidth = seld ? 2 : 1;
      ctx.fillRect(sx(bx), sy(by + bd), bw * z, bd * z);
      ctx.strokeRect(sx(bx), sy(by + bd), bw * z, bd * z);
    }
    ctx.fillStyle = seld ? '#5fa8e8' : '#cfd8e2';
    ctx.font = `600 ${Math.max(11, z * 2.6)}px Consolas`;
    const dOff = r.dir === 'E' ? z * (state.binTypes[r.type]?.d || 4) : 0;
    ctx.fillText(
      `${r.id} ×${r.bays} L${r.levels} ${r.type}`,
      sx(r.x),
      sy(r.y) + Math.max(13, z * 3.2) + dOff + 12,
    );
  });

  state.edges.forEach((ed) => {
    const a = state.nodes.find((n) => n.id === ed.a);
    const b = state.nodes.find((n) => n.id === ed.b);
    if (!a || !b) return;
    const seld = sel && sel.kind === 'edge' && sel.obj === ed;
    ctx.strokeStyle = seld ? '#5fa8e8' : ed.ramp ? '#e8a33d' : '#7f8a96';
    ctx.lineWidth = seld ? 4 : 2;
    ctx.setLineDash(ed.ramp ? [8, 5] : []);
    ctx.beginPath();
    ctx.moveTo(sx(a.x), sy(a.y));
    ctx.lineTo(sx(b.x), sy(b.y));
    ctx.stroke();
    ctx.setLineDash([]);
  });

  state.nodes.forEach((n) => {
    const seld = sel && sel.kind === 'node' && sel.obj === n;
    const pend = pendingEdgeNode === n;
    ctx.fillStyle = n.kind === 'ramp' ? '#e8a33d' : '#d4453a';
    ctx.strokeStyle = seld || pend ? '#5fa8e8' : '#10141a';
    ctx.lineWidth = seld || pend ? 3 : 1.5;
    ctx.beginPath();
    ctx.arc(sx(n.x), sy(n.y), Math.max(5, z * 1.0), 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffb3ab';
    ctx.font = `${Math.max(10, z * 2.2)}px Consolas`;
    ctx.fillText(n.id, sx(n.x) + 8, sy(n.y) - 8);
  });

  if (dragDraw) {
    ctx.strokeStyle = '#5fa8e8';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    if (tool === 'zone') {
      const x = Math.min(dragDraw.x0, dragDraw.x1);
      const y = Math.max(dragDraw.y0, dragDraw.y1);
      ctx.strokeRect(
        sx(x),
        sy(y),
        Math.abs(dragDraw.x1 - dragDraw.x0) * z,
        Math.abs(dragDraw.y1 - dragDraw.y0) * z,
      );
    } else if (tool === 'rack') {
      ctx.beginPath();
      ctx.moveTo(sx(dragDraw.x0), sy(dragDraw.y0));
      ctx.lineTo(sx(dragDraw.x1), sy(dragDraw.y1));
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  if (calClicks.length === 1) {
    ctx.fillStyle = '#5fa8e8';
    ctx.beginPath();
    ctx.arc(calClicks[0].px * devicePixelRatio, calClicks[0].py * devicePixelRatio, 6, 0, 7);
    ctx.fill();
  }
}

// ---------- tools ----------
function setHint(t) {
  toolHint.textContent = t;
  toolHint.style.display = t ? 'block' : 'none';
}
function setTool(t) {
  tool = t;
  pendingEdgeNode = null;
  dragDraw = null;
  calMode = false;
  calClicks = [];
  document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
  const hints = {
    zone: 'Drag a rectangle for the new zone',
    rack: 'Drag along the row direction — bays auto-fill',
    node: 'Click to place a node (door, dock, junction…)',
    edge: 'Click first node, then second node',
    delete: 'Click anything to delete it',
  };
  setHint(hints[t] || '');
  cv.style.cursor = t === 'select' ? 'default' : 'crosshair';
  draw();
}

function hitTest(x, y) {
  const tol = 8 / view.zoom;
  for (const n of state.nodes) {
    if (Math.hypot(n.x - x, n.y - y) < tol) return { kind: 'node', obj: n };
  }
  for (const ed of state.edges) {
    const a = state.nodes.find((n) => n.id === ed.a);
    const b = state.nodes.find((n) => n.id === ed.b);
    if (a && b && ptSegDist(x, y, a.x, a.y, b.x, b.y) < tol * 0.8) return { kind: 'edge', obj: ed };
  }
  for (const r of [...state.racks].reverse()) {
    const t = state.binTypes[r.type] || { w: 4, d: 4 };
    const w = r.dir === 'E' ? r.bays * t.w : t.d;
    const d = r.dir === 'E' ? t.d : r.bays * t.w;
    if (x >= r.x && x <= r.x + w && y >= r.y && y <= r.y + d) return { kind: 'rack', obj: r };
  }
  for (const zn of [...state.zones].reverse()) {
    if (x >= zn.x && x <= zn.x + zn.w && y >= zn.y && y <= zn.y + zn.d) return { kind: 'zone', obj: zn };
  }
  return null;
}

function deleteSelected() {
  if (!sel) return;
  if (sel.kind === 'zone') state.zones = state.zones.filter((z) => z !== sel.obj);
  if (sel.kind === 'rack') state.racks = state.racks.filter((r) => r !== sel.obj);
  if (sel.kind === 'edge') state.edges = state.edges.filter((ed) => ed !== sel.obj);
  if (sel.kind === 'node') {
    state.edges = state.edges.filter((ed) => ed.a !== sel.obj.id && ed.b !== sel.obj.id);
    state.nodes = state.nodes.filter((n) => n !== sel.obj);
  }
  sel = null;
  save();
  renderProps();
  draw();
}

function nextZoneId() {
  for (let i = 0; i < 26; i++) {
    const c = String.fromCharCode(65 + i);
    if (!state.zones.some((z) => z.id === c)) return c;
  }
  return 'Z' + state.zones.length;
}
function nextRackId() {
  let i = 1;
  while (state.racks.some((r) => r.id === 'ROW-' + i)) i++;
  return 'ROW-' + i;
}
function nextNodeId(kind) {
  let i = 1;
  const p = kind.toUpperCase();
  while (state.nodes.some((n) => n.id === `${p}-${i}`)) i++;
  return `${p}-${i}`;
}
function randColor() {
  const cs = ['#4a5a72', '#55657d', '#4f6a63', '#5d6f55', '#6d5f4e', '#6b5a66', '#5a6b8a', '#6e5a4a'];
  return cs[Math.floor(Math.random() * cs.length)];
}

// ---------- properties panel ----------
function f(label, html) {
  return `<div class="field"><label>${label}</label>${html}</div>`;
}
function bind(id, fn) {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('input', (e) => {
      fn(e.target.value);
      save();
      draw();
    });
  }
}
function bindNum(id, key, obj, int) {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('input', (e) => {
      const v = int ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
      if (!Number.isNaN(v)) {
        obj[key] = v;
        save();
        draw();
      }
    });
  }
}

function renderProps() {
  if (!sel) {
    props.innerHTML = `<h2>Properties</h2>
      <div class="hintline">Nothing selected. Click an object with the Select tool,
      or use the toolbar to add zones, rack rows, nodes, and path edges.</div>
      <div class="field"><label>Building</label>
        <input type="text" id="p_bname" value="${state.meta.name}"></div>`;
    bind('p_bname', (v) => {
      state.meta.name = v;
    });
    return;
  }
  const o = sel.obj;
  if (sel.kind === 'zone') {
    props.innerHTML =
      `<h2>Zone</h2>` +
      f('ID', `<input type="text" id="p_id" value="${o.id}">`) +
      f('SW x (m)', `<input type="number" id="p_x" value="${o.x}" step="0.1">`) +
      f('SW y (m)', `<input type="number" id="p_y" value="${o.y}" step="0.1">`) +
      f('Width E-W', `<input type="number" id="p_w" value="${o.w}" step="0.5">`) +
      f('Depth N-S', `<input type="number" id="p_d" value="${o.d}" step="0.5">`) +
      f('Floor elev', `<input type="number" id="p_elev" value="${o.elev}" step="0.5">`) +
      f('Clear ht', `<input type="number" id="p_ch" value="${o.clearH}" step="0.5">`) +
      f('Color', `<input type="color" id="p_col" value="${o.color}">`) +
      `<div class="btnrow"><button class="btn small" id="p_del">Delete zone</button></div>`;
    bindNum('p_x', 'x', o);
    bindNum('p_y', 'y', o);
    bindNum('p_w', 'w', o);
    bindNum('p_d', 'd', o);
    bindNum('p_elev', 'elev', o);
    bindNum('p_ch', 'clearH', o);
    bind('p_id', (v) => {
      o.id = v;
    });
    bind('p_col', (v) => {
      o.color = v;
    });
    document.getElementById('p_del').onclick = deleteSelected;
  }
  if (sel.kind === 'node') {
    props.innerHTML =
      `<h2>Node</h2>` +
      f('ID', `<input type="text" id="p_id" value="${o.id}">`) +
      f(
        'Kind',
        `<select id="p_kind">
        ${['door', 'ramp', 'junction', 'dock', 'staging', 'charge']
          .map((k) => `<option ${o.kind === k ? 'selected' : ''}>${k}</option>`)
          .join('')}</select>`,
      ) +
      f('x (m)', `<input type="number" id="p_x" value="${o.x}" step="0.1">`) +
      f('y (m)', `<input type="number" id="p_y" value="${o.y}" step="0.1">`) +
      `<div class="hintline">Zone is auto-detected from position at export time.</div>` +
      `<div class="btnrow"><button class="btn small" id="p_del">Delete node</button></div>`;
    bindNum('p_x', 'x', o);
    bindNum('p_y', 'y', o);
    bind('p_kind', (v) => {
      o.kind = v;
    });
    bind('p_id', (v) => {
      state.edges.forEach((ed) => {
        if (ed.a === o.id) ed.a = v;
        if (ed.b === o.id) ed.b = v;
      });
      o.id = v;
    });
    document.getElementById('p_del').onclick = deleteSelected;
  }
  if (sel.kind === 'edge') {
    props.innerHTML =
      `<h2>Path edge</h2>` +
      f('From', `<input type="text" value="${o.a}" disabled>`) +
      f('To', `<input type="text" value="${o.b}" disabled>`) +
      f('Ramp', `<input type="checkbox" id="p_ramp" ${o.ramp ? 'checked' : ''}>`) +
      `<div class="hintline">Length is computed from node coordinates.</div>` +
      `<div class="btnrow"><button class="btn small" id="p_del">Delete edge</button></div>`;
    document.getElementById('p_ramp').onchange = (e) => {
      o.ramp = e.target.checked;
      save();
      draw();
    };
    document.getElementById('p_del').onclick = deleteSelected;
  }
  if (sel.kind === 'rack') {
    // Guards: ensure v4 fields exist (in-flight data may be mid-migration)
    if (!Array.isArray(o.levelHeights) || o.levelHeights.length !== o.levels) {
      const t = state.binTypes[o.type];
      const defH = t && t.h > 0 ? t.h : 0.12;
      o.levelHeights = Array.from({ length: Math.max(o.levels, 1) }, (_, i) => o.levelHeights?.[i] ?? defH);
    }
    if (!o.rowToken) o.rowToken = o.id.replace(/^[^-]+-/, '');
    if (!Number.isInteger(o.bayStart) || o.bayStart < 1) o.bayStart = 1;
    if (typeof o.bayReverse !== 'boolean') o.bayReverse = false;
    if (!state.binOverrides || typeof state.binOverrides !== 'object') state.binOverrides = {};

    const lhFields = o.levelHeights
      .map((h, i) =>
        f(`Level ${i + 1} ht (m)`, `<input type="number" id="p_lh_${i}" value="${h}" min="0.01" step="0.1">`),
      )
      .join('');

    // Bin label overrides — collapsible, rendered via <details>
    const rackBins = expandBins(state).filter((b) => b.row === o.id);
    const binovrRows = rackBins
      .map((b) => {
        const cur = state.binOverrides[b.override_key] ?? '';
        return `<div class="binovr-row">
          <span class="binovr-gen">${b.override_key in state.binOverrides ? '✎' : ''} ${b.bin_label}</span>
          <input type="text" class="binovr-inp" data-key="${b.override_key}"
            value="${cur}" placeholder="${b.bin_label}">
        </div>`;
      })
      .join('');

    props.innerHTML =
      `<h2>Rack row</h2>` +
      f('ID', `<input type="text" id="p_id" value="${o.id}">`) +
      f(
        'Bin type',
        `<select id="p_type">
        ${Object.keys(state.binTypes)
          .map((k) => `<option ${o.type === k ? 'selected' : ''}>${k}</option>`)
          .join('')}</select>`,
      ) +
      f(
        'Direction',
        `<select id="p_dir">
        <option ${o.dir === 'E' ? 'selected' : ''} value="E">E — bays run east</option>
        <option ${o.dir === 'N' ? 'selected' : ''} value="N">N — bays run north</option></select>`,
      ) +
      f('Bays', `<input type="number" id="p_bays" value="${o.bays}" min="1" step="1">`) +
      f('Levels', `<input type="number" id="p_lv" value="${o.levels}" min="1" step="1">`) +
      lhFields +
      f('Row token', `<input type="text" id="p_rt" value="${o.rowToken}">`) +
      f('Bay start', `<input type="number" id="p_bs" value="${o.bayStart}" min="1" step="1">`) +
      f('Bay reverse', `<input type="checkbox" id="p_br" ${o.bayReverse ? 'checked' : ''}>`) +
      f('Start x', `<input type="number" id="p_x" value="${o.x}" step="0.5">`) +
      f('Start y', `<input type="number" id="p_y" value="${o.y}" step="0.5">`) +
      `<div class="hintline">Bins generate as ROW-BAY-LEVEL at export (whse_location).</div>` +
      `<details><summary>Edit bin labels (${rackBins.length} bins)</summary>` +
      `<div class="binovr-scroll" id="p_binovr">${binovrRows}</div></details>` +
      `<div class="btnrow"><button class="btn small" id="p_del">Delete row</button></div>`;

    bindNum('p_x', 'x', o);
    bindNum('p_y', 'y', o);
    bindNum('p_bays', 'bays', o, true);
    bindNum('p_bs', 'bayStart', o, true);

    // Custom levels handler: resize levelHeights to stay in sync with levels count
    const lvEl = document.getElementById('p_lv');
    if (lvEl) {
      lvEl.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        if (Number.isNaN(v) || v < 1) return;
        const oldLen = o.levelHeights.length;
        if (v > oldLen) {
          const lastH = o.levelHeights[oldLen - 1] ?? (state.binTypes[o.type]?.h || 0.12);
          for (let i = oldLen; i < v; i++) o.levelHeights.push(lastH);
        } else {
          o.levelHeights.length = v;
        }
        o.levels = v;
        save();
        renderProps();
        draw();
      });
    }
    o.levelHeights.forEach((_, i) => {
      const lhEl = document.getElementById(`p_lh_${i}`);
      if (lhEl) {
        lhEl.addEventListener('input', (e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v) && v > 0) {
            o.levelHeights[i] = v;
            save();
            draw();
          }
        });
      }
    });

    // Bin label overrides — event delegation on the scroll container
    const binovrEl = document.getElementById('p_binovr');
    if (binovrEl) {
      binovrEl.addEventListener('input', (e) => {
        const key = e.target.dataset.key;
        if (!key) return;
        const v = e.target.value.trim();
        if (v) {
          state.binOverrides[key] = v;
        } else {
          delete state.binOverrides[key];
        }
        save();
      });
    }

    bind('p_id', (v) => {
      o.id = v;
    });
    bind('p_rt', (v) => {
      o.rowToken = v;
    });
    bind('p_type', (v) => {
      o.type = v;
    });
    bind('p_dir', (v) => {
      o.dir = v;
    });
    const brEl = document.getElementById('p_br');
    if (brEl) {
      brEl.addEventListener('change', (e) => {
        o.bayReverse = e.target.checked;
        save();
        draw();
      });
    }
    document.getElementById('p_del').onclick = deleteSelected;
  }
}

// ---------- bin types panel ----------
function renderBinTypes() {
  const box = document.getElementById('binTypeList');
  box.innerHTML = '';
  Object.entries(state.binTypes).forEach(([name, t]) => {
    const row = document.createElement('div');
    row.className = 'bt-row';
    row.innerHTML = `
      <input type="text" value="${name}" data-f="name">
      <input type="number" value="${t.w}" step="0.5" data-f="w">
      <input type="number" value="${t.d}" step="0.5" data-f="d">
      <input type="number" value="${t.h}" step="0.5" data-f="h">
      <input type="color" value="${t.color}" data-f="color">
      <span class="x" title="delete">×</span>`;
    row.querySelectorAll('input').forEach((inp) => {
      inp.addEventListener('change', () => {
        const field = inp.dataset.f;
        if (field === 'name') {
          const nv = inp.value.trim().toUpperCase() || name;
          if (nv !== name) {
            state.binTypes[nv] = state.binTypes[name];
            delete state.binTypes[name];
            state.racks.forEach((r) => {
              if (r.type === name) r.type = nv;
            });
            renderBinTypes();
            renderProps();
          }
        } else if (field === 'color') {
          state.binTypes[name].color = inp.value;
        } else {
          state.binTypes[name][field] = parseFloat(inp.value) || 0;
        }
        save();
        draw();
      });
    });
    row.querySelector('.x').onclick = () => {
      if (state.racks.some((r) => r.type === name)) {
        alert('Rows still use this type.');
        return;
      }
      delete state.binTypes[name];
      renderBinTypes();
      save();
      draw();
    };
    box.appendChild(row);
  });
}

// ---------- background image ----------
function updateBgInfo() {
  document.getElementById('bgInfo').textContent = state.bg
    ? `Image loaded · scale ${state.bg.mPerPx.toFixed(3)} m/px. Drag with Select does NOT move the image; adjust via Calibrate.`
    : 'No image loaded. Load your floorplan PNG, then Calibrate: click two points a known distance apart.';
}

// ---------- import / export ----------
function exportLayout() {
  const out = enrichForExport(state);
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'warehouse_layout.json';
  a.click();
  flagSaved('exported');
}

async function importLayoutFile(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    alert('Could not parse that file: ' + err.message);
    return;
  }
  delete data.bins; // derived — regenerate on next export; binOverrides is NOT deleted (user data)
  try {
    const { migrate } = await import('./migrations.js');
    data = migrate(data);
  } catch (err) {
    alert('Could not load that layout: ' + err.message);
    return;
  }
  // Backfill any missing top-level keys from the shipped default.
  const defaults = await fetchDefaultLayout();
  state = Object.assign(JSON.parse(JSON.stringify(defaults)), data);
  sel = null;
  loadBgImage();
  renderBinTypes();
  renderProps();
  updateBgInfo();
  save();
  draw();
}

// ---------- 3D toggle ----------
function setMode3d(on) {
  mode3d = on;
  document.getElementById('c3dwrap').style.display = on ? 'block' : 'none';
  cv.style.display = on ? 'none' : 'block';
  document.getElementById('view3d').classList.toggle('active', on);
  document.getElementById('view2d').classList.toggle('active', !on);
  if (on) {
    preview.build(state);
  } else {
    preview.teardown();
    draw();
  }
}

// ---------- pointer / keyboard wiring ----------
function wirePointer() {
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  cv.addEventListener('pointerdown', (e) => {
    const rect = cv.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const x = wx(mx);
    const y = wy(my);
    cv.setPointerCapture(e.pointerId);

    if (e.button === 2) {
      panning = { mx, my };
      return;
    }

    if (calMode) {
      calClicks.push({ x, y, px: mx, py: my });
      if (calClicks.length === 2) {
        const distM = parseFloat(prompt('Real-world distance between those two points, in metres:', '30'));
        if (distM > 0 && state.bg) {
          const dPx =
            Math.hypot(calClicks[1].x - calClicks[0].x, calClicks[1].y - calClicks[0].y) / state.bg.mPerPx;
          state.bg.mPerPx = distM / dPx;
          updateBgInfo();
          save();
        }
        calMode = false;
        calClicks = [];
        setHint('');
      } else {
        setHint('Calibrate: click the SECOND point');
      }
      draw();
      return;
    }

    if (tool === 'select') {
      const h = hitTest(x, y);
      sel = h;
      if (h && (h.kind === 'zone' || h.kind === 'rack' || h.kind === 'node')) {
        dragMove = { ox: x - h.obj.x, oy: y - h.obj.y };
      }
      renderProps();
      draw();
      return;
    }
    if (tool === 'zone' || tool === 'rack') {
      dragDraw = { x0: snap(x), y0: snap(y), x1: snap(x), y1: snap(y) };
      return;
    }
    if (tool === 'node') {
      const id = nextNodeId('door');
      const n = { id, kind: 'door', x: snap(x), y: snap(y) };
      state.nodes.push(n);
      sel = { kind: 'node', obj: n };
      save();
      renderProps();
      draw();
      return;
    }
    if (tool === 'edge') {
      const h = hitTest(x, y);
      if (h && h.kind === 'node') {
        if (!pendingEdgeNode) {
          pendingEdgeNode = h.obj;
          setHint(`Edge from ${h.obj.id} — click second node`);
        } else if (h.obj !== pendingEdgeNode) {
          state.edges.push({ a: pendingEdgeNode.id, b: h.obj.id, ramp: false });
          sel = { kind: 'edge', obj: state.edges[state.edges.length - 1] };
          pendingEdgeNode = null;
          setHint('Click first node, then second node');
          save();
          renderProps();
        }
      }
      draw();
      return;
    }
    if (tool === 'delete') {
      const h = hitTest(x, y);
      if (h) {
        sel = h;
        deleteSelected();
      }
    }
  });

  cv.addEventListener('pointermove', (e) => {
    const rect = cv.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const x = wx(mx);
    const y = wy(my);
    document.getElementById('status').textContent =
      `x: ${x.toFixed(1)} m , y: ${y.toFixed(1)} m   zoom ${view.zoom.toFixed(1)} px/m`;

    if (panning) {
      view.cx -= (mx - panning.mx) / view.zoom;
      view.cy += (my - panning.my) / view.zoom;
      panning = { mx, my };
      draw();
      return;
    }
    if (dragDraw) {
      dragDraw.x1 = snap(x);
      dragDraw.y1 = snap(y);
      draw();
      return;
    }
    if (dragMove && sel) {
      sel.obj.x = snap(x - dragMove.ox);
      sel.obj.y = snap(y - dragMove.oy);
      renderProps();
      draw();
    }
  });

  cv.addEventListener('pointerup', () => {
    if (panning) {
      panning = null;
      return;
    }
    if (dragMove) {
      dragMove = null;
      save();
      return;
    }
    if (!dragDraw) return;

    const { x0, y0, x1, y1 } = dragDraw;
    dragDraw = null;
    if (tool === 'zone') {
      const w = Math.abs(x1 - x0);
      const d = Math.abs(y1 - y0);
      if (w >= 4 && d >= 4) {
        const zn = {
          id: nextZoneId(),
          x: Math.min(x0, x1),
          y: Math.min(y0, y1),
          w,
          d,
          elev: 0,
          clearH: 14,
          color: randColor(),
        };
        state.zones.push(zn);
        sel = { kind: 'zone', obj: zn };
        save();
        renderProps();
      }
    }
    if (tool === 'rack') {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const dir = Math.abs(dx) >= Math.abs(dy) ? 'E' : 'N';
      const len = dir === 'E' ? Math.abs(dx) : Math.abs(dy);
      const type = Object.keys(state.binTypes)[0] || 'STD';
      const bw = state.binTypes[type]?.w || 4.5;
      const bays = Math.max(1, Math.floor(len / bw));
      const rackId = nextRackId();
      const defaultLevelH = state.binTypes[type]?.h > 0 ? state.binTypes[type].h : 0.12;
      const r = {
        id: rackId,
        type,
        dir,
        bays,
        levels: 3,
        levelHeights: [defaultLevelH, defaultLevelH, defaultLevelH],
        rowToken: rackId.replace(/^[^-]+-/, ''),
        bayStart: 1,
        bayReverse: false,
        x: dir === 'E' ? Math.min(x0, x1) : x0,
        y: dir === 'E' ? y0 : Math.min(y0, y1),
      };
      state.racks.push(r);
      sel = { kind: 'rack', obj: r };
      save();
      renderProps();
    }
    draw();
  });

  cv.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const rect = cv.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const px = wx(mx);
      const py = wy(my);
      view.zoom *= e.deltaY > 0 ? 0.88 : 1.14;
      view.zoom = Math.max(0.4, Math.min(40, view.zoom));
      view.cx = px - (mx * devicePixelRatio - cv.width / 2) / (view.zoom * devicePixelRatio);
      view.cy = py + (my * devicePixelRatio - cv.height / 2) / (view.zoom * devicePixelRatio);
      draw();
    },
    { passive: false },
  );
}

function wireKeyboard() {
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    const k = e.key.toLowerCase();
    if (k === 'v') setTool('select');
    if (k === 'z') setTool('zone');
    if (k === 'r') setTool('rack');
    if (k === 'n') setTool('node');
    if (k === 'e') setTool('edge');
    if (k === 'x') setTool('delete');
    if (k === 'escape') {
      pendingEdgeNode = null;
      dragDraw = null;
      calMode = false;
      calClicks = [];
      setHint('');
      draw();
    }
    if ((k === 'delete' || k === 'backspace') && sel) deleteSelected();
  });
}

function wirePanels() {
  document.querySelectorAll('.tool').forEach((b) => {
    b.addEventListener('click', () => setTool(b.dataset.tool));
  });

  document.getElementById('addBinType').onclick = () => {
    let i = 1;
    while (state.binTypes['TYPE' + i]) i++;
    state.binTypes['TYPE' + i] = { w: 4.5, d: 4, h: 6, color: '#8f7fc4' };
    renderBinTypes();
    save();
  };

  const snapIn = document.getElementById('snapIn');
  const gridIn = document.getElementById('gridIn');
  snapIn.value = state.settings.snap;
  gridIn.value = state.settings.grid;
  snapIn.onchange = (e) => {
    state.settings.snap = parseFloat(e.target.value) || 0;
    save();
  };
  gridIn.onchange = (e) => {
    state.settings.grid = parseFloat(e.target.value) || 10;
    save();
    draw();
  };

  document.getElementById('bgLoad').onclick = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.onchange = () => {
      const file = inp.files[0];
      if (!file) return;
      const rd = new FileReader();
      rd.onload = () => {
        state.bg = { dataURL: rd.result, mPerPx: 0.107, ox: 0, oy: 0, opacity: 35 };
        loadBgImage();
        updateBgInfo();
        save();
      };
      rd.readAsDataURL(file);
    };
    inp.click();
  };
  document.getElementById('bgCal').onclick = () => {
    if (!state.bg) {
      alert('Load a background image first.');
      return;
    }
    calMode = true;
    calClicks = [];
    setHint('Calibrate: click the FIRST of two points a known distance apart');
  };
  document.getElementById('bgClear').onclick = () => {
    state.bg = null;
    bgImage = null;
    updateBgInfo();
    save();
    draw();
  };
  document.getElementById('bgOpacity').oninput = (e) => {
    if (state.bg) {
      state.bg.opacity = +e.target.value;
      save();
      draw();
    }
  };

  document.getElementById('view2d').onclick = () => setMode3d(false);
  document.getElementById('view3d').onclick = () => setMode3d(true);
  document.getElementById('exportBtn').onclick = exportLayout;
  document.getElementById('importBtn').onclick = () => document.getElementById('importFile').click();
  document.getElementById('importFile').onchange = (e) => {
    const file = e.target.files[0];
    if (file) importLayoutFile(file);
    e.target.value = '';
  };
}

// ---------- entry point ----------
export function initEditor(layout) {
  state = layout;

  cv = document.getElementById('c2d');
  ctx = cv.getContext('2d');
  props = document.getElementById('props');
  toolHint = document.getElementById('toolHint');
  preview = createPreview3D(document.getElementById('c3dwrap'));

  addEventListener('resize', resize);
  wirePointer();
  wireKeyboard();
  wirePanels();

  loadBgImage();
  renderProps();
  renderBinTypes();
  updateBgInfo();
  resize();
  setTool('select');
}
