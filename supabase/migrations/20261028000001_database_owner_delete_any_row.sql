CREATE OR REPLACE FUNCTION public.database_owner_delete_row(
  p_table REGCLASS,
  p_primary_key JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $$
DECLARE
  v_database_owner OID;
  v_schema_name TEXT;
  v_table_name TEXT;
  v_table_kind "char";
  v_table_sql TEXT;
  v_primary_key_columns TEXT[];
  v_predicate TEXT;
  v_old_row JSONB;
  v_deleted_count BIGINT;
BEGIN
  SELECT datdba INTO v_database_owner
  FROM pg_database
  WHERE datname = current_database();

  IF NOT (
    pg_has_role(session_user, v_database_owner, 'MEMBER')
    OR COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = session_user), false)
  ) THEN
    RAISE EXCEPTION 'Only the database owner can use this maintenance function';
  END IF;

  SELECT n.nspname, c.relname, c.relkind
  INTO v_schema_name, v_table_name, v_table_kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.oid = p_table;

  IF NOT FOUND OR v_schema_name <> 'public' OR v_table_kind NOT IN ('r', 'p') THEN
    RAISE EXCEPTION 'The target must be a table in the public schema';
  END IF;

  SELECT array_agg(a.attname ORDER BY key_column.ordinality)
  INTO v_primary_key_columns
  FROM pg_index i
  CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS key_column(attnum, ordinality)
  JOIN pg_attribute a
    ON a.attrelid = i.indrelid
   AND a.attnum = key_column.attnum
   AND NOT a.attisdropped
  WHERE i.indrelid = p_table
    AND i.indisprimary;

  IF COALESCE(cardinality(v_primary_key_columns), 0) = 0 THEN
    RAISE EXCEPTION 'The target table must have a primary key';
  END IF;
  IF p_primary_key IS NULL OR jsonb_typeof(p_primary_key) <> 'object'
     OR NOT (p_primary_key ?& v_primary_key_columns) THEN
    RAISE EXCEPTION 'Provide every primary-key column and value as a JSON object';
  END IF;

  v_table_sql := format('%I.%I', v_schema_name, v_table_name);
  SELECT string_agg(
    format(
      'target.%I IS NOT DISTINCT FROM (jsonb_populate_record(NULL::%s, $1)).%I',
      column_name,
      v_table_sql,
      column_name
    ),
    ' AND '
    ORDER BY ordinal
  )
  INTO v_predicate
  FROM unnest(v_primary_key_columns) WITH ORDINALITY AS pk(column_name, ordinal);

  EXECUTE format(
    'SELECT to_jsonb(target) FROM %s AS target WHERE %s FOR UPDATE',
    v_table_sql,
    v_predicate
  )
  INTO v_old_row
  USING p_primary_key;

  IF v_old_row IS NULL THEN
    RAISE EXCEPTION 'No row matched the supplied primary key';
  END IF;

  INSERT INTO public.audit_logs (action, table_name, old_data)
  VALUES (
    'Database owner hard delete',
    format('%I.%I', v_schema_name, v_table_name),
    v_old_row
  );

  EXECUTE format(
    'DELETE FROM %s AS target WHERE %s',
    v_table_sql,
    v_predicate
  )
  USING p_primary_key;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  IF v_deleted_count <> 1 THEN
    RAISE EXCEPTION 'Expected to delete one row, but deleted %', v_deleted_count;
  END IF;

  RETURN v_old_row;
END;
$$;

REVOKE ALL ON FUNCTION public.database_owner_delete_row(REGCLASS, JSONB) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_database_owner NAME;
BEGIN
  SELECT pg_get_userbyid(datdba)::NAME INTO v_database_owner
  FROM pg_database
  WHERE datname = current_database();

  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION public.database_owner_delete_row(REGCLASS, JSONB) TO %I',
    v_database_owner
  );
END;
$$;
