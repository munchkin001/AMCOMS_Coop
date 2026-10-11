-- Link supplier payments (cash disbursements) to purchases.
-- A disbursement whose description or voucher number mentions a purchase number
-- counts as a payment against that purchase. The purchase's payment_status is
-- recomputed whenever a disbursement is added, changed or deleted, so the
-- inventory portal shows Paid / Partial / Pending without needing access to
-- the bookkeeper's financial records.

CREATE OR REPLACE FUNCTION public.refresh_purchase_payment_status(p_text TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p RECORD;
  v_paid NUMERIC;
  v_status TEXT;
BEGIN
  IF p_text IS NULL OR p_text = '' THEN
    RETURN;
  END IF;

  FOR p IN
    SELECT id, purchase_number, net_amount, payment_status
    FROM public.purchases
    WHERE status <> 'cancelled'
      AND position(lower(purchase_number) IN lower(p_text)) > 0
  LOOP
    SELECT COALESCE(SUM(d.amount), 0) INTO v_paid
    FROM public.cash_disbursements d
    WHERE d.status = 'recorded'
      AND position(lower(p.purchase_number) IN lower(COALESCE(d.description, '') || ' ' || COALESCE(d.voucher_number, ''))) > 0;

    v_status := CASE
      WHEN v_paid > 0 AND v_paid >= p.net_amount THEN 'paid'
      WHEN v_paid > 0 THEN 'partial'
      ELSE 'pending'
    END;

    IF v_status IS DISTINCT FROM p.payment_status THEN
      UPDATE public.purchases SET payment_status = v_status, updated_at = now() WHERE id = p.id;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_purchase_payment_from_disbursement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.refresh_purchase_payment_status(COALESCE(OLD.description, '') || ' ' || COALESCE(OLD.voucher_number, ''));
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.refresh_purchase_payment_status(COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.voucher_number, ''));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_purchase_payment ON public.cash_disbursements;
CREATE TRIGGER sync_purchase_payment
  AFTER INSERT OR UPDATE OR DELETE ON public.cash_disbursements
  FOR EACH ROW EXECUTE FUNCTION public.sync_purchase_payment_from_disbursement();

-- Re-check when a purchase is created or its amount changes, in case a payment
-- referencing its number was already recorded.
CREATE OR REPLACE FUNCTION public.sync_purchase_payment_on_purchase()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_purchase_payment_status(NEW.purchase_number);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_purchase_payment_self ON public.purchases;
CREATE TRIGGER sync_purchase_payment_self
  AFTER INSERT OR UPDATE OF net_amount, status ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.sync_purchase_payment_on_purchase();
