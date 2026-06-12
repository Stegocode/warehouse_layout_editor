"""Configuration read from the environment.

The database connection string is never hardcoded; it comes from DATABASE_URL,
e.g. ``postgresql://user:password@localhost:5432/warehouse``.
"""

from __future__ import annotations

import os

DATABASE_URL_ENV = "DATABASE_URL"


def database_url() -> str:
    url = os.environ.get(DATABASE_URL_ENV)
    if not url:
        raise RuntimeError(
            f"{DATABASE_URL_ENV} is not set. Example:\n"
            f'  export {DATABASE_URL_ENV}="postgresql://user:password@localhost:5432/warehouse"'
        )
    return url
