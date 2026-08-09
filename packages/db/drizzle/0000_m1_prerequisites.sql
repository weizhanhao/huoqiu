CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_catalog.pg_extension
		WHERE extname = 'pg_trgm'
	) THEN
		RAISE EXCEPTION 'M1_CAPABILITY_REQUIRED: pg_trgm';
	END IF;
END
$$;
