BEGIN;

ALTER TABLE public.transaction_workflow_documents
  ADD COLUMN IF NOT EXISTS removal_requested_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS removal_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS removed_by_auth_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.reserve_transaction_workflow_document_removal(
  p_document_id UUID
) RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_auth_id UUID := auth.uid();
  v_workflow_id UUID;
  v_document_type TEXT;
  v_object_name TEXT;
  v_status TEXT;
  v_cash_release_required BOOLEAN;
  v_removed_at TIMESTAMPTZ;
  v_requested_by UUID;
  v_requested_at TIMESTAMPTZ;
  v_remaining_count BIGINT;
BEGIN
  IF v_auth_id IS NULL OR public.current_staff_id() IS NULL OR NOT public.has_role('treasurer') THEN
    RAISE EXCEPTION 'Only an active Treasurer can remove duplicate release proof';
  END IF;

  SELECT workflow.id, workflow.status, workflow.cash_release_required,
         document.document_type, document.object_name, document.removed_at,
         document.removal_requested_by, document.removal_requested_at
  INTO v_workflow_id, v_status, v_cash_release_required,
       v_document_type, v_object_name, v_removed_at,
       v_requested_by, v_requested_at
  FROM public.transaction_workflows workflow
  JOIN public.transaction_workflow_documents document
    ON document.workflow_id = workflow.id
  WHERE document.id = p_document_id
  FOR UPDATE OF workflow, document;

  IF NOT FOUND
     OR NOT v_cash_release_required
     OR v_status NOT IN ('awaiting_release', 'on_hold', 'release_issue')
     OR v_document_type <> 'cash_release_acknowledgment'
     OR v_removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This attachment is not eligible for removal';
  END IF;

  IF v_requested_by IS NOT NULL
     AND v_requested_by <> v_auth_id
     AND v_requested_at > now() - INTERVAL '10 minutes' THEN
    RAISE EXCEPTION 'Another removal is already in progress for this attachment';
  END IF;

  SELECT count(*)
  INTO v_remaining_count
  FROM public.transaction_workflow_documents document
  WHERE document.workflow_id = v_workflow_id
    AND document.document_type = 'cash_release_acknowledgment'
    AND document.removed_at IS NULL
    AND document.id <> p_document_id;

  IF v_remaining_count < 1 THEN
    RAISE EXCEPTION 'At least one release proof must remain attached';
  END IF;

  UPDATE public.transaction_workflow_documents
  SET removal_requested_by = v_auth_id,
      removal_requested_at = now()
  WHERE id = p_document_id;

  RETURN v_object_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_transaction_workflow_document_removal(
  p_document_id UUID
) RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, auth, storage, pg_temp
AS $$
DECLARE
  v_auth_id UUID := auth.uid();
  v_workflow_id UUID;
  v_object_name TEXT;
BEGIN
  IF v_auth_id IS NULL OR public.current_staff_id() IS NULL OR NOT public.has_role('treasurer') THEN
    RAISE EXCEPTION 'Only an active Treasurer can finalize duplicate proof removal';
  END IF;

  SELECT workflow.id, document.object_name
  INTO v_workflow_id, v_object_name
  FROM public.transaction_workflows workflow
  JOIN public.transaction_workflow_documents document
    ON document.workflow_id = workflow.id
  WHERE document.id = p_document_id
    AND document.removed_at IS NULL
    AND document.removal_requested_by = v_auth_id
    AND document.removal_requested_at > now() - INTERVAL '10 minutes'
    AND document.document_type = 'cash_release_acknowledgment'
    AND workflow.cash_release_required
    AND workflow.status IN ('awaiting_release', 'on_hold', 'release_issue')
  FOR UPDATE OF workflow, document;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The proof removal request expired or is no longer valid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM storage.objects stored_object
    WHERE stored_object.bucket_id = 'transaction-evidence'
      AND stored_object.name = v_object_name
  ) THEN
    RAISE EXCEPTION 'The proof file is still in storage and was not removed';
  END IF;

  UPDATE public.transaction_workflow_documents
  SET removed_by_auth_id = v_auth_id,
      removed_at = now(),
      removal_requested_by = NULL,
      removal_requested_at = NULL
  WHERE id = p_document_id;

  RETURN v_workflow_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_transaction_workflow_document_removal(
  p_document_id UUID
) RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR public.current_staff_id() IS NULL
     OR NOT public.has_role('treasurer') THEN
    RAISE EXCEPTION 'Only an active Treasurer can cancel duplicate proof removal';
  END IF;

  UPDATE public.transaction_workflow_documents
  SET removal_requested_by = NULL,
      removal_requested_at = NULL
  WHERE id = p_document_id
    AND removal_requested_by = auth.uid()
    AND removed_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_transaction_workflow_document_removal(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_transaction_workflow_document_removal(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_transaction_workflow_document_removal(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_transaction_workflow_document_removal(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_transaction_workflow_document_removal(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_transaction_workflow_document_removal(UUID) TO authenticated;

DROP POLICY IF EXISTS transaction_evidence_remove_duplicate_release_proof ON storage.objects;
CREATE POLICY transaction_evidence_remove_duplicate_release_proof
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'transaction-evidence'
    AND public.has_role('treasurer')
    AND EXISTS (
      SELECT 1
      FROM public.transaction_workflow_documents document
      JOIN public.transaction_workflows workflow
        ON workflow.id = document.workflow_id
      WHERE document.object_name = storage.objects.name
        AND document.document_type = 'cash_release_acknowledgment'
        AND document.removed_at IS NULL
        AND document.removal_requested_by = auth.uid()
        AND document.removal_requested_at > now() - INTERVAL '10 minutes'
        AND workflow.cash_release_required
        AND workflow.status IN ('awaiting_release', 'on_hold', 'release_issue')
    )
  );

COMMIT;
