import React, { useCallback, useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, CalendarDays, FileClock, Plus, Search } from 'lucide-react';
import { useRealtimeSubscription } from '../../../hooks/useRealtimeSubscription';
import { supabase } from '../../../lib/supabase';
import { toDateString } from '../../../lib/dashboardAccounting';
import { getDataLoadErrorMessage } from '../../../lib/errorHandler';

const TransactionList = ({ onNewTransaction, onViewTransaction }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchTransactions = useCallback(async () => {
    setError('');
    try {
      const results = await Promise.all([
        supabase
          .from('cash_receipts')
          .select('id, receipt_date, receipt_number, received_from, member_id, amount, payment_method, description, status, void_reason, voided_at, journal_entry_id, accountAllocations:cash_receipt_lines(amount, side, description, account:chart_of_accounts(account_name))')
          .order('receipt_date', { ascending: false }),
        supabase
          .from('cash_disbursements')
          .select('id, disbursement_date, voucher_number, payee, amount, payment_method, description, journal_entry_id, status, accountAllocations:cash_disbursement_lines(amount, description, account:chart_of_accounts(account_name))')
          .order('disbursement_date', { ascending: false }),
        supabase
          .from('member_dividend_distributions')
          .select('id, member_id, reference_number, distribution_date, dividend_amount, patronage_amount, mortuary_deduction, retention_amount, savings_amount, loan_payment_amount, member:members(first_name, middle_name, last_name)')
          .order('distribution_date', { ascending: false }),
        supabase
          .from('sales_orders')
          .select('id, order_date, order_number, customer_name, total_amount, net_amount, amount_paid, payment_status, cash_receipt_id, cash_receipt:cash_receipts(receipt_number, status), notes, sales_order_items(item_description, quantity, product:products(product_name))')
          .order('order_date', { ascending: false })
      ]);
      const [receiptsResult, disbursementsResult, dividendsResult, salesResult] = results;

      const queryErrors = [
        ['cash receipts', receiptsResult.error],
        ['cash disbursements', disbursementsResult.error],
        ['dividend distributions', dividendsResult.error],
        ['sales', salesResult.error]
      ].filter(([, queryError]) => queryError);
      if (queryErrors.length > 0) {
        queryErrors.forEach(([source, queryError]) => {
          console.error(`Unable to load ${source}:`, queryError);
        });
        throw new Error('One or more transaction requests failed.');
      }

      const sales = (salesResult.data || []).map((sale) => {
        const item = sale.sales_order_items?.[0];
        const product = Array.isArray(item?.product) ? item.product[0] : item?.product;
        const linkedReceipt = Array.isArray(sale.cash_receipt) ? sale.cash_receipt[0] : sale.cash_receipt;
        return {
          id: sale.id,
          date: sale.order_date,
          referenceNo: sale.order_number,
          repCvNumber: sale.order_number,
          particulars: `${item?.item_description || product?.product_name || 'Sale'}${sale.cash_receipt_id ? '' : ` · paid ₱${Number(sale.amount_paid || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })} of ₱${Number(sale.net_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}`,
          lineDescription: item?.item_description || product?.product_name || 'Sale',
          quantity: Number(item?.quantity) || 1,
          member: sale.customer_name,
          type: 'sale',
          transactionType: 'Sales',
          amount: Number(sale.total_amount) || 0,
          invoiceTotal: Number(sale.net_amount) || Number(sale.total_amount) || 0,
          amountPaid: Number(sale.amount_paid) || 0,
          status: sale.payment_status === 'cancelled'
            ? 'Voided'
            : ['pending', 'partial'].includes(sale.payment_status) ? 'Credit' : 'Recorded',
          paymentStatus: sale.payment_status,
          cashReceiptId: sale.cash_receipt_id,
          receiptNumber: linkedReceipt?.receipt_number || null,
          readOnly: false
        };
      });

      const receipts = (receiptsResult.data || []).map((receipt) => ({
        id: receipt.id,
        date: receipt.receipt_date,
        referenceNo: receipt.receipt_number,
        repCvNumber: receipt.receipt_number,
        particulars: `${receipt.description}${receipt.received_from ? ` - ${receipt.received_from}` : ''}`,
        member: receipt.received_from,
        paymentMethod: receipt.payment_method,
        type: 'cash-receipt',
        transactionType: 'Receipt',
        amount: Number(receipt.amount) || 0,
        status: receipt.status === 'draft' ? 'Draft' : receipt.status === 'void' ? 'Voided' : 'Recorded',
        memberId: receipt.member_id,
        voidReason: receipt.void_reason,
        voidedAt: receipt.voided_at,
        journalEntryId: receipt.journal_entry_id,
        readOnly: false,
        accountAllocations: (receipt.accountAllocations || []).map((line) => ({
          account: Array.isArray(line.account) ? line.account[0]?.account_name : line.account?.account_name,
          amount: Number(line.amount) || 0,
          side: line.side,
          description: line.description || ''
        }))
      }));
      const saleReceiptIds = new Set((salesResult.data || []).map((sale) => sale.cash_receipt_id).filter(Boolean));
      const visibleReceipts = receipts.filter((receipt) => !saleReceiptIds.has(receipt.id));

      const disbursements = (disbursementsResult.data || []).map((disbursement) => ({
        id: disbursement.id,
        date: disbursement.disbursement_date,
        referenceNo: disbursement.voucher_number,
        repCvNumber: disbursement.voucher_number,
        particulars: `${disbursement.description || ''}${disbursement.payee ? ` - ${disbursement.payee}` : ''}`,
        member: disbursement.payee,
        paymentMethod: disbursement.payment_method,
        type: 'cash-disbursement',
        transactionType: 'Disbursement',
        amount: Number(disbursement.amount) || 0,
        paymentAmount: Number(disbursement.amount) || 0,
        status: disbursement.status === 'draft' ? 'Draft' : disbursement.status === 'void' ? 'Voided' : 'Recorded',
        journalEntryId: disbursement.journal_entry_id,
        accountAllocations: (disbursement.accountAllocations || []).map((line) => ({
          account: Array.isArray(line.account) ? line.account[0]?.account_name : line.account?.account_name,
          amount: Number(line.amount) || 0,
          side: 'debit'
        }))
      }));

      const dividends = (dividendsResult.data || []).map((distribution) => {
        const member = Array.isArray(distribution.member) ? distribution.member[0] : distribution.member;
        const name = [member?.first_name, member?.middle_name, member?.last_name].filter(Boolean).join(' ');
        return {
          id: distribution.id,
          date: distribution.distribution_date,
          referenceNo: distribution.reference_number,
          repCvNumber: distribution.reference_number,
          particulars: `${name || 'Member'} — approved dividend and patronage distribution`,
          member: name,
          type: 'dividend-distribution',
          transactionType: 'Dividend',
          amount: Number(distribution.dividend_amount) + Number(distribution.patronage_amount),
          status: 'Recorded',
          readOnly: true
        };
      });

      setTransactions([...visibleReceipts, ...disbursements, ...dividends, ...sales].sort((first, second) => new Date(second.date) - new Date(first.date)));
    } catch (fetchError) {
      setError(getDataLoadErrorMessage(fetchError, 'transactions'));
    } finally {
      setLoading(false);
    }
  }, []);

  const retryFetchTransactions = () => {
    setLoading(true);
    fetchTransactions();
  };

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useRealtimeSubscription('cash_receipts', fetchTransactions, null, [fetchTransactions]);
  useRealtimeSubscription('cash_disbursements', fetchTransactions, null, [fetchTransactions]);
  useRealtimeSubscription('member_dividend_distributions', fetchTransactions, null, [fetchTransactions]);
  useRealtimeSubscription('sales_orders', fetchTransactions, null, [fetchTransactions]);

  const today = toDateString(new Date());
  const todayTransactions = transactions.filter((transaction) => transaction.date === today).length;
  const totalReceipts = transactions.filter((transaction) =>
    (transaction.transactionType === 'Receipt'
      || (transaction.transactionType === 'Sales' && transaction.receiptNumber))
      && transaction.status === 'Recorded'
  ).reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalDisbursements = transactions.filter((transaction) => transaction.transactionType === 'Disbursement' && transaction.status === 'Recorded').reduce((sum, transaction) => sum + transaction.amount, 0);
  const draftCount = transactions.filter((transaction) => transaction.status === 'Draft').length;

  const getStatusColor = (status) => {
    switch (status) {
      case 'Draft':
        return 'bg-gray-100 text-gray-700';
      case 'Recorded':
        return 'bg-green-100 text-green-700';
      case 'Voided':
        return 'bg-red-100 text-red-700';
      case 'Credit':
        return 'bg-amber-100 text-amber-800';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const filteredTransactions = transactions.filter(txn => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = (txn.referenceNo || '').toLowerCase().includes(query) ||
                         txn.receiptNumber?.toLowerCase().includes(query) ||
                         txn.particulars.toLowerCase().includes(query);
    const matchesType = filterType === 'all' || txn.transactionType === filterType;
    const matchesStatus = filterStatus === 'all' || txn.status === filterStatus;
    return matchesSearch && matchesType && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="relative overflow-hidden rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4 shadow-sm lg:p-5">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs font-extrabold uppercase tracking-wider text-blue-800">Today's Transactions</p><p className="mt-3 text-3xl font-extrabold tabular-nums text-blue-950">{loading ? '...' : todayTransactions}</p><p className="mt-1 text-xs font-medium text-blue-700">Activity for selected day</p></div>
            <span className="grid size-11 place-items-center rounded-xl bg-blue-700 text-white shadow-sm"><CalendarDays size={21} aria-hidden="true" /></span>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm lg:p-5">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs font-extrabold uppercase tracking-wider text-emerald-800">Total Receipts</p><p className="mt-3 text-2xl font-extrabold tabular-nums text-emerald-700 lg:text-3xl">{loading ? '...' : `₱${totalReceipts.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}</p><p className="mt-1 text-xs font-medium text-emerald-700">Recorded incoming funds</p></div>
            <span className="grid size-11 place-items-center rounded-xl bg-emerald-600 text-white shadow-sm"><ArrowDownToLine size={21} aria-hidden="true" /></span>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-4 shadow-sm lg:p-5">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs font-extrabold uppercase tracking-wider text-rose-800">Total Disbursements</p><p className="mt-3 text-2xl font-extrabold tabular-nums text-rose-700 lg:text-3xl">{loading ? '...' : `₱${totalDisbursements.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}</p><p className="mt-1 text-xs font-medium text-rose-700">Recorded outgoing funds</p></div>
            <span className="grid size-11 place-items-center rounded-xl bg-rose-600 text-white shadow-sm"><ArrowUpFromLine size={21} aria-hidden="true" /></span>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm lg:p-5">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs font-extrabold uppercase tracking-wider text-amber-800">Draft Transactions</p><p className="mt-3 text-3xl font-extrabold tabular-nums text-amber-950">{loading ? '...' : draftCount}</p><p className="mt-1 text-xs font-medium text-amber-800">Awaiting completion</p></div>
            <span className="grid size-11 place-items-center rounded-xl bg-amber-500 text-white shadow-sm"><FileClock size={21} aria-hidden="true" /></span>
          </div>
        </div>
      </div>

      {/* Actions and Filters */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white p-4 sm:flex-row sm:items-center sm:justify-between lg:p-6">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-700">Bookkeeping activity</p>
            <h2 className="mt-1 text-xl font-extrabold tracking-tight text-slate-950 lg:text-2xl">Transaction List</h2>
            <p className="mt-1 text-sm text-slate-600">Search, filter, and review receipts, disbursements, sales, and dividends.</p>
          </div>
          <button
            onClick={onNewTransaction}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-700 to-purple-600 px-5 py-2 text-sm font-extrabold text-white shadow-md shadow-purple-900/15 transition hover:from-violet-800 hover:to-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:ring-offset-2 lg:text-base"
          >
            <Plus className="size-5" aria-hidden="true" />
            New Transaction
          </button>
        </div>

        {/* Search and Filters */}
        <div className="grid grid-cols-1 gap-3 border-b border-slate-100 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_1fr_1fr] lg:p-5">
          <label className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-300 px-3 py-2 transition focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-600/15 sm:col-span-2 lg:col-span-1">
            <Search className="size-4 shrink-0 text-purple-700" aria-hidden="true" />
            <span className="sr-only">Search transactions</span>
            <input
              type="text"
              placeholder="Search transaction number, member, description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full min-w-0 border-0 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:ring-0 lg:text-base"
            />
          </label>
          <>
            <select
              aria-label="Filter by transaction type"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-600/15 lg:text-base"
            >
              <option value="all">All Types</option>
              <option value="Receipt">Receipt</option>
              <option value="Disbursement">Disbursement</option>
              <option value="Sales">Sales</option>
              <option value="Dividend">Dividend</option>
            </select>
            <select
              aria-label="Filter by transaction status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-600/15 lg:text-base"
            >
              <option value="all">All Status</option>
              <option value="Draft">Draft</option>
              <option value="Recorded">Recorded</option>
              <option value="Credit">Credit</option>
              <option value="Voided">Voided</option>
            </select>
          </>
        </div>

        {/* Transaction Table */}
        {error && (
          <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <span>{error}</span>
            <button
              type="button"
              onClick={retryFetchTransactions}
              disabled={loading}
              className="font-semibold underline underline-offset-2 disabled:opacity-60"
            >
              {loading ? 'Retrying…' : 'Try again'}
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full align-middle">
            <table className="min-w-[900px] w-full">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-5 py-3.5 text-left text-[11px] font-extrabold uppercase tracking-wider text-slate-600">Date</th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-extrabold uppercase tracking-wider text-slate-600">Reference No.</th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-extrabold uppercase tracking-wider text-slate-600">Particulars</th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-extrabold uppercase tracking-wider text-slate-600">Type</th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-extrabold uppercase tracking-wider text-slate-600">Amount</th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-extrabold uppercase tracking-wider text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTransactions.map((txn) => (
                  <tr 
                    key={txn.id} 
                    onClick={txn.readOnly ? undefined : () => onViewTransaction(txn)}
                    className={`transition-colors ${txn.readOnly ? 'bg-indigo-50/40' : 'cursor-pointer hover:bg-violet-50/60'} even:bg-slate-50/30`}
                  >
                    <td className="whitespace-nowrap px-5 py-4 text-sm font-medium tabular-nums text-slate-700">{new Date(`${txn.date}T00:00:00`).toLocaleDateString('en-PH')}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm font-extrabold text-violet-800">
                      <span className="rounded-md bg-violet-50 px-2 py-1 ring-1 ring-inset ring-violet-100">{txn.referenceNo}</span>
                      {txn.receiptNumber && txn.receiptNumber !== txn.referenceNo && (
                        <span className="mt-1.5 block text-xs font-bold text-emerald-700">Official receipt · {txn.receiptNumber}</span>
                      )}
                    </td>
                    <td className="max-w-md px-5 py-4 text-sm font-semibold text-slate-900">{txn.particulars}</td>
                    <td className="whitespace-nowrap px-5 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
                        txn.transactionType === 'Receipt' ? 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200'
                          : txn.transactionType === 'Disbursement' ? 'bg-rose-50 text-rose-800 ring-1 ring-inset ring-rose-200'
                            : txn.transactionType === 'Sales' ? 'bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-200'
                              : 'bg-violet-50 text-violet-800 ring-1 ring-inset ring-violet-200'
                      }`}>{txn.transactionType}</span>
                    </td>
                    <td className={`whitespace-nowrap px-5 py-4 text-right text-sm font-extrabold tabular-nums ${
                      txn.transactionType === 'Disbursement' ? 'text-rose-700' : 'text-emerald-700'
                    }`}>
                      ₱{txn.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ring-current/10 ${getStatusColor(txn.status)}`}>
                        {txn.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {!loading && !error && filteredTransactions.length === 0 && (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="mt-4 text-sm text-gray-600">{loading ? 'Loading transactions...' : 'No transactions found'}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactionList;
