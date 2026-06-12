#!/usr/bin/env python3
"""Initialize the database schema and seed the default layout.

Usage:
    export DATABASE_URL="postgresql://user:password@localhost:5432/warehouse"
    python -m server.seed

This connects using DATABASE_URL, creates the layouts table if needed, and
stores app/data/default_layout.json under its building name.
"""

from __future__ import annotations

from server.persistence import LayoutRepository, connect, seed_default


def main() -> int:
    with connect() as conn:
        repo = LayoutRepository(conn)
        repo.init_db()
        name = seed_default(repo)
    print(f'Schema ready. Seeded layout "{name}".')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
