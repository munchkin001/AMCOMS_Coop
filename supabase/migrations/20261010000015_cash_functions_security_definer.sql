-- Both functions already verify the caller is a bookkeeper. Running them as the
-- owner lets them post journal lines, which row-level security only allows
-- for draft entries when the caller inserts directly.
ALTER FUNCTION public.save_cash_disbursement(JSONB, JSONB) SECURITY DEFINER;
ALTER FUNCTION public.save_cash_receipt(JSONB, JSONB) SECURITY DEFINER;
