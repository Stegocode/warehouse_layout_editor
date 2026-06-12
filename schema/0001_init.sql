-- 0001_init.sql — initial schema for the Warehouse Layout Editor.
--
-- A layout is stored whole, as JSONB, under a unique name. The schema_version
-- column is denormalized from the JSON document so you can query/filter by it
-- and spot rows that need migrating after a format bump.
--
-- Apply with:  psql "$DATABASE_URL" -f schema/0001_init.sql
-- (idempotent — safe to run more than once).

CREATE TABLE IF NOT EXISTS layouts (
    id             SERIAL PRIMARY KEY,
    name           TEXT        NOT NULL UNIQUE,
    schema_version INTEGER     NOT NULL,
    data           JSONB       NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_layouts_name ON layouts (name);
CREATE INDEX IF NOT EXISTS idx_layouts_schema_version ON layouts (schema_version);
