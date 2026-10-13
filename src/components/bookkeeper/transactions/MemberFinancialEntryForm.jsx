import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';

const entryTypes = [
  { value: 'savings_deposit', label: 'Savings deposit', receipt: true, account: 'regular' },
  { value: 'savings_withdrawal', label: 'Savings withdrawal', receipt: false, account: 'regular' },
  { value: 'time_deposit', label: 'Time deposit placement', receipt: true, account: 'time_deposit' },
  { value: 'time_deposit_withdrawal', label: 'Time deposit withdrawal', receipt: false, account: 'time_deposit' },
  { value: 'loan_payment', label: 'Loan payment', receipt: true },
  { value: 'capital_contribution', label: 'Monthly capital share', receipt: true },
  { value: 'dividend_distribution', label: 'Approved dividend distribution', receipt: false, dividend: true }
];

const currentDate = () => new Date().toISOString().slice(0, 10);

const MemberFinancialEntryForm = ({
  onSave,
  onCancel,
  initialEntryType = 'savings_deposit',
  allowedEntryTypes = null,
  title = 'Member Financial Entry'
}) => {
  const visibleEntryTypes = allowedEntryTypes
    ? entryTypes.filter((type) => allowedEntryTypes.includes(type.value))
    : entryTypes;
  const [members, setMembers] = useState([]);
  const [memberId, setMemberId] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [loans, setLoans] = useState([]);
  const [unpaidMonths, setUnpaidMonths] = useState([]);
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [entryType, setEntryType] = useState(initialEntryType);
  const [date, setDate] = useState(currentDate());
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [cashAccount, setCashAccount] = useState('Cash on Hand');
  const [accountId, setAccountId] = useState('');
  const [loanId, setLoanId] = useState('');
  const [maturityDate, setMaturityDate] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [particulars, setParticulars] = useState('');
  const [dividendValues, setDividendValues] = useState({
    dividend_amount: '',
    patronage_amount: '',
    mortuary_deduction: '',
    retention_amount: '',
    savings_amount: '',
    loan_payment_amount: ''
  });
  const [loadingMemberData, setLoadingMemberData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedMember = members.find((member) => member.id === memberId);
  const selectedEntry = entryTypes.find((type) => type.value === entryType);
  const matchingAccounts = useMemo(
    () => accounts.filter((account) => account.account_type === selectedEntry?.account),
    [accounts, selectedEntry]
  );
  const selectedLoan = loans.find((loan) => loan.id === loanId);
  const capitalAmount = selectedMonths.length * 100;
  const dividendTotal = Number(dividendValues.dividend_amount || 0) + Number(dividendValues.patronage_amount || 0);
  const dividendAvailable = dividendTotal - Number(dividendValues.mortuary_deduction || 0);
  const dividendAllocated = Number(dividendValues.retention_amount || 0)
    + Number(dividendValues.savings_amount || 0)
    + Number(dividendValues.loan_payment_amount || 0);
  const dividendBalanced = dividendTotal > 0
    && dividendAvailable >= 0
    && Number(dividendAvailable.toFixed(2)) === Number(dividendAllocated.toFixed(2));

  useEffect(() => {
    let active = true;
    supabase
      .from('members')
      .select('id, member_number, first_name, middle_name, last_name, date_joined')
      .eq('membership_status', 'active')
      .is('archived_at', null)
      .order('last_name')
      .then(({ data, error: queryError }) => {
        if (!active) return;
        if (queryError) setError(`Unable to load members: ${queryError.message}`);
        else setMembers(data || []);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!memberId) return undefined;

    let active = true;
    const loadMemberRecords = async () => {
      setLoadingMemberData(true);
      setError('');
      try {
        const [accountResult, loanResult, contributionResult] = await Promise.all([
          supabase.from('savings_accounts')
            .select('id, account_number, account_type, balance, maturity_date, interest_rate')
            .eq('member_id', memberId)
            .eq('status', 'active')
            .order('created_at'),
          supabase.from('loans')
            .select('id, loan_number, balance, release_date, created_at')
            .eq('member_id', memberId)
            .eq('status', 'active')
            .gt('balance', 0)
            .order('release_date', { ascending: true, nullsFirst: false })
            .order('created_at'),
          supabase.from('member_capital_contributions')
            .select('due_month')
            .eq('member_id', memberId)
        ]);
        if (accountResult.error) throw accountResult.error;
        if (loanResult.error) throw loanResult.error;
        if (contributionResult.error) throw contributionResult.error;
        if (!active) return;

        const member = members.find((item) => item.id === memberId);
        const paidMonths = new Set((contributionResult.data || []).map((row) => row.due_month.slice(0, 7)));
        const first = member?.date_joined ? new Date(`${member.date_joined}T00:00:00`) : null;
        const last = new Date();
        const months = [];
        if (first) {
          const cursor = new Date(first.getFullYear(), first.getMonth(), 1);
          const end = new Date(last.getFullYear(), last.getMonth(), 1);
          while (cursor <= end) {
            const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
            if (!paidMonths.has(key)) months.push(`${key}-01`);
            cursor.setMonth(cursor.getMonth() + 1);
          }
        }
        setAccounts(accountResult.data || []);
        setLoans(loanResult.data || []);
        setUnpaidMonths(months);
        setSelectedMonths([]);
        setAccountId('');
        setLoanId(loanResult.data?.[0]?.id || '');
      } catch (loadError) {
        if (active) setError(`Unable to load this member’s financial records: ${loadError.message}`);
      } finally {
        if (active) setLoadingMemberData(false);
      }
    };
    loadMemberRecords();
    return () => { active = false; };
  }, [memberId, members]);

  const handleMonthToggle = (month) => {
    setSelectedMonths((current) => {
      const next = current.includes(month)
        ? current.filter((item) => item !== month)
        : [...current, month].sort();
      setAmount(String(next.length * 100 || ''));
      return next;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    const numericAmount = Number(amount);
    if (!selectedMember || !date || !reference.trim() || (!selectedEntry?.dividend && !particulars.trim())) {
      setError('Select a member and enter a date and reference number.');
      return;
    }
    if (!selectedEntry?.dividend && (!Number.isFinite(numericAmount) || numericAmount <= 0)) {
      setError('Enter an amount greater than zero.');
      return;
    }
    if (entryType === 'capital_contribution' && selectedMonths.length === 0) {
      setError('Select at least one unpaid monthly capital contribution.');
      return;
    }
    if (entryType === 'dividend_distribution' && !dividendBalanced) {
      setError('Dividend plus patronage, less mortuary, must equal retention plus savings plus loan payment.');
      return;
    }
    if (entryType === 'dividend_distribution' && Number(dividendValues.loan_payment_amount) > 0 && !loanId) {
      setError('This member has no active loan to receive the dividend loan allocation.');
      return;
    }
    if (entryType.includes('withdrawal') && !accountId) {
      setError('Select the member account to withdraw from.');
      return;
    }
    if (entryType === 'loan_payment' && !loanId) {
      setError('This member has no active loan to receive a payment.');
      return;
    }
    if (entryType === 'time_deposit' && (
      !maturityDate || maturityDate <= date || !Number.isFinite(Number(interestRate)) || Number(interestRate) < 0
    )) {
      setError('Enter a maturity date after the placement date and a valid non-negative annual interest rate.');
      return;
    }

    const common = {
      member_id: memberId,
      amount: numericAmount,
      description: particulars.trim()
    };
    const pReceipt = selectedEntry.receipt ? {
      ...common,
      receipt_date: date,
      receipt_number: reference.trim(),
      received_from: [selectedMember.first_name, selectedMember.middle_name, selectedMember.last_name].filter(Boolean).join(' '),
      payment_method: paymentMethod,
      status: 'recorded'
    } : null;
    const pDisbursement = selectedEntry.receipt ? null : {
      ...common,
      disbursement_date: date,
      voucher_number: reference.trim(),
      payee: [selectedMember.first_name, selectedMember.middle_name, selectedMember.last_name].filter(Boolean).join(' '),
      payment_source: cashAccount === 'Cash on Hand' ? 'cash-on-hand' : 'cash-in-bank',
      status: 'recorded'
    };

    setSaving(true);
    try {
      if (entryType === 'dividend_distribution') {
        await onSave({
          dividend: true,
          p_distribution: {
            member_id: memberId,
            distribution_date: date,
            reference_number: reference.trim(),
            ...Object.fromEntries(Object.entries(dividendValues).map(([key, value]) => [key, Number(value || 0)])),
            loan_id: Number(dividendValues.loan_payment_amount) > 0 ? loanId : null,
            savings_account_id: Number(dividendValues.savings_amount) > 0 ? accountId || null : null
          }
        });
        return;
      }
      await onSave({
        p_receipt: pReceipt,
        p_disbursement: pDisbursement,
        p_entry: {
          entry_type: entryType,
          cash_account: cashAccount,
          savings_account_id: accountId || null,
          loan_id: loanId || null,
          due_months: selectedMonths,
          maturity_date: entryType === 'time_deposit' ? maturityDate : null,
          interest_rate: entryType === 'time_deposit' ? Number(interestRate) : null
        }
      });
    } catch (saveError) {
      setError(saveError.message || 'The member entry could not be recorded.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        <p className="mt-1 text-sm text-gray-600">Post cash-book and member-ledger updates together.</p>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-700">
            Member *
            <select
              value={memberId}
              onChange={(event) => {
                setMemberId(event.target.value);
                setAccounts([]);
                setLoans([]);
                setUnpaidMonths([]);
                setSelectedMonths([]);
                setLoanId('');
                setAccountId('');
              }}
              required
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
            >
              <option value="">Select member</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {[member.first_name, member.middle_name, member.last_name].filter(Boolean).join(' ')}{member.member_number ? ` (${member.member_number})` : ''}
                </option>
              ))}
            </select>
          </label>
          {visibleEntryTypes.length > 1 && (
            <label className="text-sm font-medium text-gray-700">
              Entry type *
              <select
                value={entryType}
                onChange={(event) => {
                  const nextType = entryTypes.find((type) => type.value === event.target.value);
                  setEntryType(event.target.value);
                  setAmount(event.target.value === 'capital_contribution' ? String(capitalAmount || '') : '');
                  setParticulars(nextType?.label || '');
                  setReference('');
                  setAccountId('');
                }}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
              >
                {visibleEntryTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </label>
          )}
          <label className="text-sm font-medium text-gray-700">
            Date *
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm font-medium text-gray-700">
              {selectedEntry?.dividend ? 'Distribution reference *' : selectedEntry?.receipt ? 'Receipt number *' : 'Voucher number *'}
            <input value={reference} onChange={(event) => setReference(event.target.value)} required className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
            {entryType !== 'capital_contribution' && !selectedEntry?.dividend && (
            <label className="text-sm font-medium text-gray-700">
              Amount (₱) *
              <input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
            </label>
          )}
          {!selectedEntry?.dividend && <label className="text-sm font-medium text-gray-700">
            Particulars *
            <input value={particulars} onChange={(event) => setParticulars(event.target.value)} required className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>}
        </div>

        {selectedEntry?.dividend && (
          <div className="space-y-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
            <div>
              <h3 className="font-semibold text-indigo-950">Approved worksheet amounts</h3>
              <p className="mt-1 text-xs text-indigo-800">
                Enter the approved amounts from the dividend sheet. The system checks that dividend + patronage − mortuary equals the member’s retention, savings, and loan allocations.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['dividend_amount', 'Dividend'],
                ['patronage_amount', 'Patronage'],
                ['mortuary_deduction', 'Mortuary deduction'],
                ['retention_amount', '50% retention to capital share'],
                ['savings_amount', 'Savings'],
                ['loan_payment_amount', 'Loan payment']
              ].map(([field, label]) => (
                <label key={field} className="text-sm font-medium text-gray-700">
                  {label} (₱)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={dividendValues[field]}
                    onChange={(event) => setDividendValues((current) => ({ ...current, [field]: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
                  />
                </label>
              ))}
            </div>
            {Number(dividendValues.savings_amount) > 0 && (
              <label className="block max-w-xl text-sm font-medium text-gray-700">
                Credit savings account
                <select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
                  <option value="">Use or create the member’s regular savings account</option>
                  {accounts.filter((account) => account.account_type === 'regular').map((account) => <option key={account.id} value={account.id}>{account.account_number}</option>)}
                </select>
              </label>
            )}
            {Number(dividendValues.loan_payment_amount) > 0 && (
              <p className="text-sm text-indigo-900">
                Loan allocation applies to the oldest active loan{selectedLoan ? ` ${selectedLoan.loan_number}` : ''}.
              </p>
            )}
            <div className={`rounded-lg p-3 text-sm font-medium ${dividendBalanced ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}`}>
              Available after mortuary: ₱{dividendAvailable.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              {' · '}Allocated: ₱{dividendAllocated.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              {' · '}{dividendBalanced ? 'Balanced' : 'Amounts do not balance'}
            </div>
          </div>
        )}

        {selectedEntry?.receipt && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">
              Payment method
              <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
                <option value="cash">Cash</option>
              </select>
            </label>
            <label className="text-sm font-medium text-gray-700">
              Received into
              <select value={cashAccount} onChange={(event) => setCashAccount(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
                <option>Cash on Hand</option>
                <option>Cash in Bank</option>
              </select>
            </label>
          </div>
        )}

        {!selectedEntry?.receipt && !selectedEntry?.dividend && (
          <label className="block max-w-sm text-sm font-medium text-gray-700">
            Paid from
            <select value={cashAccount} onChange={(event) => setCashAccount(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
              <option>Cash on Hand</option>
              <option>Cash in Bank</option>
            </select>
          </label>
        )}

        {entryType.includes('withdrawal') && (
          <label className="block max-w-xl text-sm font-medium text-gray-700">
            Member account *
            <select value={accountId} onChange={(event) => setAccountId(event.target.value)} required className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
              <option value="">Select account</option>
              {matchingAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.account_number} — ₱{Number(account.balance).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </option>
              ))}
            </select>
          </label>
        )}

        {entryType === 'loan_payment' && (
          <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <label className="block text-sm font-medium text-gray-800">
              Existing loan *
              <select value={loanId} onChange={(event) => setLoanId(event.target.value)} required disabled={loadingMemberData || !loans.length} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
                <option value="">Select loan</option>
                {loans.map((loan) => <option key={loan.id} value={loan.id}>{loan.loan_number} — balance ₱{Number(loan.balance).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</option>)}
              </select>
            </label>
            <p className="text-sm text-blue-900">
              {loadingMemberData ? 'Loading the member’s active loans...' : selectedLoan
                ? `Payment applies to ${selectedLoan.loan_number}. Principal, interest, and any scheduled penalties are allocated against its oldest unpaid installments.`
                : 'This member has no active loan with an outstanding balance.'}
            </p>
          </div>
        )}

        {entryType === 'capital_contribution' && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-900">Unpaid monthly capital contributions — ₱100 each</p>
            {loadingMemberData ? <p className="mt-2 text-sm text-gray-600">Loading due months...</p> : unpaidMonths.length === 0 ? (
              <p className="mt-2 text-sm text-gray-600">There are no unpaid months through the current month.</p>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {unpaidMonths.map((month) => (
                  <label key={month} className="flex items-center gap-2 rounded border border-emerald-100 bg-white p-2 text-sm">
                    <input type="checkbox" checked={selectedMonths.includes(month)} onChange={() => handleMonthToggle(month)} />
                    {new Date(`${month}T00:00:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}
                  </label>
                ))}
              </div>
            )}
            <p className="mt-3 text-sm font-semibold text-emerald-900">
              Total: ₱{capitalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </p>
            <p className="mt-1 text-xs text-emerald-800">Only selected months are marked as paid; missed months remain due.</p>
          </div>
        )}

        {entryType === 'time_deposit' && (
          <div className="grid grid-cols-1 gap-4 rounded-lg border border-teal-200 bg-teal-50 p-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">
              Maturity date *
              <input type="date" min={date} value={maturityDate} onChange={(event) => setMaturityDate(event.target.value)} required className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Annual interest rate (%) *
              <input type="number" min="0" step="0.01" value={interestRate} onChange={(event) => setInterestRate(event.target.value)} required className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2" />
            </label>
            <p className="text-xs text-teal-900 sm:col-span-2">Each placement creates a separate time-deposit account so its maturity date and rate stay attached to the deposit.</p>
          </div>
        )}

        {entryType === 'savings_deposit' && (
          <label className="block max-w-xl text-sm font-medium text-gray-700">
            Credit to account
            <select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
              <option value="">Use or create the member’s first active account</option>
              {matchingAccounts.map((account) => <option key={account.id} value={account.id}>{account.account_number} — ₱{Number(account.balance).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</option>)}
            </select>
          </label>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-5 py-2 font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving || loadingMemberData} className="rounded-lg bg-indigo-600 px-5 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
            {saving ? 'Recording...' : 'Record member entry'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default MemberFinancialEntryForm;
