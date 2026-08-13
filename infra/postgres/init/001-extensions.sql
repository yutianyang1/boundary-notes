DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;

  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pgroonga') THEN
    CREATE EXTENSION IF NOT EXISTS pgroonga;
  ELSE
    RAISE WARNING 'PGroonga is unavailable in this development image; full-text search is disabled';
  END IF;
END
$$;
