-- Metadata-only catalog capture. This query never reads business column values.
SELECT jsonb_pretty(jsonb_build_object(
  'database', current_database(),
  'serverVersion', current_setting('server_version'),
  'tables', (
    SELECT jsonb_agg(jsonb_build_object(
      'table', c.table_name,
      'columns', c.columns
    ) ORDER BY c.table_name)
    FROM (
      SELECT table_name,
             jsonb_agg(jsonb_build_object(
               'name', column_name,
               'type', data_type,
               'nullable', is_nullable,
               'default', column_default
             ) ORDER BY ordinal_position) AS columns
      FROM information_schema.columns
      WHERE table_schema = 'public'
      GROUP BY table_name
    ) c
  ),
  'constraints', (
    SELECT jsonb_agg(jsonb_build_object(
      'name', conname,
      'type', contype,
      'table', conrelid::regclass::text,
      'definition', pg_get_constraintdef(oid)
    ) ORDER BY conrelid::regclass::text, conname)
    FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace
  ),
  'indexes', (
    SELECT jsonb_agg(jsonb_build_object(
      'table', tablename,
      'name', indexname,
      'definition', indexdef
    ) ORDER BY tablename, indexname)
    FROM pg_indexes
    WHERE schemaname = 'public'
  )
));
