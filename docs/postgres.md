# Connecting to Postgres

The editor runs fine without a database — it autosaves to the browser and
exports/imports JSON. The Postgres layer is **optional** and exists so layouts
can be stored centrally and, later, served through an HTTP API. Today you use it
from Python scripts or a REPL.

## 1. Install the driver

```bash
pip install -r requirements.txt
```

## 2. Point the app at your database

The connection string comes from the `DATABASE_URL` environment variable — it is
never hardcoded.

```bash
# macOS / Linux
export DATABASE_URL="postgresql://user:password@localhost:5432/warehouse"

# Windows PowerShell
$env:DATABASE_URL = "postgresql://user:password@localhost:5432/warehouse"
```

Create the database first if it doesn't exist:

```bash
createdb warehouse
```

## 3. Create the schema and seed the default layout

```bash
python -m server.seed
```

This creates the `layouts` table (see `schema/0001_init.sql`) and stores
`app/data/default_layout.json` under its building name. You can also apply the
DDL by hand:

```bash
psql "$DATABASE_URL" -f schema/0001_init.sql
```

## 4. Read and write layouts from Python

```python
from server.persistence import LayoutRepository, connect

with connect() as conn:
    repo = LayoutRepository(conn)
    repo.init_db()                      # idempotent

    layout = repo.get("OUTLET WAREHOUSE")   # -> dict or None
    layout["meta"]["name"] = "OUTLET WAREHOUSE (rev B)"
    repo.save(layout["meta"]["name"], layout)   # validates, then upserts

    for row in repo.list_layouts():
        print(row["name"], row["schema_version"], row["updated_at"])
```

`save()` validates the layout (same rules as the browser) and refuses to write
an invalid one.

## Schema

A layout is stored whole as `JSONB` under a unique `name`:

| column           | type          | notes                                  |
| ---------------- | ------------- | -------------------------------------- |
| `id`             | `SERIAL`      | primary key                            |
| `name`           | `TEXT UNIQUE` | building name / layout label           |
| `schema_version` | `INTEGER`     | denormalized from the JSON for queries |
| `data`           | `JSONB`       | the full layout document               |
| `created_at`     | `TIMESTAMPTZ` | set on insert                          |
| `updated_at`     | `TIMESTAMPTZ` | bumped on update                       |

## Where an HTTP API would go

When you want the browser to read/write the DB directly, add a small web
framework (e.g. FastAPI) with endpoints like `GET /layouts/{name}` and
`PUT /layouts/{name}` that call `LayoutRepository`. The validation, schema, and
storage are already here; only the HTTP glue and a fetch-based save in the client
would be new.
