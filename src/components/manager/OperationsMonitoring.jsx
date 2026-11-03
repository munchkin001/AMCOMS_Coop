import { useCallback, useEffect, useState } from 'react';
import { Eye, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';

const peso = (value) => `₱${(Number(value) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDate = (value) => value
  ? new Date(String(value).length > 10 ? value : `${value}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
  : 'Not recorded';
const formatDateTime = (value) => value ? new Date(value).toLocaleString('en-PH') : 'Not recorded';
const memberName = (member) => [member?.first_name, member?.middle_name, member?.last_name].filter(Boolean).join(' ') || 'Member';
const display = (value) => value === null || value === undefined || value === '' ? 'Not recorded' : String(value);

const TableSection = ({ title, caption, rows, columns, empty, onSelect }) => (
  <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <header className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-100 px-5 py-4">
      <div>
        <h3 className="font-semibold text-slate-900">{title}</h3>
        {caption && <p className="mt-1 text-sm text-slate-500">{caption}</p>}
      </div>
      <span className="text-xs font-medium text-slate-500">{rows.length} {rows.length === 1 ? 'record' : 'records'}</span>
    </header>
    {rows.length === 0 ? (
      <p className="px-5 py-8 text-center text-sm text-slate-500">{empty}</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {columns.map((column) => <th key={column.label} scope="col" className={`px-4 py-3 font-semibold ${column.right ? 'text-right' : ''}`}>{column.label}</th>)}
              <th scope="col" className="px-4 py-3 text-right font-semibold">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => (
              <tr
                key={row.id || index}
                tabIndex={0}
                aria-label={`View details: ${row.detailTitle}`}
                onClick={() => onSelect(row)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(row);
                  }
                }}
                className="cursor-pointer transition-colors hover:bg-emerald-50/60 focus:bg-emerald-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"
              >
                {columns.map((column) => (
                  <td key={column.label} className={`px-4 py-3.5 text-slate-700 ${column.right ? 'text-right tabular-nums' : ''}`}>
                    {column.render(row)}
                  </td>
                ))}
                <td className="px-4 py-3.5 text-right">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-emerald-800">
                    <Eye className="size-4" aria-hidden="true" />
                    View details
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </section>
);

const OperationsMonitoring = () => {
  const [activeTab, setActiveTab] = useState('loans');
  const [loans, setLoans] = useState([]);
  const [overdueSchedules, setOverdueSchedules] = useState([]);
  const [loanActivity, setLoanActivity] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [savingsTx, setSavingsTx] = useState([]);
  const [stock, setStock] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState(null);

  const loadLoans = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const [loanRes, overdueRes, payRes] = await Promise.all([
      supabase.from('loans')
        .select('id, loan_number, status, balance, principal_amount, term_months, payment_frequency, application_date, approval_date, release_date, maturity_date, member:members(first_name, middle_name, last_name, member_number)')
        .order('application_date', { ascending: false }),
      supabase.from('loan_schedule')
        .select('id, loan_id, installment_number, due_date, amount_due, amount_paid, penalty_amount, status, loan:loans!inner(loan_number, status, member:members(first_name, middle_name, last_name, member_number))')
        .neq('status', 'paid')
        .lt('due_date', today)
        .order('due_date', { ascending: true }),
      supabase.from('loan_payments')
        .select('id, payment_number, amount_paid, principal_paid, interest_paid, penalty_paid, payment_date, created_at, payment_method, reference_number, loan:loans(loan_number, member:members(first_name, middle_name, last_name, member_number))')
        .eq('status', 'recorded')
        .order('created_at', { ascending: false })
        .limit(50)
    ]);
    setLoans(loanRes.data || []);
    setOverdueSchedules((overdueRes.data || []).filter((row) => row.loan?.status === 'active'));
    setLoanActivity(payRes.data || []);
    setLastUpdated(new Date());
  }, []);

  const loadSavings = useCallback(async () => {
    const [accRes, txRes] = await Promise.all([
      supabase.from('savings_accounts')
        .select('id, account_number, member_id, account_type, balance, status, closing_date, created_at, opening_date, maturity_date, interest_rate, member:members(first_name, middle_name, last_name, member_number)'),
      supabase.from('savings_transactions')
        .select('id, transaction_type, amount, created_at, transaction_date, description, reference_number, payment_method, savings_accounts!inner(account_type, account_number, member:members(first_name, middle_name, last_name, member_number))')
        .eq('status', 'recorded')
        .order('created_at', { ascending: false })
        .limit(200)
    ]);
    const weekAhead = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    setAccounts((accRes.data || []).map((account) => ({
      ...account,
      maturing: account.maturity_date
        ? account.maturity_date >= new Date().toISOString().slice(0, 10) && account.maturity_date <= weekAhead
        : Boolean(account.closing_date && account.closing_date <= weekAhead)
    })));
    setSavingsTx(txRes.data || []);
    setLastUpdated(new Date());
  }, []);

  const loadStock = useCallback(async () => {
    const { data } = await supabase
      .from('products')
      .select('id, product_code, product_name, unit_of_measure, reorder_level, minimum_stock, is_active, stock:stock_inventory(quantity_on_hand)')
      .eq('is_active', true)
      .order('product_name');
    setStock((data || []).map((product) => {
      const rows = Array.isArray(product.stock) ? product.stock : product.stock ? [product.stock] : [];
      const qty = rows.reduce((sum, row) => sum + (Number(row.quantity_on_hand) || 0), 0);
      const threshold = Number(product.reorder_level || product.minimum_stock) || 0;
      return { ...product, qty, threshold, status: qty <= 0 ? 'Out of stock' : qty <= threshold ? 'Low stock' : 'In stock' };
    }));
    setLastUpdated(new Date());
  }, []);

  useEffect(() => {
    loadLoans();
    loadSavings();
    loadStock();
  }, [loadLoans, loadSavings, loadStock]);

  useMultipleRealtimeSubscriptions([
    { table: 'loans', onUpdate: loadLoans },
    { table: 'loan_payments', onUpdate: loadLoans },
    { table: 'loan_schedule', onUpdate: loadLoans },
    { table: 'savings_accounts', onUpdate: loadSavings },
    { table: 'savings_transactions', onUpdate: loadSavings },
    { table: 'products', onUpdate: loadStock },
    { table: 'stock_inventory', onUpdate: loadStock },
    { table: 'stock_movements', onUpdate: loadStock }
  ], [loadLoans, loadSavings, loadStock]);

  const activeLoans = loans.filter((loan) => loan.status === 'active');
  const activeLoanTotal = activeLoans.reduce((sum, loan) => sum + (Number(loan.balance) || 0), 0);
  const savingsAccounts = accounts.filter((account) => account.account_type !== 'time_deposit' && account.status !== 'closed');
  const timeDeposits = accounts.filter((account) => account.account_type === 'time_deposit' && account.status !== 'closed');
  const activeAccounts = accounts.filter((account) => account.status !== 'closed');

  const loanRows = loans.map((loan) => ({
    ...loan,
    detailTitle: `Loan ${loan.loan_number || ''}`.trim(),
    details: [
      ['Member', memberName(loan.member)],
      ['Member number', display(loan.member?.member_number)],
      ['Loan number', display(loan.loan_number)],
      ['Status', display(loan.status)],
      ['Principal amount', peso(loan.principal_amount)],
      ['Outstanding balance', peso(loan.balance)],
      ['Term', loan.term_months ? `${loan.term_months} months` : 'Not recorded'],
      ['Payment frequency', display(loan.payment_frequency)],
      ['Application date', formatDate(loan.application_date)],
      ['Approval date', formatDate(loan.approval_date)],
      ['Release date', formatDate(loan.release_date)],
      ['Maturity date', formatDate(loan.maturity_date)]
    ]
  }));
  const overdueRows = overdueSchedules.map((schedule) => {
    const loan = Array.isArray(schedule.loan) ? schedule.loan[0] : schedule.loan;
    const outstanding = Math.max(Number(schedule.amount_due || 0) + Number(schedule.penalty_amount || 0) - Number(schedule.amount_paid || 0), 0);
    return {
      ...schedule,
      loan,
      outstanding,
      detailTitle: `Overdue installment ${schedule.installment_number || ''}`.trim(),
      details: [
        ['Member', memberName(loan?.member)],
        ['Member number', display(loan?.member?.member_number)],
        ['Loan number', display(loan?.loan_number)],
        ['Installment number', display(schedule.installment_number)],
        ['Due date', formatDate(schedule.due_date)],
        ['Installment amount', peso(schedule.amount_due)],
        ['Amount paid', peso(schedule.amount_paid)],
        ['Penalty', peso(schedule.penalty_amount)],
        ['Outstanding amount', peso(outstanding)],
        ['Schedule status', display(schedule.status)]
      ]
    };
  });
  const paymentRows = loanActivity.map((payment) => {
    const loan = Array.isArray(payment.loan) ? payment.loan[0] : payment.loan;
    return {
      ...payment,
      detailTitle: `Loan payment ${payment.payment_number || payment.id}`,
      details: [
        ['Member', memberName(loan?.member)],
        ['Member number', display(loan?.member?.member_number)],
        ['Loan number', display(loan?.loan_number)],
        ['Payment number', display(payment.payment_number)],
        ['Payment date', formatDate(payment.payment_date)],
        ['Total amount', peso(payment.amount_paid)],
        ['Principal paid', peso(payment.principal_paid)],
        ['Interest paid', peso(payment.interest_paid)],
        ['Penalty paid', peso(payment.penalty_paid)],
        ['Payment method', display(payment.payment_method)],
        ['Reference', display(payment.reference_number)],
        ['Recorded', formatDateTime(payment.created_at)]
      ]
    };
  });

  const accountRows = activeAccounts.map((account) => ({
    ...account,
    detailTitle: `${account.account_type === 'time_deposit' ? 'Time deposit' : 'Savings account'} ${account.account_number || ''}`.trim(),
    details: [
      ['Account type', display(account.account_type).replaceAll('_', ' ')],
      ['Account number', display(account.account_number)],
      ['Member', memberName(account.member)],
      ['Member number', display(account.member?.member_number)],
      ['Balance', peso(account.balance)],
      ['Status', display(account.status)],
      ['Opening date', formatDate(account.opening_date || account.created_at)],
      ['Maturity date', formatDate(account.maturity_date)],
      ['Interest rate', account.interest_rate === null ? 'Not recorded' : `${Number(account.interest_rate || 0)}%`],
      ['Maturing within seven days', account.maturing ? 'Yes' : 'No']
    ]
  }));
  const transactionRows = savingsTx.map((transaction) => {
    const account = Array.isArray(transaction.savings_accounts) ? transaction.savings_accounts[0] : transaction.savings_accounts;
    return {
      ...transaction,
      account,
      detailTitle: `${display(transaction.transaction_type)} · ${display(account?.account_number)}`,
      details: [
        ['Transaction type', display(transaction.transaction_type)],
        ['Account type', display(account?.account_type).replaceAll('_', ' ')],
        ['Account number', display(account?.account_number)],
        ['Member', memberName(account?.member)],
        ['Member number', display(account?.member?.member_number)],
        ['Amount', peso(transaction.amount)],
        ['Transaction date', formatDate(transaction.transaction_date)],
        ['Recorded', formatDateTime(transaction.created_at)],
        ['Description', display(transaction.description)],
        ['Reference', display(transaction.reference_number)],
        ['Payment method', display(transaction.payment_method)]
      ]
    };
  });
  const todayTransactions = savingsTx.filter((transaction) => transaction.created_at && new Date(transaction.created_at).toDateString() === new Date().toDateString());
  const todayDeposits = todayTransactions.filter((transaction) => /deposit/i.test(transaction.transaction_type || '')).length;
  const todayWithdrawals = todayTransactions.filter((transaction) => /withdraw/i.test(transaction.transaction_type || '')).length;

  const stockRows = stock.map((product) => ({
    ...product,
    detailTitle: product.product_name,
    details: [
      ['Product', product.product_name],
      ['Product code', display(product.product_code)],
      ['Current stock', `${product.qty} ${product.unit_of_measure || ''}`.trim()],
      ['Reorder level', `${product.threshold} ${product.unit_of_measure || ''}`.trim()],
      ['Stock status', product.status],
      ['Product status', product.is_active ? 'Active' : 'Inactive']
    ]
  }));
  const stockStatusClass = (status) => status === 'Out of stock'
    ? 'bg-red-100 text-red-800'
    : status === 'Low stock'
      ? 'bg-amber-100 text-amber-800'
      : 'bg-emerald-100 text-emerald-800';

  const tabs = [
    ['loans', 'Loan Monitoring'],
    ['savings', 'Savings & Time Deposits'],
    ['inventory', 'Inventory Monitoring']
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Operations Monitoring</h2>
          <p className="mt-1 text-sm text-slate-500">Review loan, member account, and inventory activity.</p>
        </div>
        <p className="inline-flex items-center gap-2 text-xs text-slate-500">
          <span className="size-2 rounded-full bg-emerald-500" />
          Live{lastUpdated ? ` · updated ${lastUpdated.toLocaleTimeString()}` : ''}
        </p>
      </div>

      <nav aria-label="Operations monitoring sections" className="flex overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            aria-current={activeTab === key ? 'page' : undefined}
            className={`min-w-max flex-1 rounded-lg px-4 py-3 text-sm font-semibold transition-colors ${
              activeTab === key ? 'bg-emerald-50 text-emerald-900 shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {activeTab === 'loans' && (
        <div className="space-y-5">
          <TableSection
            title="Loan portfolio"
            caption={`${activeLoans.length} active loans · ${peso(activeLoanTotal)} outstanding`}
            rows={loanRows}
            empty="No loan records found."
            onSelect={setSelectedRecord}
            columns={[
              { label: 'Loan number', render: (loan) => <span className="font-semibold text-slate-900">{display(loan.loan_number)}</span> },
              { label: 'Member', render: (loan) => <><span className="font-medium text-slate-900">{memberName(loan.member)}</span><span className="mt-0.5 block text-xs text-slate-500">ID {display(loan.member?.member_number)}</span></> },
              { label: 'Status', render: (loan) => <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">{display(loan.status)}</span> },
              { label: 'Principal', right: true, render: (loan) => peso(loan.principal_amount) },
              { label: 'Balance', right: true, render: (loan) => <span className="font-semibold text-slate-900">{peso(loan.balance)}</span> },
              { label: 'Application date', render: (loan) => formatDate(loan.application_date) }
            ]}
          />
          <TableSection
            title="Overdue installments"
            caption="Unpaid scheduled installments for active loans."
            rows={overdueRows}
            empty="No overdue installments."
            onSelect={setSelectedRecord}
            columns={[
              { label: 'Loan number', render: (row) => <span className="font-semibold text-slate-900">{display(row.loan?.loan_number)}</span> },
              { label: 'Member', render: (row) => memberName(row.loan?.member) },
              { label: 'Installment', render: (row) => display(row.installment_number) },
              { label: 'Due date', render: (row) => formatDate(row.due_date) },
              { label: 'Outstanding', right: true, render: (row) => <span className="font-semibold text-red-700">{peso(row.outstanding)}</span> }
            ]}
          />
          <TableSection
            title="Recent loan payments"
            caption="Latest recorded payments."
            rows={paymentRows}
            empty="No loan payments recorded yet."
            onSelect={setSelectedRecord}
            columns={[
              { label: 'Date', render: (payment) => formatDate(payment.payment_date) },
              { label: 'Member', render: (payment) => memberName(payment.loan?.member) },
              { label: 'Loan number', render: (payment) => display(payment.loan?.loan_number) },
              { label: 'Payment number', render: (payment) => display(payment.payment_number) },
              { label: 'Amount', right: true, render: (payment) => <span className="font-semibold text-emerald-700">{peso(payment.amount_paid)}</span> }
            ]}
          />
        </div>
      )}

      {activeTab === 'savings' && (
        <div className="space-y-5">
          <TableSection
            title="Savings and time-deposit accounts"
            caption={`${savingsAccounts.length} savings accounts · ${peso(savingsAccounts.reduce((sum, account) => sum + Number(account.balance || 0), 0))} savings balance · ${timeDeposits.length} time deposits · ${peso(timeDeposits.reduce((sum, account) => sum + Number(account.balance || 0), 0))} time-deposit balance`}
            rows={accountRows}
            empty="No active savings or time-deposit accounts."
            onSelect={setSelectedRecord}
            columns={[
              { label: 'Account number', render: (account) => <span className="font-semibold text-slate-900">{display(account.account_number)}</span> },
              { label: 'Member', render: (account) => <><span className="font-medium text-slate-900">{memberName(account.member)}</span><span className="mt-0.5 block text-xs text-slate-500">ID {display(account.member?.member_number)}</span></> },
              { label: 'Account type', render: (account) => <span className="capitalize">{display(account.account_type).replaceAll('_', ' ')}</span> },
              { label: 'Status', render: (account) => <span className="capitalize">{display(account.status)}</span> },
              { label: 'Balance', right: true, render: (account) => <span className="font-semibold text-slate-900">{peso(account.balance)}</span> },
              { label: 'Maturity', render: (account) => account.account_type === 'time_deposit' ? formatDate(account.maturity_date) : '—' }
            ]}
          />
          <TableSection
            title="Recent account transactions"
            caption={`${todayDeposits} deposit(s) and ${todayWithdrawals} withdrawal(s) recorded today.`}
            rows={transactionRows}
            empty="No recorded savings transactions."
            onSelect={setSelectedRecord}
            columns={[
              { label: 'Date', render: (transaction) => formatDate(transaction.transaction_date) },
              { label: 'Member', render: (transaction) => memberName(transaction.account?.member) },
              { label: 'Account', render: (transaction) => display(transaction.account?.account_number) },
              { label: 'Activity', render: (transaction) => <span className="capitalize">{display(transaction.transaction_type).replaceAll('_', ' ')}</span> },
              { label: 'Description', render: (transaction) => <span className="block max-w-[280px] truncate" title={transaction.description || ''}>{display(transaction.description)}</span> },
              { label: 'Amount', right: true, render: (transaction) => <span className="font-semibold text-slate-900">{peso(transaction.amount)}</span> }
            ]}
          />
        </div>
      )}

      {activeTab === 'inventory' && (
        <TableSection
          title="Inventory status"
          caption={`${stock.length} products · ${stock.filter((product) => product.status === 'Low stock').length} low stock · ${stock.filter((product) => product.status === 'Out of stock').length} out of stock`}
          rows={stockRows}
          empty="No active products found."
          onSelect={setSelectedRecord}
          columns={[
            { label: 'Product code', render: (product) => display(product.product_code) },
            { label: 'Product', render: (product) => <span className="font-semibold text-slate-900">{product.product_name}</span> },
            { label: 'On hand', right: true, render: (product) => `${product.qty} ${product.unit_of_measure || ''}`.trim() },
            { label: 'Reorder level', right: true, render: (product) => `${product.threshold} ${product.unit_of_measure || ''}`.trim() },
            { label: 'Stock status', render: (product) => <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${stockStatusClass(product.status)}`}>{product.status}</span> }
          ]}
        />
      )}

      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm" onClick={() => setSelectedRecord(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="operations-detail-title"
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/60 bg-slate-50 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="manager-gradient-header relative overflow-hidden bg-gradient-to-br from-[#7c2d12] via-[#c2410c] to-[#f97316] px-5 py-5 text-white sm:px-7">
              <div className="pointer-events-none absolute -right-10 -top-20 size-48 rounded-full border-[24px] border-white/5" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-100">Operations record</p>
                  <h2 id="operations-detail-title" className="mt-1 break-words text-xl font-bold">{selectedRecord.detailTitle}</h2>
                </div>
                <button type="button" onClick={() => setSelectedRecord(null)} aria-label="Close record details" className="flex size-9 flex-none items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                  <X className="size-5" aria-hidden="true" />
                </button>
              </div>
            </header>
            <dl className="grid min-h-0 gap-3 overflow-y-auto p-5 sm:grid-cols-2 sm:p-6">
              {selectedRecord.details.map(([label, value]) => (
                <div key={label} className="min-w-0 rounded-lg border border-slate-100 bg-slate-50/70 px-3.5 py-3">
                  <dt className="text-xs font-medium text-slate-500">{label}</dt>
                  <dd className="mt-1 break-words text-sm font-medium capitalize text-slate-900">{display(value)}</dd>
                </div>
              ))}
            </dl>
            <footer className="flex justify-end border-t border-slate-200 px-5 py-4 sm:px-6">
              <button type="button" onClick={() => setSelectedRecord(null)} className="min-h-10 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-700 focus-visible:ring-offset-2">
                Close
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
};

export default OperationsMonitoring;
