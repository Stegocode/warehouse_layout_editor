# Warehouse Layout Editor

A browser-based editor for warehouse floor layouts — zones, rack rows, path
nodes/edges, and a calibrated background tracing image — with a live 2D plan and
a 3D preview. Layouts export to JSON and can be stored in Postgres.

The app is a static client (HTML/CSS/ES modules + a vendored copy of three.js).
Python is used for a tiny dev server and the optional database layer.

---

## Quick start (run it with Python)

You need **Python 3.10+**. No build step, no `npm install` required to run.

```bash
# from the repository root
python -m server.dev_server
```

Open the printed URL — **http://localhost:8000**. That's it.

> The server always serves the `app/` folder, so you can launch it from the repo
> root and the app finds its data correctly. The app must be served over HTTP
> (it uses ES modules and `fetch`); opening `app/index.html` as a `file://` page
> will show an error instead of the editor.

If you'd rather use any other static server, point it at the `app/` directory:

```bash
cd app
python -m http.server 8000      # then open http://localhost:8000
```

### Using the editor

- **Toolbar:** Select/Move, +Zone, +Rack Row, +Node/Door, +Path Edge, Delete.
- **Keyboard:** `V` select · `Z` zone · `R` rack · `N` node · `E` edge ·
  `X` delete · `Esc` cancel · `Del` remove selected.
- **Canvas:** drag to move a selected object, right-drag to pan, scroll to zoom.
- **2D Plan / 3D Preview** toggle in the toolbar.
- **Export JSON / Import JSON** for sharing or version-controlling a layout.

Your edits autosave to the browser's `localStorage`, so a reload keeps your work.
To reset back to the shipped default, run this in the browser console (F12) and
reload:

```js
localStorage.removeItem('warehouse_layout_editor_v1');
```

---

## Coordinate system

- **Origin (0, 0)** is the SW (south-west) corner of Zone E.
- **+x = East**, **+y = North**, **+z = Up** (elevation), all in **metres**.
- The 2D plan shows the origin with red (East) and green (North) axis arrows and
  a fixed **N** compass in the top-right corner (north is always screen-up in 2D).
- The 3D preview shows an origin marker at (0, 0, 0) with labeled **+X East**,
  **+Y North**, **+Z Up** axes.

---

## Updating the data

There are two kinds of "data," and they're separate on purpose:

1. **The shipped default layout** — `app/data/default_layout.json`. This is what
   a brand-new browser (with no saved draft) loads. Edit this file to change the
   starting layout for everyone. It is plain JSON; reload the page to see changes.
   After editing, the test suite will tell you if you broke the structure
   (`pytest tests/test_layout_schema.py`).

2. **A working layout you're editing** — lives in the browser and in exported
   JSON files. Use **Export JSON** to save one to disk and **Import JSON** to
   load it back.

### Save format (db_connect-native)

Exported files use the **db_connect shape**, which feeds directly into the WMS
pipeline. Top-level keys: `meta` (with `coordinate_system` and
`bin_label_format`), `settings`, `categories`, `binTypes`, `vehicles`,
`dwell_times`, `zones`, `nodes`, `edges`, `racks`, `bins`, and an `editor`
extension block (`schemaVersion`, `naming`, `binOverrides`).

`bins` are **generated on every save** — not stored on rack objects. Each bin
carries a `whse_location`: the 3-part HomeSource join key `ROW-BAY-LEVEL`
(e.g. `C-01-1`). Zone is a separate field on the bin record and does not appear
in the label string. (db_connect's sample uses a 4-part zone-prefixed form;
the 3-part form matches the WMS join-key format.)

See **[docs/step4-mapping.md](docs/step4-mapping.md)** for the full field-by-field
mapping between the editor's internal model and the db_connect file format.

### Schema versioning

Layout files carry a version in `editor.schemaVersion`. When the format changes,
bump `SCHEMA_VERSION` in `app/js/schema.js` and add a migration in
`app/js/migrations.js`. Old drafts and imported files are migrated automatically
on load. The translator pair (`toDbConnect` / `fromDbConnect` in
`app/js/dbconnect.js`) handles conversion between the editor's internal state and
the on-disk format.

---

## Storing layouts in Postgres (optional)

The editor works without a database. If you want central storage, see
**[docs/postgres.md](docs/postgres.md)** — it covers installing the driver,
setting `DATABASE_URL`, creating the schema, seeding the default, and reading /
writing layouts from Python. In short:

```bash
pip install -r requirements.txt
export DATABASE_URL="postgresql://user:password@localhost:5432/warehouse"
python -m server.seed
```

---

## Project structure

```
warehouse-layout-editor/
├── app/                      # the static client (this is the web root)
│   ├── index.html
│   ├── css/styles.css
│   ├── data/default_layout.json   # shipped default layout (edit this)
│   ├── js/
│   │   ├── main.js           # entry point: load layout, start editor
│   │   ├── editor.js         # 2D plan editor (tools, drawing, panels, I/O)
│   │   ├── preview3d.js      # 3D preview
│   │   ├── store.js          # localStorage draft + default fetch
│   │   ├── migrations.js     # schema migrations
│   │   ├── schema.js         # schema version + validator
│   │   ├── geometry.js       # pure layout math + bin expansion
│   │   └── dbconnect.js      # toDbConnect / fromDbConnect (db_connect format)
│   └── vendor/three.module.js
├── server/                   # Python: dev server + Postgres layer
│   ├── dev_server.py         # python -m server.dev_server
│   ├── persistence.py        # LayoutRepository (psycopg)
│   ├── layout_schema.py      # Python mirror of the JS validator
│   ├── config.py             # DATABASE_URL
│   └── seed.py               # python -m server.seed
├── schema/0001_init.sql      # Postgres DDL
├── tests/                    # pytest + node --test
├── docs/postgres.md
├── VERSION, CHANGELOG.md, LICENSE, .gitignore
└── pyproject.toml, package.json, eslint.config.js, .prettierrc.json
```

---

## Development

```bash
# Python: lint, format check, tests
pip install -r requirements-dev.txt
ruff check .
ruff format --check .
pytest

# JavaScript: unit tests (no install needed), plus optional lint/format
node --test tests/js/
npm install        # only needed for eslint/prettier
npm run lint
npm run format
```

CI runs all of the above on every push and pull request
(`.github/workflows/ci.yml`).

The JS unit tests cover the pure modules (`geometry.js`, `migrations.js`); the
editor and 3D rendering are exercised by hand in the browser.

---

## Vendoring three.js

The 3D preview requires `app/vendor/three.module.js` (three.js r128 ES module).
It is not included in the repository — vendor it once:

```bash
cd /tmp && npm pack three@0.128.0 && tar xzf three-0.128.0.tgz
cp package/build/three.module.js <repo>/app/vendor/three.module.js
```

The 2D editor works without it; only clicking "3D Preview" requires the file.

---

## Versioning

The project uses [Semantic Versioning](https://semver.org/); the current release
is in [`VERSION`](VERSION) and changes are recorded in
[`CHANGELOG.md`](CHANGELOG.md). Note this is distinct from the layout
`schemaVersion`, which versions the data format rather than the app.

## Committing to GitHub

See **[docs/git-and-github.md](docs/git-and-github.md)** for first-commit, remote
setup, and push instructions. In short, from the repo root:

```bash
git init && git add . && git commit -m "Initial commit: warehouse layout editor v0.1.0"
git tag -a v0.1.0 -m "v0.1.0"
# then create a remote and: git push -u origin main && git push --tags
```

## License

MIT — see [`LICENSE`](LICENSE).
