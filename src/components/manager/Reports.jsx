import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

const REPORTS = {
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

const DataTable = ({ columns, rows, empty = 'No records for this period.', footer }) => (
  <div className="overflow-x-auto">
    <table className="w-full border-collapse text-left text-xs">
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
          <tr key={row.id || i} className="odd:bg-white even:bg-slate-50">
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
              <td key={i} className={`border border-slate-300 px-2 py-1.5 ${i > 0 ? 'text-right tabular-nums' : ''}`}>{cell}</td>
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
  const [reportType, setReportType] = useState('financial');
  const [period, setPeriod] = useState('monthly');
  const [anchor, setAnchor] = useState(iso(new Date()));
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generatedAt, setGeneratedAt] = useState(new Date());

  const range = useMemo(() => getRange(period, anchor), [period, anchor]);

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
    { table: 'members', onUpdate: load },
    { table: 'savings_accounts', onUpdate: load },
    { table: 'products', onUpdate: load },
    { table: 'stock_inventory', onUpdate: load },
    { table: 'stock_movements', onUpdate: load }
  ], [load]);

  const meta = REPORTS[reportType];
  const periodLabel = range.from === range.to ? fmtDate(range.from) : `${fmtDate(range.from)} to ${fmtDate(range.to)}`;

  const renderBody = () => {
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
          @page { size: A4; margin: 14mm; }
          body * { visibility: hidden !important; }
          #report-print, #report-print * { visibility: visible !important; }
          #report-print { position: absolute; left: 0; top: 0; width: 100%; border: 0 !important; box-shadow: none !important; padding: 0 !important; }
          .break-inside-avoid-page { break-inside: avoid; }
          thead { display: table-header-group; }
        }
      `}</style>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Report Generator</h2>
            <p className="mt-0.5 text-sm text-gray-500">Figures update automatically as records change.</p>
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
          <div className="flex items-end gap-2">
            <button type="button" onClick={() => { setLoading(true); load(); }} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <RefreshCw size={16} /> Refresh
            </button>
            <button type="button" onClick={() => window.print()} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
              <Printer size={16} /> Print
            </button>
          </div>
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      <article id="report-print" className="mx-auto max-w-5xl rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-10">
        <header className="border-b-4 border-double border-slate-800 pb-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">Agay-ayan Multi-Purpose Cooperative</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{meta.title}</h1>
          <p className="mt-1 text-sm text-slate-700">{meta.blurb}</p>
          <p className="mt-3 text-sm font-medium text-slate-800">Period covered: {periodLabel}</p>
          <p className="text-xs text-slate-500">Generated {generatedAt.toLocaleString('en-PH')}</p>
        </header>

        <div className="mt-6">
          {loading ? <p className="py-12 text-center text-sm text-slate-500">Generating report...</p> : renderBody()}
        </div>

        <footer className="mt-16 grid grid-cols-2 gap-10 text-center text-xs text-slate-700">
          <div><div className="border-t border-slate-800 pt-1">Prepared by</div></div>
          <div><div className="border-t border-slate-800 pt-1">Noted by (Manager)</div></div>
        </footer>
      </article>
    </div>
  );
};

export default Reports;
