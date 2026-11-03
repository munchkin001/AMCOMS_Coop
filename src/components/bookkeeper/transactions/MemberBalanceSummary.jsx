import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

const formatBalance = (amount) => `₱${Number(amount || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

const MemberBalanceSummary = ({
  memberId,
  accounts: suppliedAccounts,
  loans: suppliedLoans,
  isLoading = false,
  className = ''
}) => {
  const hasSuppliedData = Array.isArray(suppliedAccounts) && Array.isArray(suppliedLoans);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!memberId || hasSuppliedData) return undefined;

    let active = true;
    const loadBalances = async () => {
      setLoading(true);
      setError('');
      try {
        const [accountResult, loanResult] = await Promise.all([
          supabase.from('savings_accounts')
            .select('account_type, balance')
            .eq('member_id', memberId)
            .eq('status', 'active'),
          supabase.from('loans')
            .select('balance')
            .eq('member_id', memberId)
            .eq('status', 'active')
            .gt('balance', 0)
        ]);
        if (accountResult.error) throw accountResult.error;
        if (loanResult.error) throw loanResult.error;
        if (!active) return;
        setSnapshot({
          memberId,
          accounts: accountResult.data || [],
          loans: loanResult.data || []
        });
      } catch (loadError) {
        if (!active) return;
        console.error('Unable to load selected member balances:', loadError);
        setSnapshot(null);
        setError('Member balances could not be loaded. Refresh or reconnect to verify the current amounts.');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadBalances();
    return () => { active = false; };
  }, [hasSuppliedData, memberId]);

  if (!memberId) return null;

  const memberSnapshot = snapshot?.memberId === memberId ? snapshot : null;
  const accounts = hasSuppliedData ? suppliedAccounts : memberSnapshot?.accounts || [];
  const loans = hasSuppliedData ? suppliedLoans : memberSnapshot?.loans || [];
  const regularSavings = accounts
    .filter((account) => account.account_type === 'regular')
    .reduce((total, account) => total + Number(account.balance || 0), 0);
  const timeDeposits = accounts
    .filter((account) => account.account_type === 'time_deposit')
    .reduce((total, account) => total + Number(account.balance || 0), 0);
  const loanBalance = loans.reduce((total, loan) => total + Number(loan.balance || 0), 0);

  return (
    <div role={error ? 'status' : undefined} className={`rounded-lg border border-blue-100 bg-blue-50/70 px-4 py-3 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-900">Selected member balances</p>
      {error ? (
        <p className="mt-1 text-sm text-amber-800">{error}</p>
      ) : loading || isLoading || (!hasSuppliedData && !memberSnapshot) ? (
        <p className="mt-1 text-sm text-blue-800">Loading current balances…</p>
      ) : (
        <dl className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-blue-800">Savings</dt>
            <dd className="font-semibold tabular-nums text-blue-950">{formatBalance(regularSavings)}</dd>
          </div>
          <div>
            <dt className="text-xs text-blue-800">Time deposits</dt>
            <dd className="font-semibold tabular-nums text-blue-950">{formatBalance(timeDeposits)}</dd>
          </div>
          <div>
            <dt className="text-xs text-blue-800">Active loan balance</dt>
            <dd className="font-semibold tabular-nums text-blue-950">{formatBalance(loanBalance)}</dd>
          </div>
        </dl>
      )}
    </div>
  );
};

export default MemberBalanceSummary;
