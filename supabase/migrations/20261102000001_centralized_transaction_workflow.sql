-- REVIEW ONLY: centralized transaction lifecycle and role-scoped evidence.
-- Do not apply until the workflow RPC migration and deployment plan are reviewed.

BEGIN;

CREATE TABLE public.transaction_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'loan_application', 'loan_disbursement', 'loan_payment', 'savings_deposit',
    'savings_withdrawal', 'time_deposit', 'time_deposit_renewal',
    'time_deposit_withdrawal', 'sale', 'sales_return', 'purchase',
    'purchase_payment', 'operating_expense', 'capital_contribution',
    'approved_dividend', 'other_receipt', 'other_disbursement', 'bank_transfer'
  )),
  direction TEXT NOT NULL CHECK (direction IN ('cash_in', 'cash_out', 'noncash')),
  source_module TEXT NOT NULL,
  source_record_id UUID,
  member_id UUID REFERENCES public.members(id),
  counterparty_name TEXT,
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  payment_method TEXT CHECK (
    payment_method IS NULL OR payment_method IN ('cash', 'check', 'bank_transfer', 'gcash', 'paymaya', 'other')
  ),
  description TEXT NOT NULL CHECK (length(trim(description)) > 0),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  approved_payload JSONB,
  status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN (
    'pending_approval', 'returned_for_correction', 'approved', 'processing',
    'awaiting_release', 'on_hold', 'release_issue', 'released', 'completed',
    'rejected', 'accounting_error'
  )),
  cash_release_required BOOLEAN NOT NULL DEFAULT false,
  cash_release_status TEXT NOT NULL DEFAULT 'not_required' CHECK (cash_release_status IN (
    'not_required', 'awaiting_release', 'on_hold', 'release_issue', 'released'
  )),
  accounting_status TEXT NOT NULL DEFAULT 'not_processed' CHECK (accounting_status IN (
    'not_processed', 'processing', 'posted', 'error'
  )),
  manager_id UUID REFERENCES public.staff(id),
  manager_decision_at TIMESTAMPTZ,
  manager_remarks TEXT,
  bookkeeper_id UUID REFERENCES public.staff(id),
  processed_at TIMESTAMPTZ,
  journal_entry_id UUID REFERENCES public.journal_entries(id),
  business_record_table TEXT,
  business_record_id UUID,
  treasurer_id UUID REFERENCES public.staff(id),
  released_at TIMESTAMPTZ,
  release_remarks TEXT,
  created_by UUID NOT NULL REFERENCES public.staff(id),
  created_by_auth_id UUID NOT NULL REFERENCES auth.users(id),
  submission_key UUID NOT NULL,
  submission_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (created_by_auth_id, submission_key),
  CHECK (NOT cash_release_required OR direction = 'cash_out'),
  CHECK (status NOT IN ('released', 'completed') OR NOT cash_release_required OR cash_release_status = 'released')
);

CREATE UNIQUE INDEX transaction_workflows_source_record_uq
  ON public.transaction_workflows (source_module, source_record_id)
  WHERE source_record_id IS NOT NULL;
CREATE INDEX transaction_workflows_status_created_idx
  ON public.transaction_workflows (status, created_at DESC);
CREATE INDEX transaction_workflows_type_created_idx
  ON public.transaction_workflows (transaction_type, created_at DESC);
CREATE INDEX transaction_workflows_member_created_idx
  ON public.transaction_workflows (member_id, created_at DESC);
CREATE INDEX transaction_workflows_release_idx
  ON public.transaction_workflows (cash_release_status, created_at DESC)
  WHERE cash_release_required;

CREATE TABLE public.transaction_workflow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.transaction_workflows(id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'submitted', 'approved', 'rejected', 'returned_for_correction', 'resubmitted',
    'processing_started', 'processed', 'processing_failed', 'release_confirmed',
    'release_on_hold', 'release_issue_reported', 'cash_received_verified',
    'document_attached'
  )),
  previous_status TEXT,
  next_status TEXT,
  actor_auth_id UUID NOT NULL REFERENCES auth.users(id),
  actor_staff_id UUID REFERENCES public.staff(id),
  remarks TEXT,
  snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX transaction_workflow_events_workflow_created_idx
  ON public.transaction_workflow_events (workflow_id, created_at);
CREATE UNIQUE INDEX transaction_workflow_cash_received_once_idx
  ON public.transaction_workflow_events (workflow_id)
  WHERE event_type = 'cash_received_verified';

CREATE TABLE public.transaction_workflow_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.transaction_workflows(id),
  document_type TEXT NOT NULL CHECK (document_type IN (
    'approval', 'payment_receipt', 'cash_release_acknowledgment',
    'supplier_invoice', 'purchase_document', 'loan_document', 'other_evidence'
  )),
  bucket_id TEXT NOT NULL DEFAULT 'transaction-evidence'
    CHECK (bucket_id = 'transaction-evidence'),
  object_name TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  file_size BIGINT NOT NULL CHECK (file_size > 0 AND file_size <= 10485760),
  uploaded_by_auth_id UUID NOT NULL REFERENCES auth.users(id),
  uploaded_by_staff_id UUID REFERENCES public.staff(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX transaction_workflow_documents_workflow_idx
  ON public.transaction_workflow_documents (workflow_id, uploaded_at);

ALTER TABLE public.transaction_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_workflow_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_workflow_documents ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_view_transaction_workflow(p_workflow_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.transaction_workflows workflow
    WHERE workflow.id = p_workflow_id
      AND (
        public.has_role('manager')
        OR workflow.created_by_auth_id = auth.uid()
        OR (
          public.has_role('bookkeeper')
          AND (
            workflow.created_by_auth_id = auth.uid()
            OR workflow.status IN (
              'approved', 'processing', 'awaiting_release', 'on_hold',
              'release_issue', 'released', 'completed', 'accounting_error'
            )
          )
        )
        OR (
          public.has_role('treasurer')
          AND (
            (workflow.cash_release_required AND workflow.status IN (
              'awaiting_release', 'on_hold', 'release_issue', 'released', 'completed'
            ))
            OR (workflow.direction = 'cash_in' AND workflow.status = 'completed')
          )
        )
        OR workflow.member_id = public.get_member_id()
      )
  );
$$;
REVOKE ALL ON FUNCTION public.can_view_transaction_workflow(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_transaction_workflow(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_upload_transaction_workflow_document(p_workflow_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.transaction_workflows workflow
    WHERE workflow.id = p_workflow_id
      AND workflow.status NOT IN ('rejected', 'completed')
      AND (
        (workflow.created_by_auth_id = auth.uid()
          AND workflow.status IN ('pending_approval', 'returned_for_correction'))
        OR (
          public.has_role('manager')
          AND workflow.status IN ('pending_approval', 'returned_for_correction', 'approved')
        )
        OR (
          public.has_role('bookkeeper')
          AND workflow.status IN ('approved', 'processing', 'awaiting_release')
        )
        OR (
          public.has_role('treasurer')
          AND workflow.cash_release_required
          AND workflow.status IN ('awaiting_release', 'on_hold', 'release_issue')
        )
        OR (
          workflow.member_id = public.get_member_id()
          AND workflow.status IN ('pending_approval', 'returned_for_correction')
        )
      )
  );
$$;
REVOKE ALL ON FUNCTION public.can_upload_transaction_workflow_document(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_upload_transaction_workflow_document(UUID) TO authenticated;

CREATE POLICY transaction_workflows_select
  ON public.transaction_workflows FOR SELECT TO authenticated
  USING (public.can_view_transaction_workflow(id));
CREATE POLICY transaction_workflow_events_select
  ON public.transaction_workflow_events FOR SELECT TO authenticated
  USING (public.can_view_transaction_workflow(workflow_id));
CREATE POLICY transaction_workflow_documents_select
  ON public.transaction_workflow_documents FOR SELECT TO authenticated
  USING (public.can_view_transaction_workflow(workflow_id));

REVOKE INSERT, UPDATE, DELETE ON public.transaction_workflows FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.transaction_workflow_events FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.transaction_workflow_documents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.transaction_workflows TO authenticated;
GRANT SELECT ON public.transaction_workflow_events TO authenticated;
GRANT SELECT ON public.transaction_workflow_documents TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_transaction_workflow_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Transaction workflow history is immutable.';
END;
$$;
CREATE TRIGGER transaction_workflow_events_immutable
  BEFORE UPDATE OR DELETE ON public.transaction_workflow_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_transaction_workflow_event_mutation();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'transaction-evidence',
  'transaction-evidence',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png'];

CREATE POLICY transaction_evidence_read
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'transaction-evidence'
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.can_view_transaction_workflow(((storage.foldername(name))[1])::UUID)
      ELSE false
    END
  );
CREATE POLICY transaction_evidence_upload
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'transaction-evidence'
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.can_upload_transaction_workflow_document(((storage.foldername(name))[1])::UUID)
      ELSE false
    END
  );

COMMIT;
