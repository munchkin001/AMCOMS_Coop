BEGIN;

CREATE TABLE IF NOT EXISTS public.offline_sync_operations (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_id UUID NOT NULL,
  operation_type TEXT NOT NULL CHECK (
    operation_type IN ('inventory_movement', 'member_contact_update')
  ),
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, operation_id)
);

ALTER TABLE public.offline_sync_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.offline_sync_operations FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_offline_operation(
  p_operation_id UUID,
  p_operation_type TEXT,
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  authenticated_user_id UUID := auth.uid();
  inserted_rows INTEGER;
  existing_type TEXT;
  existing_response JSONB;
  operation_response JSONB;
  movement_id UUID;
BEGIN
  IF authenticated_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to synchronize changes';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'A valid operation ID is required';
  END IF;
  IF p_operation_type IS NULL
     OR p_operation_type NOT IN ('inventory_movement', 'member_contact_update') THEN
    RAISE EXCEPTION 'Unsupported offline operation type';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'A valid operation payload is required';
  END IF;

  INSERT INTO public.offline_sync_operations (user_id, operation_id, operation_type)
  VALUES (authenticated_user_id, p_operation_id, p_operation_type)
  ON CONFLICT (user_id, operation_id) DO NOTHING;
  GET DIAGNOSTICS inserted_rows = ROW_COUNT;

  IF inserted_rows = 0 THEN
    SELECT operation_type, response
      INTO existing_type, existing_response
    FROM public.offline_sync_operations
    WHERE user_id = authenticated_user_id
      AND operation_id = p_operation_id;

    IF existing_type <> p_operation_type THEN
      RAISE EXCEPTION 'Operation ID was already used for a different operation';
    END IF;
    IF existing_response IS NULL THEN
      RAISE EXCEPTION 'The previous operation is still being processed';
    END IF;

    RETURN existing_response || jsonb_build_object('replayed', true);
  END IF;

  IF p_operation_type = 'inventory_movement' THEN
    IF jsonb_typeof(p_payload -> 'productId') IS DISTINCT FROM 'string'
       OR jsonb_typeof(p_payload -> 'movementType') IS DISTINCT FROM 'string'
       OR (
         jsonb_typeof(p_payload -> 'quantity') IS DISTINCT FROM 'number'
         AND jsonb_typeof(p_payload -> 'quantity') IS DISTINCT FROM 'string'
       )
       OR (
         jsonb_typeof(p_payload -> 'direction') IS DISTINCT FROM 'number'
         AND jsonb_typeof(p_payload -> 'direction') IS DISTINCT FROM 'string'
       )
       OR jsonb_typeof(p_payload -> 'date') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Inventory movement details are incomplete';
    END IF;

    movement_id := public.record_inventory_movement(
      (p_payload ->> 'productId')::UUID,
      p_payload ->> 'movementType',
      (p_payload ->> 'quantity')::INTEGER,
      (p_payload ->> 'direction')::INTEGER,
      (p_payload ->> 'date')::DATE,
      p_payload ->> 'reference',
      p_payload ->> 'description',
      NULLIF(p_payload ->> 'unitCost', '')::NUMERIC
    );
    operation_response := jsonb_build_object(
      'accepted', true,
      'stored', true,
      'operationId', p_operation_id,
      'replayed', false,
      'result', jsonb_build_object('movementId', movement_id)
    );
  ELSE
    PERFORM public.update_own_profile(p_payload);
    operation_response := jsonb_build_object(
      'accepted', true,
      'stored', true,
      'operationId', p_operation_id,
      'replayed', false,
      'result', jsonb_build_object('profileUpdated', true)
    );
  END IF;

  UPDATE public.offline_sync_operations
  SET response = operation_response
  WHERE user_id = authenticated_user_id
    AND operation_id = p_operation_id;

  RETURN operation_response;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_offline_operation(UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_offline_operation(UUID, TEXT, JSONB) TO authenticated;
COMMENT ON FUNCTION public.sync_offline_operation(UUID, TEXT, JSONB) IS
  'Applies a supported offline operation once per authenticated user and operation ID.';

COMMIT;
