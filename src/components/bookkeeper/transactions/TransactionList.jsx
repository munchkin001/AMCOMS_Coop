import React, { useCallback, useEffect, useState } from 'react';
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
          .select('id, receipt_date, receipt_number, received_from, amount, payment_method, description, status, journal_entry_id, accountAllocations:cash_receipt_lines(amount, side, description, account:chart_of_accounts(account_name))')
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
          .select('id, order_date, order_number, customer_name, total_amount, net_amount, amount_paid, payment_status, cash_receipt_id, notes, sales_order_items(item_description, quantity, product:products(product_name))')
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
        return {
          id: sale.id,
          date: sale.order_date,
          referenceNo: sale.order_number,
          repCvNumber: sale.order_number,
          particulars: `${item?.item_description || product?.product_name || 'Sale'} × ${item?.quantity || 1} — ${sale.customer_name || 'Customer'}${sale.cash_receipt_id ? '' : ` · paid ₱${Number(sale.amount_paid || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })} of ₱${Number(sale.net_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}`,
          member: sale.customer_name,
          type: 'sale',
          transactionType: 'Sales',
          amount: Number(sale.total_amount) || 0,
          status: ['pending', 'partial'].includes(sale.payment_status) ? 'Credit' : 'Recorded',
          paymentStatus: sale.payment_status,
          cashReceiptId: sale.cash_receipt_id,
          readOnly: true
        };
      });
      const saleReceiptIds = new Set((salesResult.data || []).map((sale) => sale.cash_receipt_id).filter(Boolean));

      const receipts = (receiptsResult.data || []).filter((receipt) => !saleReceiptIds.has(receipt.id)).map((receipt) => ({
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
        journalEntryId: receipt.journal_entry_id,
        readOnly: receipt.description?.startsWith('Collection for sale ') || false,
        accountAllocations: (receipt.accountAllocations || []).map((line) => ({
          account: Array.isArray(line.account) ? line.account[0]?.account_name : line.account?.account_name,
          amount: Number(line.amount) || 0,
          side: line.side
        }))
      }));

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

      setTransactions([...receipts, ...disbursements, ...dividends, ...sales].sort((first, second) => new Date(second.date) - new Date(first.date)));
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
    (transaction.transactionType === 'Receipt' || (transaction.transactionType === 'Sales' && transaction.cashReceiptId))
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
    const matchesSearch = txn.referenceNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         txn.particulars.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || txn.transactionType === filterType;
    const matchesStatus = filterStatus === 'all' || txn.status === filterStatus;
    return matchesSearch && matchesType && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4 lg:p-6">
          <p className="text-xs lg:text-sm text-gray-600 mb-1">Today's Transactions</p>
          <p className="text-2xl lg:text-3xl font-bold text-gray-900">{loading ? '...' : todayTransactions}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 lg:p-6">
          <p className="text-xs lg:text-sm text-gray-600 mb-1">Total Receipts</p>
          <p className="text-2xl lg:text-3xl font-bold text-green-600">{loading ? '...' : `₱${totalReceipts.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 lg:p-6">
          <p className="text-xs lg:text-sm text-gray-600 mb-1">Total Disbursements</p>
          <p className="text-2xl lg:text-3xl font-bold text-red-600">{loading ? '...' : `₱${totalDisbursements.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 lg:p-6">
          <p className="text-xs lg:text-sm text-gray-600 mb-1">Draft Transactions</p>
          <p className="text-2xl lg:text-3xl font-bold text-gray-600">{loading ? '...' : draftCount}</p>
        </div>
      </div>

      {/* Actions and Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 lg:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg lg:text-xl font-semibold text-gray-900">Transaction List</h2>
            <p className="text-xs lg:text-sm text-gray-600 mt-1">View and manage all transactions</p>
          </div>
          <button
            onClick={onNewTransaction}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium text-sm lg:text-base flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Transaction
          </button>
        </div>

        {/* Search and Filters */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <div className="lg:col-span-2">
            <input
              type="text"
              placeholder="Search transaction number, member, description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm lg:text-base focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm lg:text-base"
            >
              <option value="all">All Types</option>
              <option value="Receipt">Receipt</option>
              <option value="Disbursement">Disbursement</option>
              <option value="Sales">Sales</option>
              <option value="Dividend">Dividend</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm lg:text-base"
            >
              <option value="all">All Status</option>
              <option value="Draft">Draft</option>
              <option value="Recorded">Recorded</option>
              <option value="Credit">Credit</option>
            </select>
          </div>
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
        <div className="overflow-x-auto -mx-4 lg:mx-0">
          <div className="inline-block min-w-full align-middle">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Reference No.</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Particulars</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredTransactions.map((txn) => (
                  <tr 
                    key={txn.id} 
                    onClick={txn.readOnly ? undefined : () => onViewTransaction(txn)}
                    className={txn.readOnly ? 'bg-indigo-50/40' : 'hover:bg-gray-50 cursor-pointer'}
                  >
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{new Date(`${txn.date}T00:00:00`).toLocaleDateString('en-PH')}</td>
                    <td className="px-4 py-3 text-sm font-medium text-purple-600 whitespace-nowrap">{txn.referenceNo}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{txn.particulars}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{txn.transactionType}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap font-medium">
                      ₱{txn.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(txn.status)}`}>
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
