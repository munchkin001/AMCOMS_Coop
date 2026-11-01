import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Printer, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';

const peso = (v) => `PHP ${(Number(v) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v) => (Number(v) || 0).toLocaleString('en-PH');
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '-');
const iso = (d) => {
  const copy = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return copy.toISOString().slice(0, 10);
};
const fullName = (m) => [m?.first_name, m?.middle_name, m?.last_name].filter(Boolean).join(' ') || '-';
const AGING_BUCKETS = [
  { key: 'current', label: 'Current / not due' },
  { key: 'days1To30', label: '1–30 days' },
  { key: 'days31To60', label: '31–60 days' },
  { key: 'days61To90', label: '61–90 days' },
  { key: 'over90Days', label: 'Over 90 days' }
];

const daysPastDue = (asOf, dueDate) => {
  if (!dueDate) return null;
  const asOfTime = Date.parse(`${asOf}T00:00:00Z`);
  const dueTime = Date.parse(`${dueDate}T00:00:00Z`);
  return Math.floor((asOfTime - dueTime) / 86400000);
};

const createAgingRow = ({ id, category, particulars, reference, party, dueDate, amount, asOf, details }) => {
  const days = daysPastDue(asOf, dueDate);
  const bucket = days === null || days <= 0
    ? 'current'
    : days <= 30
      ? 'days1To30'
      : days <= 60
        ? 'days31To60'
        : days <= 90
          ? 'days61To90'
          : 'over90Days';
  return {
    id,
    category,
    particulars: particulars || '-',
    reference: reference || '-',
    party: party || '-',
    dueDate,
    details,
    daysPastDue: days,
    current: bucket === 'current' ? amount : 0,
    days1To30: bucket === 'days1To30' ? amount : 0,
    days31To60: bucket === 'days31To60' ? amount : 0,
    days61To90: bucket === 'days61To90' ? amount : 0,
    over90Days: bucket === 'over90Days' ? amount : 0,
    total: amount
  };
};

const fetchAllRows = async (createQuery) => {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await createQuery().range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
};

const REPORTS = {
  aging: { title: 'Accounts Receivable & Payable Aging', blurb: 'Outstanding sales, loan installments, supplier purchases, and time deposits' },
  financial: { title: 'Financial Report', blurb: 'Cash receipts and disbursements' },
  loan: { title: 'Loan Report', blurb: 'Loan portfolio and collections' },
  member: { title: 'Member Report', blurb: 'Membership and savings' },
  inventory: { title: 'Inventory Report', blurb: 'Stock levels and movements' }
};

const getRange = (period, anchor) => {
  const d = new Date(`${anchor}T00:00:00`);
  let start = new Date(d);
  let end = new Date(d);
  if (period === 'monthly') {
    start = new Date(d.getFullYear(), d.getMonth(), 1);
    end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  } else if (period === 'quarterly') {
    const q = Math.floor(d.getMonth() / 3) * 3;
    start = new Date(d.getFullYear(), q, 1);
    end = new Date(d.getFullYear(), q + 3, 0);
  } else if (period === 'annual') {
    start = new Date(d.getFullYear(), 0, 1);
    end = new Date(d.getFullYear(), 11, 31);
  }
  return { from: iso(start), to: iso(end) };
};

const Section = ({ title, children }) => (
  <section className="mt-8 break-inside-avoid-page">
    <h3 className="mb-2 border-b-2 border-slate-800 pb-1 text-sm font-bold uppercase tracking-wide text-slate-900">{title}</h3>
    {children}
  </section>
);

const DataTable = ({ columns, rows, empty = 'No records for this period.', footer, tableClassName = '', onRowClick }) => (
  <div className="report-table-scroll overflow-x-auto">
    <table className={`w-full border-collapse text-left text-xs ${tableClassName}`}>
      <thead>
        <tr className="bg-slate-100">
          {columns.map((c) => (
            <th key={c.label} className={`border border-slate-300 px-2 py-1.5 font-semibold text-slate-800 ${c.right ? 'text-right' : ''}`}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr><td colSpan={columns.length} className="border border-slate-300 px-2 py-4 text-center text-slate-500">{empty}</td></tr>
        )}
        {rows.map((row, i) => (
          <tr
            key={row.id || i}
            tabIndex={onRowClick ? 0 : undefined}
            aria-label={onRowClick ? `View details for ${row.category || row.reference || 'report entry'}` : undefined}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            onKeyDown={onRowClick ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onRowClick(row);
              }
            } : undefined}
            className={`odd:bg-white even:bg-slate-50 ${onRowClick ? 'cursor-pointer hover:bg-blue-50 focus:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600' : ''}`}
          >
            {columns.map((c) => (
              <td key={c.label} className={`border border-slate-300 px-2 py-1.5 text-slate-800 ${c.right ? 'text-right tabular-nums' : ''}`}>{c.render(row)}</td>
            ))}
          </tr>
        ))}
      </tbody>
      {footer && rows.length > 0 && (
        <tfoot>
          <tr className="bg-slate-100 font-semibold">
            {footer.map((cell, i) => (
              <td key={i} className={`border border-slate-300 px-2 py-1.5 ${columns[i]?.right ? 'text-right tabular-nums' : ''}`}>{cell}</td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  </div>
);

const Summary = ({ items }) => (
  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
    {items.map(([label, value]) => (
      <div key={label} className="border border-slate-300 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 break-words text-base font-bold tabular-nums text-slate-900">{value}</p>
      </div>
    ))}
  </div>
);

const Reports = () => {
  const location = useLocation();
  const [reportType, setReportType] = useState(location.state?.reportType || 'aging');
  const [period, setPeriod] = useState('monthly');
  const [anchor, setAnchor] = useState(iso(new Date()));
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generatedAt, setGeneratedAt] = useState(new Date());
  const [selectedAgingEntry, setSelectedAgingEntry] = useState(null);

  const range = useMemo(() => getRange(period, anchor), [period, anchor]);
  const asOfDate = iso(new Date());

  const load = useCallback(async () => {
    setError('');
    const { from, to } = range;
    const toEnd = `${to}T23:59:59`;
    try {
      let result = {};
      if (reportType === 'financial') {
        const [r, d] = await Promise.all([
          supabase.from('cash_receipts').select('id, receipt_number, receipt_date, received_from, amount, payment_method, description, status').eq('status', 'recorded').gte('receipt_date', from).lte('receipt_date', to).order('receipt_date'),
          supabase.from('cash_disbursements').select('id, voucher_number, disbursement_date, payee, amount, payment_method, description, status').eq('status', 'recorded').gte('disbursement_date', from).lte('disbursement_date', to).order('disbursement_date')
        ]);
        if (r.error || d.error) throw r.error || d.error;
        result = { receipts: r.data || [], disbursements: d.data || [] };
      } else if (reportType === 'loan') {
        const [l, p] = await Promise.all([
          supabase.from('loans').select('id, loan_number, principal_amount, balance, status, term_months, payment_frequency, release_date, application_date, member:members(first_name, middle_name, last_name)').order('application_date', { ascending: false }),
          supabase.from('loan_payments').select('id, payment_date, amount_paid, principal_paid, interest_paid, penalty_paid, loan:loans(loan_number, member:members(first_name, middle_name, last_name))').eq('status', 'recorded').gte('payment_date', from).lte('payment_date', to).order('payment_date')
        ]);
        if (l.error || p.error) throw l.error || p.error;
        result = { loans: l.data || [], payments: p.data || [] };
      } else if (reportType === 'aging') {
        const [sales, purchases, disbursements, timeDeposits, schedules] = await Promise.all([
          fetchAllRows(() => supabase.from('sales_orders')
            .select('id, order_number, order_date, customer_name, net_amount, amount_paid, payment_status, order_status, notes, member:members(first_name, middle_name, last_name), sales_order_items(id, item_description, quantity, product:products(product_name))')
            .in('payment_status', ['pending', 'partial'])
            .neq('order_status', 'cancelled')
            .order('order_date', { ascending: true })),
          fetchAllRows(() => supabase.from('purchases')
            .select('id, purchase_number, purchase_date, net_amount, payment_status, status, notes, suppliers(supplier_name), purchase_items(id, item_name, quantity, products(product_name))')
            .in('payment_status', ['pending', 'partial', 'overdue'])
            .neq('status', 'cancelled')
            .order('purchase_date', { ascending: true })),
          fetchAllRows(() => supabase.from('cash_disbursements')
            .select('id, voucher_number, disbursement_date, amount, description, status')
            .eq('status', 'recorded')
            .order('disbursement_date', { ascending: true })),
          fetchAllRows(() => supabase.from('savings_accounts')
            .select('id, account_number, balance, interest_rate, opening_date, maturity_date, status, member:members(first_name, middle_name, last_name, member_number)')
            .eq('account_type', 'time_deposit')
            .neq('status', 'closed')
            .gt('balance', 0)
            .order('maturity_date', { ascending: true })),
          fetchAllRows(() => supabase.from('loan_schedule')
            .select('id, installment_number, due_date, amount_due, amount_paid, penalty_amount, status, loan:loans!inner(loan_number, status, member:members(first_name, middle_name, last_name))')
            .neq('status', 'paid')
            .order('due_date', { ascending: true }))
        ]);
        result = { sales, purchases, disbursements, timeDeposits, schedules };
      } else if (reportType === 'member') {
        const [m, s] = await Promise.all([
          supabase.from('members').select('id, member_number, first_name, middle_name, last_name, membership_status, membership_type, date_joined, archived_at'),
          supabase.from('savings_accounts').select('id, account_type, balance, status')
        ]);
        if (m.error || s.error) throw m.error || s.error;
        result = { members: m.data || [], accounts: s.data || [] };
      } else {
        const [p, mv] = await Promise.all([
          supabase.from('products').select('id, product_code, product_name, unit_of_measure, unit_price, reorder_level, minimum_stock, is_active, stock:stock_inventory(quantity_on_hand)').eq('is_active', true).order('product_name'),
          supabase.from('stock_movements').select('id, movement_type, quantity, movement_date, reference_number, product:products(product_name, unit_of_measure)').gte('movement_date', from).lte('movement_date', toEnd).order('movement_date')
        ]);
        if (p.error || mv.error) throw p.error || mv.error;
        result = { products: p.data || [], movements: mv.data || [] };
      }
      setData(result);
      setGeneratedAt(new Date());
    } catch (err) {
      console.error('Unable to build report:', err);
      setError('The report could not be generated. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [reportType, range]);

  useEffect(() => {
    setLoading(true);
    setData({});
    load();
  }, [load]);

  useMultipleRealtimeSubscriptions([
    { table: 'cash_receipts', onUpdate: load },
    { table: 'cash_disbursements', onUpdate: load },
    { table: 'loans', onUpdate: load },
    { table: 'loan_payments', onUpdate: load },
    { table: 'loan_schedule', onUpdate: load },
    { table: 'members', onUpdate: load },
    { table: 'savings_accounts', onUpdate: load },
    { table: 'sales_orders', onUpdate: load },
    { table: 'purchases', onUpdate: load },
    { table: 'products', onUpdate: load },
    { table: 'stock_inventory', onUpdate: load },
    { table: 'stock_movements', onUpdate: load }
  ], [load]);

  const meta = REPORTS[reportType];
  const periodLabel = range.from === range.to ? fmtDate(range.from) : `${fmtDate(range.from)} to ${fmtDate(range.to)}`;

  const renderBody = () => {
    if (reportType === 'aging') {
      const asOf = asOfDate;
      const sales = (data.sales || []).map((sale) => {
        const items = (sale.sales_order_items || [])
          .map((item) => `${item.item_description || item.product?.product_name || 'Sale item'}${item.quantity ? ` × ${num(item.quantity)}` : ''}`)
          .join(', ');
        const netAmount = Number(sale.net_amount || 0);
        const amountPaid = Number(sale.amount_paid || 0);
        return createAgingRow({
          id: `sale-${sale.id}`,
          category: 'Sales receivable',
          particulars: items || sale.notes || 'Sales order',
          reference: sale.order_number,
          party: sale.member ? fullName(sale.member) : sale.customer_name || 'Customer',
          dueDate: sale.order_date,
          amount: Math.max(netAmount - amountPaid, 0),
          details: [
            ['Record type', 'Sales order'],
            ['Order number', sale.order_number],
            ['Order date', fmtDate(sale.order_date)],
            ['Customer', sale.member ? fullName(sale.member) : sale.customer_name || 'Customer'],
            ['Payment status', sale.payment_status],
            ['Order status', sale.order_status],
            ['Net amount', peso(netAmount)],
            ['Amount paid', peso(amountPaid)],
            ['Outstanding balance', peso(Math.max(netAmount - amountPaid, 0))],
            ['Particulars', items || sale.notes || 'Sales order'],
            ...(sale.notes ? [['Notes', sale.notes]] : [])
          ],
          asOf
        });
      }).filter((row) => row.total > 0);
      const purchasePayments = data.disbursements || [];
      const purchases = (data.purchases || []).map((purchase) => {
        const paid = purchasePayments.reduce((total, payment) => {
          const paymentReference = `${payment.description || ''} ${payment.voucher_number || ''}`.toLocaleLowerCase();
          return paymentReference.includes(String(purchase.purchase_number || '').toLocaleLowerCase())
            ? total + Number(payment.amount || 0)
            : total;
        }, 0);
        const items = (purchase.purchase_items || [])
          .map((item) => `${item.item_name || item.products?.product_name || 'Purchase item'}${item.quantity ? ` × ${num(item.quantity)}` : ''}`)
          .join(', ');
        const netAmount = Number(purchase.net_amount || 0);
        return createAgingRow({
          id: `purchase-${purchase.id}`,
          category: 'Supplier purchase',
          particulars: items || purchase.notes || 'Supplier purchase',
          reference: purchase.purchase_number,
          party: purchase.suppliers?.supplier_name || 'Supplier',
          dueDate: purchase.purchase_date,
          amount: Math.max(netAmount - paid, 0),
          details: [
            ['Record type', 'Supplier purchase'],
            ['Purchase number', purchase.purchase_number],
            ['Purchase date', fmtDate(purchase.purchase_date)],
            ['Supplier', purchase.suppliers?.supplier_name || 'Supplier'],
            ['Payment status', purchase.payment_status],
            ['Purchase status', purchase.status],
            ['Net amount', peso(netAmount)],
            ['Recorded payments', peso(paid)],
            ['Outstanding balance', peso(Math.max(netAmount - paid, 0))],
            ['Particulars', items || purchase.notes || 'Supplier purchase'],
            ...(purchase.notes ? [['Notes', purchase.notes]] : [])
          ],
          asOf
        });
      }).filter((row) => row.total > 0);
      const timeDeposits = (data.timeDeposits || []).map((account) => createAgingRow({
        id: `time-deposit-${account.id}`,
        category: 'Time deposit payable',
        particulars: `Time deposit${account.interest_rate !== null ? ` · ${Number(account.interest_rate || 0)}% interest` : ''}`,
        reference: account.account_number,
        party: fullName(account.member),
        dueDate: account.maturity_date,
        amount: Number(account.balance || 0),
        details: [
          ['Record type', 'Time deposit'],
          ['Account number', account.account_number],
          ['Member', fullName(account.member)],
          ['Member number', account.member?.member_number || '-'],
          ['Opening date', fmtDate(account.opening_date)],
          ['Maturity date', fmtDate(account.maturity_date)],
          ['Interest rate', account.interest_rate === null ? '-' : `${Number(account.interest_rate || 0)}%`],
          ['Account status', account.status],
          ['Outstanding balance', peso(account.balance)]
        ],
        asOf
      })).filter((row) => row.total > 0);
      const schedules = (data.schedules || []).map((schedule) => {
        const loan = Array.isArray(schedule.loan) ? schedule.loan[0] : schedule.loan;
        if (loan?.status !== 'active') return null;
        const due = Number(schedule.amount_due || 0);
        const paid = Number(schedule.amount_paid || 0);
        const unpaidInstallment = Math.max(due - paid, 0);
        const unpaidPenalty = Math.max(Number(schedule.penalty_amount || 0) - Math.max(paid - due, 0), 0);
        const outstanding = unpaidInstallment + unpaidPenalty;
        if (outstanding <= 0) return null;
        return createAgingRow({
          id: `loan-schedule-${schedule.id}`,
          category: 'Loan installment',
          particulars: `Loan installment ${schedule.installment_number}${unpaidPenalty ? ` · includes ${peso(unpaidPenalty)} penalty` : ''}`,
          reference: loan.loan_number,
          party: fullName(loan.member),
          dueDate: schedule.due_date,
          amount: outstanding,
          details: [
            ['Record type', 'Loan installment'],
            ['Loan number', loan.loan_number],
            ['Member', fullName(loan.member)],
            ['Installment number', schedule.installment_number],
            ['Due date', fmtDate(schedule.due_date)],
            ['Schedule status', schedule.status],
            ['Installment amount due', peso(due)],
            ['Amount paid', peso(paid)],
            ['Penalty amount', peso(schedule.penalty_amount)],
            ['Outstanding installment', peso(unpaidInstallment)],
            ['Outstanding penalty', peso(unpaidPenalty)],
            ['Total outstanding', peso(outstanding)]
          ],
          asOf
        });
      }).filter(Boolean);

      const receivables = [...sales, ...schedules];
      const payables = [...purchases, ...timeDeposits];
      const agingRows = [...receivables, ...payables];
      const agingColumns = [
        { label: 'Particulars', render: (row) => row.particulars },
        { label: 'Reference', render: (row) => row.reference },
        { label: 'Customer / supplier / member', render: (row) => row.party },
        { label: 'Age date', render: (row) => fmtDate(row.dueDate) },
        { label: 'Days past due', right: true, render: (row) => row.daysPastDue === null ? '-' : row.daysPastDue <= 0 ? 'Not due' : num(row.daysPastDue) },
        ...AGING_BUCKETS.map(({ key, label }) => ({ label, right: true, render: (row) => peso(row[key]) })),
        { label: 'Total outstanding', right: true, render: (row) => peso(row.total) }
      ];
      const printAgingColumns = [
        { label: 'Entry type', render: (row) => row.category },
        ...agingColumns
      ];
      const agingFooter = (rows) => [
        'TOTAL', '', '', '', '',
        ...AGING_BUCKETS.map(({ key }) => peso(rows.reduce((total, row) => total + row[key], 0))),
        peso(rows.reduce((total, row) => total + row.total, 0))
      ];
      const printAgingFooter = (rows) => [
        'TOTAL', '', '', '', '', '',
        ...AGING_BUCKETS.map(({ key }) => peso(rows.reduce((total, row) => total + row[key], 0))),
        peso(rows.reduce((total, row) => total + row.total, 0))
      ];
      const sumOutstanding = (rows) => rows.reduce((total, row) => total + row.total, 0);
      return (
        <>
          <Summary items={[
            ['Accounts receivable', peso(sumOutstanding(receivables))],
            ['Accounts payable', peso(sumOutstanding(payables))],
            ['Sales receivable', peso(sumOutstanding(sales))],
            ['Time deposits payable', peso(sumOutstanding(timeDeposits))]
          ]} />
          <p className="mt-4 text-xs text-slate-600">Aging basis: sale or purchase date, scheduled loan due date, and time-deposit maturity date.</p>
          <div className="aging-screen-entries">
            <Section title="Accounts Receivable — Sales and Loan Installments">
              <DataTable
                rows={receivables}
                columns={agingColumns}
                empty="No outstanding sales or loan installments as of this date."
                footer={agingFooter(receivables)}
                tableClassName="aging-report-table min-w-[1200px]"
                onRowClick={setSelectedAgingEntry}
              />
            </Section>
            <Section title="Accounts Payable — Supplier Purchases">
              <DataTable
                rows={purchases}
                columns={agingColumns}
                empty="No outstanding supplier purchases as of this date."
                footer={agingFooter(purchases)}
                tableClassName="aging-report-table min-w-[1200px]"
                onRowClick={setSelectedAgingEntry}
              />
            </Section>
            <Section title="Accounts Payable — Time Deposits">
              <DataTable
                rows={timeDeposits}
                columns={agingColumns}
                empty="No active time deposits with an outstanding balance."
                footer={agingFooter(timeDeposits)}
                tableClassName="aging-report-table min-w-[1200px]"
                onRowClick={setSelectedAgingEntry}
              />
            </Section>
          </div>
          <div className="aging-print-table hidden">
            <Section title="Accounts Receivable & Payable">
              <DataTable
                rows={agingRows}
                columns={printAgingColumns}
                empty="No outstanding receivables or payables as of this date."
                footer={printAgingFooter(agingRows)}
                tableClassName="aging-report-table min-w-[1200px]"
              />
            </Section>
          </div>
        </>
      );
    }

    if (reportType === 'financial') {
      const receipts = data.receipts || [];
      const disb = data.disbursements || [];
      const totalIn = receipts.reduce((s, r) => s + Number(r.amount || 0), 0);
      const totalOut = disb.reduce((s, r) => s + Number(r.amount || 0), 0);
      return (
        <>
          <Summary items={[['Total receipts', peso(totalIn)], ['Total disbursements', peso(totalOut)], ['Net cash flow', peso(totalIn - totalOut)], ['Transactions', num(receipts.length + disb.length)]]} />
          <Section title="Cash Receipts">
            <DataTable
              rows={receipts}
              columns={[
                { label: 'Date', render: (r) => fmtDate(r.receipt_date) },
                { label: 'OR No.', render: (r) => r.receipt_number },
                { label: 'Received from', render: (r) => r.received_from },
                { label: 'Particulars', render: (r) => r.description || '-' },
                { label: 'Amount', right: true, render: (r) => peso(r.amount) }
              ]}
              footer={['Total', '', '', '', peso(totalIn)]}
            />
          </Section>
          <Section title="Cash Disbursements">
            <DataTable
              rows={disb}
              columns={[
                { label: 'Date', render: (r) => fmtDate(r.disbursement_date) },
                { label: 'CV No.', render: (r) => r.voucher_number },
                { label: 'Member / Payee', render: (r) => r.payee },
                { label: 'Particulars', render: (r) => r.description || '-' },
                { label: 'Amount', right: true, render: (r) => peso(r.amount) }
              ]}
              footer={['Total', '', '', '', peso(totalOut)]}
            />
          </Section>
        </>
      );
    }

    if (reportType === 'loan') {
      const loans = data.loans || [];
      const pays = data.payments || [];
      const active = loans.filter((l) => l.status === 'active');
      const outstanding = active.reduce((s, l) => s + Number(l.balance || 0), 0);
      const released = loans.filter((l) => ['active', 'completed'].includes(l.status)).reduce((s, l) => s + Number(l.principal_amount || 0), 0);
      const collected = pays.reduce((s, p) => s + Number(p.amount_paid || 0), 0);
      return (
        <>
          <Summary items={[['Active loans', num(active.length)], ['Outstanding balance', peso(outstanding)], ['Total released', peso(released)], ['Collected this period', peso(collected)]]} />
          <Section title="Loan Portfolio">
            <DataTable
              rows={loans}
              columns={[
                { label: 'Loan No.', render: (l) => l.loan_number },
                { label: 'Member', render: (l) => fullName(l.member) },
                { label: 'Term', render: (l) => (l.term_months ? `${l.term_months / 12} yr, ${l.payment_frequency || 'monthly'}` : '-') },
                { label: 'Released', render: (l) => fmtDate(l.release_date) },
                { label: 'Status', render: (l) => <span className="capitalize">{l.status}</span> },
                { label: 'Principal', right: true, render: (l) => peso(l.principal_amount) },
                { label: 'Balance', right: true, render: (l) => peso(l.balance) }
              ]}
            />
          </Section>
          <Section title="Loan Collections">
            <DataTable
              rows={pays}
              columns={[
                { label: 'Date', render: (p) => fmtDate(p.payment_date) },
                { label: 'Loan No.', render: (p) => p.loan?.loan_number || '-' },
                { label: 'Member', render: (p) => fullName(p.loan?.member) },
                { label: 'Principal', right: true, render: (p) => peso(p.principal_paid) },
                { label: 'Interest', right: true, render: (p) => peso(p.interest_paid) },
                { label: 'Penalty', right: true, render: (p) => peso(p.penalty_paid) },
                { label: 'Total paid', right: true, render: (p) => peso(p.amount_paid) }
              ]}
              footer={['Total', '', '', '', '', '', peso(collected)]}
            />
          </Section>
        </>
      );
    }

    if (reportType === 'member') {
      const members = data.members || [];
      const accounts = data.accounts || [];
      const activeMembers = members.filter((m) => m.membership_status === 'active' && !m.archived_at);
      const joined = members.filter((m) => m.date_joined >= range.from && m.date_joined <= range.to);
      const savings = accounts.filter((a) => a.account_type !== 'time_deposit' && a.status !== 'closed');
      const deposits = accounts.filter((a) => a.account_type === 'time_deposit' && a.status !== 'closed');
      const sum = (rows) => rows.reduce((s, a) => s + Number(a.balance || 0), 0);
      return (
        <>
          <Summary items={[['Total members', num(members.length)], ['Active members', num(activeMembers.length)], ['New this period', num(joined.length)], ['Archived / inactive', num(members.length - activeMembers.length)]]} />
          <Section title="New Members">
            <DataTable
              rows={joined}
              columns={[
                { label: 'Member No.', render: (m) => m.member_number },
                { label: 'Name', render: (m) => fullName(m) },
                { label: 'Type', render: (m) => <span className="capitalize">{m.membership_type || '-'}</span> },
                { label: 'Date joined', render: (m) => fmtDate(m.date_joined) },
                { label: 'Status', render: (m) => <span className="capitalize">{m.membership_status}</span> }
              ]}
            />
          </Section>
          <Section title="Savings and Time Deposits">
            <DataTable
              rows={[
                { id: 's', name: 'Savings accounts', count: savings.length, total: sum(savings) },
                { id: 't', name: 'Time deposits', count: deposits.length, total: sum(deposits) }
              ]}
              columns={[
                { label: 'Account type', render: (r) => r.name },
                { label: 'Open accounts', right: true, render: (r) => num(r.count) },
                { label: 'Total balance', right: true, render: (r) => peso(r.total) }
              ]}
              footer={['Total', num(savings.length + deposits.length), peso(sum(savings) + sum(deposits))]}
            />
          </Section>
        </>
      );
    }

    const products = (data.products || []).map((p) => {
      const rows = Array.isArray(p.stock) ? p.stock : p.stock ? [p.stock] : [];
      const qty = rows.reduce((s, r) => s + Number(r.quantity_on_hand || 0), 0);
      const threshold = Number(p.reorder_level || p.minimum_stock) || 0;
      return { ...p, qty, status: qty <= 0 ? 'Out of stock' : qty <= threshold ? 'Low stock' : 'In stock' };
    });
    const movements = data.movements || [];
    const value = products.reduce((s, p) => s + p.qty * Number(p.unit_price || 0), 0);
    return (
      <>
        <Summary items={[['Products', num(products.length)], ['Low stock', num(products.filter((p) => p.status === 'Low stock').length)], ['Out of stock', num(products.filter((p) => p.status === 'Out of stock').length)], ['Stock value (at price)', peso(value)]]} />
        <Section title="Stock on Hand">
          <DataTable
            rows={products}
            columns={[
              { label: 'Code', render: (p) => p.product_code || '-' },
              { label: 'Product', render: (p) => p.product_name },
              { label: 'On hand', right: true, render: (p) => `${num(p.qty)} ${p.unit_of_measure || ''}` },
              { label: 'Reorder level', right: true, render: (p) => num(p.reorder_level || p.minimum_stock) },
              { label: 'Status', render: (p) => p.status }
            ]}
          />
        </Section>
        <Section title="Stock Movements">
          <DataTable
            rows={movements}
            columns={[
              { label: 'Date', render: (m) => fmtDate(m.movement_date) },
              { label: 'Product', render: (m) => m.product?.product_name || '-' },
              { label: 'Type', render: (m) => <span className="capitalize">{String(m.movement_type || '').replaceAll('_', ' ')}</span> },
              { label: 'Reference', render: (m) => m.reference_number || '-' },
              { label: 'Quantity', right: true, render: (m) => `${num(m.quantity)} ${m.product?.unit_of_measure || ''}` }
            ]}
          />
        </Section>
      </>
    );
  };

  const inputClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20';

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          body * { visibility: hidden !important; }
          #report-print, #report-print * { visibility: visible !important; }
          #report-print { position: absolute; left: 0; top: 0; width: 100%; max-width: none !important; border: 0 !important; box-shadow: none !important; padding: 0 !important; }
          .report-table-scroll { width: 100% !important; max-width: none !important; overflow: visible !important; }
          .aging-report-table { width: 100% !important; min-width: 0 !important; table-layout: fixed; font-size: 7.5pt; }
          .aging-report-table th, .aging-report-table td { padding: 3px 4px !important; overflow-wrap: anywhere; }
          .aging-screen-entries { display: none !important; }
          .aging-print-table { display: block !important; }
          .aging-print-table .break-inside-avoid-page { break-inside: auto !important; }
          .aging-report-table th:nth-child(1), .aging-report-table td:nth-child(1) { width: 8%; }
          .aging-report-table th:nth-child(2), .aging-report-table td:nth-child(2) { width: 14%; }
          .aging-report-table th:nth-child(3), .aging-report-table td:nth-child(3) { width: 8%; }
          .aging-report-table th:nth-child(4), .aging-report-table td:nth-child(4) { width: 12%; }
          .aging-report-table th:nth-child(5), .aging-report-table td:nth-child(5) { width: 7%; }
          .aging-report-table th:nth-child(6), .aging-report-table td:nth-child(6) { width: 6%; }
          .aging-report-table th:nth-child(7), .aging-report-table td:nth-child(7),
          .aging-report-table th:nth-child(8), .aging-report-table td:nth-child(8),
          .aging-report-table th:nth-child(9), .aging-report-table td:nth-child(9),
          .aging-report-table th:nth-child(10), .aging-report-table td:nth-child(10),
          .aging-report-table th:nth-child(11), .aging-report-table td:nth-child(11) { width: 7%; }
          .aging-report-table th:nth-child(12), .aging-report-table td:nth-child(12) { width: 10%; }
          .aging-report-table th { font-size: 7pt; }
          .break-inside-avoid-page { break-inside: avoid; }
          thead { display: table-header-group; }
        }
      `}</style>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Report Generator</h2>
          </div>
          <span className="inline-flex items-center gap-2 text-xs text-gray-500">
            <span className="size-2 rounded-full bg-green-500" /> Live
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Report type</label>
            <select value={reportType} onChange={(e) => setReportType(e.target.value)} className={inputClass}>
              {Object.entries(REPORTS).map(([key, r]) => <option key={key} value={key}>{r.title}</option>)}
            </select>
          </div>
          {reportType === 'aging' ? (
            <div className="flex flex-col justify-center rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
              <span className="text-xs font-medium text-blue-800">Snapshot date</span>
              <span className="mt-1 text-sm font-semibold text-blue-950">{fmtDate(asOfDate)}</span>
            </div>
          ) : (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Period</label>
                <select value={period} onChange={(e) => setPeriod(e.target.value)} className={inputClass}>
                  <option value="daily">Daily</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Reference date</label>
                <input type="date" value={anchor} onChange={(e) => e.target.value && setAnchor(e.target.value)} className={inputClass} />
              </div>
            </>
          )}
          <div className="flex items-end gap-2">
            <button type="button" onClick={() => { setLoading(true); load(); }} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <RefreshCw size={16} /> Refresh
            </button>
            <button type="button" onClick={() => window.print()} disabled={loading || Boolean(error)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#183b34] px-4 py-2 text-sm font-medium text-white hover:bg-[#102e28] disabled:cursor-not-allowed disabled:opacity-50">
              <Printer size={16} /> Print
            </button>
          </div>
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      <article id="report-print" className={`amcoms-print-document mx-auto rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-10 ${reportType === 'aging' ? 'max-w-[1600px]' : 'max-w-5xl'}`}>
        <header className="amcoms-document-header border-b-4 border-double pb-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#183b34]">Agay-ayan Multi-Purpose Cooperative</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{meta.title}</h1>
          <p className="mt-3 text-sm font-medium text-slate-800">{reportType === 'aging' ? 'Aging as of' : 'Period covered'}: {reportType === 'aging' ? fmtDate(asOfDate) : periodLabel}</p>
          <p className="text-xs text-slate-500">Generated {generatedAt.toLocaleString('en-PH')}</p>
        </header>

        <div className="mt-6">
          {loading ? <p className="py-12 text-center text-sm text-slate-500">Generating report...</p> : renderBody()}
        </div>

        <footer className="document-signatures mt-16 grid grid-cols-2 gap-10 text-center text-xs text-slate-700">
          <div><div className="border-t border-slate-800 pt-1">Prepared by</div></div>
          <div><div className="border-t border-slate-800 pt-1">Noted by (Manager)</div></div>
        </footer>
      </article>
      {reportType === 'aging' && selectedAgingEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 print:hidden"
          onClick={() => setSelectedAgingEntry(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="aging-entry-details-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{selectedAgingEntry.category}</p>
                <h2 id="aging-entry-details-title" className="mt-1 text-xl font-bold text-slate-900">Entry details</h2>
                <p className="mt-1 text-sm text-slate-600">{selectedAgingEntry.reference}</p>
              </div>
              <button type="button" onClick={() => setSelectedAgingEntry(null)} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
                Close
              </button>
            </header>
            <dl className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2">
              {(selectedAgingEntry.details || []).map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
                  <dd className="mt-1 break-words text-sm font-medium text-slate-900">{value || '-'}</dd>
                </div>
              ))}
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Days past due</dt>
                <dd className="mt-1 text-sm font-medium text-slate-900">{selectedAgingEntry.daysPastDue === null ? '-' : selectedAgingEntry.daysPastDue <= 0 ? 'Not due' : num(selectedAgingEntry.daysPastDue)}</dd>
              </div>
              {AGING_BUCKETS.map(({ key, label }) => selectedAgingEntry[key] > 0 && (
                <div key={key}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
                  <dd className="mt-1 text-sm font-medium text-slate-900">{peso(selectedAgingEntry[key])}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      )}
    </div>
  );
};

export default Reports;
