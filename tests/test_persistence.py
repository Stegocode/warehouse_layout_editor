"""Test LayoutRepository against a fake DB-API connection.

These verify the SQL and JSON handling without needing a live Postgres:
save() must validate, serialize to JSON, and issue an upsert; get() must parse
JSONB back to a dict whether the driver hands us a dict or a raw string.
"""

import json

import pytest

from server import APP_DIR
from server.persistence import LayoutRepository, read_schema_sql, seed_default


class FakeCursor:
    def __init__(self, conn):
        self._conn = conn
        self._result = None

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=None):
        self._conn.executed.append((sql, params))
        key = " ".join(sql.split())  # normalize whitespace
        if key.startswith("SELECT data FROM layouts"):
            name = params[0]
            self._result = self._conn.rows.get(name)
        elif key.startswith("SELECT id, name"):
            self._result = self._conn.list_rows
        else:
            self._result = None

    def fetchone(self):
        return self._result

    def fetchall(self):
        return self._result or []


class FakeConnection:
    def __init__(self):
        self.executed = []
        self.commits = 0
        self.rows = {}  # name -> (data,) row tuple
        self.list_rows = []

    def cursor(self):
        return FakeCursor(self)

    def commit(self):
        self.commits += 1


def load_default():
    return json.loads((APP_DIR / "data" / "default_layout.json").read_text(encoding="utf-8"))


def test_init_db_runs_schema_and_commits():
    conn = FakeConnection()
    LayoutRepository(conn).init_db()
    assert "CREATE TABLE" in conn.executed[0][0]
    assert conn.commits == 1


def test_save_validates_serializes_and_upserts():
    conn = FakeConnection()
    repo = LayoutRepository(conn)
    layout = load_default()
    repo.save("OUTLET WAREHOUSE", layout)

    sql, params = conn.executed[-1]
    assert "INSERT INTO layouts" in sql
    assert "ON CONFLICT (name)" in sql
    name, version, payload = params
    assert name == "OUTLET WAREHOUSE"
    assert version == layout["editor"]["schemaVersion"]
    assert json.loads(payload) == layout  # JSON round-trips
    assert conn.commits == 1


def test_save_rejects_invalid_layout():
    conn = FakeConnection()
    repo = LayoutRepository(conn)
    bad = load_default()
    bad["racks"][0]["type"] = "NOPE"
    with pytest.raises(ValueError):
        repo.save("bad", bad)
    assert conn.executed == []  # never touched the DB


def test_get_parses_dict_and_string_jsonb():
    conn = FakeConnection()
    layout = load_default()
    conn.rows["as_dict"] = (layout,)
    conn.rows["as_str"] = (json.dumps(layout),)
    repo = LayoutRepository(conn)
    assert repo.get("as_dict") == layout
    assert repo.get("as_str") == layout
    assert repo.get("missing") is None


def test_seed_default_uses_building_name():
    conn = FakeConnection()
    repo = LayoutRepository(conn)
    name = seed_default(repo)
    assert name == load_default()["meta"]["name"]
    assert any("INSERT INTO layouts" in sql for sql, _ in conn.executed)


def test_schema_sql_is_idempotent_ish():
    sql = read_schema_sql()
    assert "CREATE TABLE IF NOT EXISTS layouts" in sql
