-- The read-only login bigname's phase-runner uses for verification and the API
-- uses for requests. Mirrors tests/e2e/src/harness/db.rs in the bigname repo.
-- Runs after `phase-runner init-schema`, so the grants cover every table.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bigname_verify') THEN
    CREATE ROLE bigname_verify LOGIN PASSWORD 'bigname_verify'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON DATABASE bigname FROM PUBLIC;
GRANT CONNECT ON DATABASE bigname TO bigname_verify;
GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO bigname_verify;
GRANT USAGE ON SCHEMA bigname_phase TO bigname_verify;
GRANT SELECT ON ALL TABLES IN SCHEMA bigname_phase TO bigname_verify;
GRANT EXECUTE ON FUNCTION bigname_phase.revalidate_resolution_lookup_state_read_only(
  text, bigint, text, jsonb, jsonb, uuid, text, text
) TO bigname_verify;
