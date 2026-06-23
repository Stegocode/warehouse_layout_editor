"""Postgres persistence for warehouse layouts.

This is the "backend-ready" piece: a small, real repository that reads and writes
whole layouts as JSONB. The browser app does not call it yet — persistence there
is localStorage + Export/Import JSON — but this module lets you stand up a
database today (from a script or REPL) and is where an HTTP API would plug in.

Design notes:
  - psycopg is imported lazily inside connect(), so this module (and its tests)
    import fine without the driver installed. Install it for real use:
        pip install -r requirements.txt
  - SQL uses %s placeholders and an explicit ::jsonb cast on a JSON string, which
    keeps the queries driver-detail-free and easy to unit-test with a fake cursor.
"""

from __future__ import annotations

import json
from pathlib import Path

from server import REPO_ROOT
from server.layout_schema import from_db_connect, validate_layout

SCHEMA_FILE = REPO_ROOT / "schema" / "0001_init.sql"
DEFAULT_LAYOUT_FILE = REPO_ROOT / "app" / "data" / "default_layout.json"


def read_schema_sql() -> str:
    """The DDL that creates the layouts table. Used by LayoutRepository.init_db."""
    return SCHEMA_FILE.read_text(encoding="utf-8")


def connect(dsn: str | None = None):
    """Open a psycopg connection. dsn defaults to DATABASE_URL via config."""
    import psycopg  # lazy: only needed for real database use

    from server.config import database_url

    return psycopg.connect(dsn or database_url())


class LayoutRepository:
    """CRUD for named layouts stored as JSONB.

    Pass any DB-API connection (psycopg in production, a fake in tests). The
    connection's lifecycle (open/close/commit) is the caller's responsibility,
    except that write methods commit on success.
    """

    def __init__(self, conn):
        self._conn = conn

    def init_db(self) -> None:
        with self._conn.cursor() as cur:
            cur.execute(read_schema_sql())
        self._conn.commit()

    def save(self, name: str, layout: dict) -> None:
        """Insert or update a layout by name. Validates before writing.

        layout must be in the v5 db_connect format. Validation converts to
        editor-native state first (mirrors how the browser validates on save).
        """
        errors = validate_layout(from_db_connect(layout))
        if errors:
            raise ValueError("Refusing to save an invalid layout:\n  - " + "\n  - ".join(errors))

        payload = json.dumps(layout)
        version = int((layout.get("editor") or {}).get("schemaVersion", 0))
        with self._conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO layouts (name, schema_version, data)
                VALUES (%s, %s, %s::jsonb)
                ON CONFLICT (name) DO UPDATE
                    SET schema_version = EXCLUDED.schema_version,
                        data           = EXCLUDED.data,
                        updated_at     = now()
                """,
                (name, version, payload),
            )
        self._conn.commit()

    def get(self, name: str) -> dict | None:
        """Return the layout stored under name, or None."""
        with self._conn.cursor() as cur:
            cur.execute("SELECT data FROM layouts WHERE name = %s", (name,))
            row = cur.fetchone()
        if not row:
            return None
        data = row[0]
        # psycopg returns JSONB as a dict already; tolerate a raw string too.
        return json.loads(data) if isinstance(data, str) else data

    def list_layouts(self) -> list[dict]:
        """Return metadata for every stored layout (no data blobs)."""
        with self._conn.cursor() as cur:
            cur.execute("SELECT id, name, schema_version, updated_at FROM layouts ORDER BY name")
            rows = cur.fetchall()
        return [
            {"id": r[0], "name": r[1], "schema_version": r[2], "updated_at": r[3]} for r in rows
        ]

    def delete(self, name: str) -> None:
        with self._conn.cursor() as cur:
            cur.execute("DELETE FROM layouts WHERE name = %s", (name,))
        self._conn.commit()


def load_default_layout(path: Path = DEFAULT_LAYOUT_FILE) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def seed_default(repo: LayoutRepository, path: Path = DEFAULT_LAYOUT_FILE) -> str:
    """Load the shipped default layout and store it under its building name."""
    layout = load_default_layout(path)
    name = layout["meta"]["name"]
    repo.save(name, layout)
    return name
