\set ON_ERROR_STOP on

-- The versioned Drizzle migrations own extensions, schemas, tables, and data.
-- This entrypoint only removes the unsafe default CREATE grant.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
