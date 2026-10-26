import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';

const peso = (value) => `₱${(Number(value) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const sameDay = (iso) => iso && new Date(iso).toDateString() === new Date().toDateString();

const OperationsMonitoring = () => {
  const [activeTab, setActiveTab] = useState('loans');
  const [loans, setLoans] = useState([]);
  const [overdueLoanIds, setOverdueLoanIds] = useState(0);
  const [loanActivity, setLoanActivity] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [savingsTx, setSavingsTx] = useState([]);
  const [stock, setStock] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadLoans = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const [loanRes, overdueRes, payRes] = await Promise.all([
      supabase.from('loans').select('id, status, balance, principal_amount'),
      supabase.from('loan_schedule').select('loan_id').neq('status', 'paid').lt('due_date', today),
      supabase.from('loan_payments').select('id, amount_paid, payment_date, created_at, loan:loans(loan_number, member:members(first_name, last_name))').eq('status', 'recorded').order('created_at', { ascending: false }).limit(8)
    ]);
    setLoans(loanRes.data || []);
    setOverdueLoanIds(new Set((overdueRes.data || []).map((row) => row.loan_id)).size);
    setLoanActivity(payRes.data || []);
    setLastUpdated(new Date());
  }, []);

  const loadSavings = useCallback(async () => {
    const weekAhead = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const [accRes, txRes] = await Promise.all([
      supabase.from('savings_accounts').select('id, account_type, balance, status, closing_date, created_at'),
      supabase.from('savings_transactions').select('id, transaction_type, amount, created_at, transaction_date').eq('status', 'recorded').order('created_at', { ascending: false }).limit(200)
    ]);
    setAccounts((accRes.data || []).map((a) => ({ ...a, maturing: a.closing_date && a.closing_date <= weekAhead })));
    setSavingsTx(txRes.data || []);
    setLastUpdated(new Date());
  }, []);

  const loadStock = useCallback(async () => {
    const { data } = await supabase
      .from('products')
      .select('id, product_name, unit_of_measure, reorder_level, minimum_stock, is_active, stock:stock_inventory(quantity_on_hand)')
      .eq('is_active', true)
      .order('product_name');
    setStock((data || []).map((p) => {
      const rows = Array.isArray(p.stock) ? p.stock : p.stock ? [p.stock] : [];
      const qty = rows.reduce((sum, r) => sum + (Number(r.quantity_on_hand) || 0), 0);
      const threshold = Number(p.reorder_level || p.minimum_stock) || 0;
      return { ...p, qty, status: qty <= 0 ? 'out' : qty <= threshold ? 'low' : 'ok' };
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

  const activeLoans = loans.filter((l) => l.status === 'active');
  const activeLoanTotal = activeLoans.reduce((s, l) => s + (Number(l.balance) || 0), 0);
  const pendingLoans = loans.filter((l) => l.status === 'pending').length;
  const paidLoans = loans.filter((l) => l.status === 'completed').length;

  const savingsAccounts = accounts.filter((a) => a.account_type !== 'time_deposit' && a.status !== 'closed');
  const timeDeposits = accounts.filter((a) => a.account_type === 'time_deposit' && a.status !== 'closed');
  const sum = (rows) => rows.reduce((s, a) => s + (Number(a.balance) || 0), 0);
  const todayTx = savingsTx.filter((t) => sameDay(t.created_at));
  const deposits = todayTx.filter((t) => /deposit/i.test(t.transaction_type)).length;
  const withdrawals = todayTx.filter((t) => /withdraw/i.test(t.transaction_type)).length;
  const weekAgo = Date.now() - 7 * 86400000;

  const available = stock.filter((s) => s.status === 'ok').length;
  const lowStock = stock.filter((s) => s.status === 'low');
  const outStock = stock.filter((s) => s.status === 'out');
  const attention = [...outStock, ...lowStock, ...stock.filter((s) => s.status === 'ok')].slice(0, 12);
  return (
    <div className="space-y-6">
      <p className="text-right text-xs text-gray-500"><span className="mr-1 inline-block size-2 rounded-full bg-green-500" />Live{lastUpdated ? ` - updated ${lastUpdated.toLocaleTimeString()}` : ''}</p>
      {/* Tabs */}
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('loans')}
            className={`flex-1 px-6 py-4 font-medium transition-colors ${
              activeTab === 'loans'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Loan Monitoring
          </button>
          <button
            onClick={() => setActiveTab('savings')}
            className={`flex-1 px-6 py-4 font-medium transition-colors ${
              activeTab === 'savings'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Savings & Time Deposits
          </button>
          <button
            onClick={() => setActiveTab('inventory')}
            className={`flex-1 px-6 py-4 font-medium transition-colors ${
              activeTab === 'inventory'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Inventory Monitoring
          </button>
        </div>
      </div>

      {/* Loan Monitoring */}
      {activeTab === 'loans' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <p className="text-sm font-medium text-gray-600 mb-2">Active Loans</p>
              <p className="text-3xl font-bold text-blue-600">{activeLoans.length}</p>
              <p className="text-xs text-gray-500 mt-1">{peso(activeLoanTotal)} outstanding</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <p className="text-sm font-medium text-gray-600 mb-2">Pending Loans</p>
              <p className="text-3xl font-bold text-yellow-600">{pendingLoans}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <p className="text-sm font-medium text-gray-600 mb-2">Paid Loans</p>
              <p className="text-3xl font-bold text-green-600">{paidLoans}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <p className="text-sm font-medium text-gray-600 mb-2">Overdue Loans</p>
              <p className="text-3xl font-bold text-red-600">{overdueLoanIds}</p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Loan Activity</h3>
            <div className="space-y-3">
              {loanActivity.length === 0 && <p className="text-sm text-gray-500">No loan payments recorded yet.</p>}
              {loanActivity.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{[p.loan?.member?.first_name, p.loan?.member?.last_name].filter(Boolean).join(' ') || 'Member'} - Loan Payment{p.loan?.loan_number ? ` (${p.loan.loan_number})` : ''}</p>
                    <p className="text-xs text-gray-500">{new Date(p.created_at || p.payment_date).toLocaleString()}</p>
                  </div>
                  <span className="text-sm font-semibold text-green-600">{peso(p.amount_paid)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Savings & Time Deposits */}
      {activeTab === 'savings' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Savings */}
            <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Savings Overview</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                  <span className="text-sm text-gray-700">Total Savings</span>
                  <span className="text-lg font-bold text-green-600">{peso(sum(savingsAccounts))}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-700">Active Accounts</span>
                  <span className="text-lg font-bold text-gray-900">{savingsAccounts.length}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-700">Recent Deposits</span>
                  <span className="text-lg font-bold text-blue-600">{deposits} today</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-700">Recent Withdrawals</span>
                  <span className="text-lg font-bold text-orange-600">{withdrawals} today</span>
                </div>
              </div>
            </div>

            {/* Time Deposits */}
            <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Time Deposits Overview</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg">
                  <span className="text-sm text-gray-700">Total Time Deposits</span>
                  <span className="text-lg font-bold text-purple-600">{peso(sum(timeDeposits))}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-700">Active Deposits</span>
                  <span className="text-lg font-bold text-gray-900">{timeDeposits.length}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-700">Maturing This Week</span>
                  <span className="text-lg font-bold text-yellow-600">{timeDeposits.filter((a) => a.maturing).length}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-700">Recent Placements</span>
                  <span className="text-lg font-bold text-blue-600">{timeDeposits.filter((a) => a.created_at && new Date(a.created_at).getTime() >= weekAgo).length} this week</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inventory Monitoring */}
      {activeTab === 'inventory' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <p className="text-sm font-medium text-gray-600 mb-2">Total Products</p>
              <p className="text-3xl font-bold text-gray-900">{stock.length}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <p className="text-sm font-medium text-gray-600 mb-2">Available Stock</p>
              <p className="text-3xl font-bold text-green-600">{available}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <p className="text-sm font-medium text-gray-600 mb-2">Low Stock</p>
              <p className="text-3xl font-bold text-yellow-600">{lowStock.length}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <p className="text-sm font-medium text-gray-600 mb-2">Out of Stock</p>
              <p className="text-3xl font-bold text-red-600">{outStock.length}</p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Stock Status</h3>
            <div className="space-y-3">
              {attention.length === 0 && <p className="text-sm text-gray-500">No products yet.</p>}
              {attention.map((p) => {
                const tone = { out: ['bg-red-50 border-red-200', 'bg-red-100 text-red-800', 'OUT OF STOCK'], low: ['bg-yellow-50 border-yellow-200', 'bg-yellow-100 text-yellow-800', 'LOW STOCK'], ok: ['bg-green-50 border-green-200', 'bg-green-100 text-green-800', 'IN STOCK'] }[p.status];
                return (
                  <div key={p.id} className={`flex items-center justify-between p-4 border rounded-lg ${tone[0]}`}>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.product_name}</p>
                      <p className="text-xs text-gray-600">Current Stock: {p.qty} {p.unit_of_measure || ''}</p>
                    </div>
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full ${tone[1]}`}>{tone[2]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OperationsMonitoring;
