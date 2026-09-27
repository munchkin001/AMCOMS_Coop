import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const BookkeeperDashboard = () => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState({
    cashOnHand: 0,
    cashInBank: 0,
    todayReceipts: 0,
    todayDisbursements: 0,
    pendingEntries: 0
  });

  useEffect(() => {
    fetchDashboardData();
  }, [selectedDate]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // Fetch today's cash receipts
      const { data: receiptsData } = await supabase
        .from('cash_receipts')
        .select('amount')
        .eq('receipt_date', selectedDate);

      const todayReceipts = receiptsData?.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0) || 0;

      // Fetch today's cash disbursements
      const { data: disbursementsData } = await supabase
        .from('cash_disbursements')
        .select('amount')
        .eq('disbursement_date', selectedDate);

      const todayDisbursements = disbursementsData?.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0) || 0;

      // Fetch pending journal entries (draft status)
      const { count: pendingEntries } = await supabase
        .from('journal_entries')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'draft');

      // For cash on hand and cash in bank, we'd normally calculate from chart of accounts
      // For now, setting to 0 until proper calculation is implemented
      setDashboardData({
        cashOnHand: 0,
        cashInBank: 0,
        todayReceipts,
        todayDisbursements,
        pendingEntries: pendingEntries || 0
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const summaryCards = [
    { label: 'Cash on Hand', amount: dashboardData.cashOnHand, sublabel: 'Current recorded balance', icon: '💵', color: 'blue' },
    { label: 'Cash in Bank', amount: dashboardData.cashInBank, sublabel: 'Current recorded balance', icon: '🏦', color: 'green' },
    { label: "Today's Receipts", amount: dashboardData.todayReceipts, sublabel: 'Total recorded cash receipts today', icon: '📈', color: 'emerald' },
    { label: "Today's Disbursements", amount: dashboardData.todayDisbursements, sublabel: 'Total recorded cash disbursements today', icon: '📉', color: 'red' },
    { label: 'Pending Entries', amount: dashboardData.pendingEntries, sublabel: 'Transactions awaiting review/completion', icon: '⏳', color: 'amber', isCount: true }
  ];

  const recentTransactions = [];

  const getColorClasses = (color) => {
    const colors = {
      blue: 'bg-blue-50 border-blue-200',
      green: 'bg-green-50 border-green-200',
      emerald: 'bg-emerald-50 border-emerald-200',
      red: 'bg-red-50 border-red-200',
      amber: 'bg-amber-50 border-amber-200'
    };
    return colors[color] || colors.blue;
  };

  const changeDate = (days) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + days);
    setSelectedDate(current.toISOString().split('T')[0]);
  };

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Good morning, Bookkeeper</h2>
        <p className="text-gray-600 mt-1">Here's the cooperative's bookkeeping activity for today.</p>
        
        {/* Date Selector */}
        <div className="flex items-center space-x-3 mt-4">
          <button
            onClick={() => changeDate(-1)}
            className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 font-medium"
            />
          </div>
          <button
            onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
          >
            Today
          </button>
          <button
            onClick={() => changeDate(1)}
            className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {summaryCards.map((card, idx) => (
          <div key={idx} className={`rounded-lg border p-4 ${getColorClasses(card.color)}`}>
            <div className="flex items-start justify-between mb-2">
              <p className="text-xs font-medium text-gray-600 uppercase">{card.label}</p>
              <span className="text-2xl">{card.icon}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {card.isCount ? card.amount.toLocaleString() : `₱${card.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </p>
            <p className="text-xs text-gray-500 mt-1">{card.sublabel}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <button
            onClick={() => setShowTransactionModal(true)}
            className="flex flex-col items-center justify-center p-4 border-2 border-purple-300 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
          >
            <svg className="w-8 h-8 text-purple-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-sm font-medium text-gray-900">New Transaction</span>
          </button>
          <button className="flex flex-col items-center justify-center p-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            <svg className="w-8 h-8 text-green-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 8h6m-5 0a3 3 0 110 6H9l3 3m-3-6h6m6 1a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-medium text-gray-900">Cash Receipt</span>
          </button>
          <button className="flex flex-col items-center justify-center p-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            <svg className="w-8 h-8 text-red-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className="text-sm font-medium text-gray-900">Cash Disbursement</span>
          </button>
          <button className="flex flex-col items-center justify-center p-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            <svg className="w-8 h-8 text-blue-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span className="text-sm font-medium text-gray-900">Upload Document</span>
          </button>
          <button className="flex flex-col items-center justify-center p-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            <svg className="w-8 h-8 text-gray-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span className="text-sm font-medium text-gray-900">View Today's Book</span>
          </button>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Recent Transactions</h3>
          <button 
            onClick={() => alert('Navigate to the Books or Transactions section using the sidebar menu to view detailed transaction records.')}
            className="text-sm text-purple-600 hover:text-purple-700 font-medium cursor-pointer"
          >
            View All Transactions →
          </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          {loading || recentTransactions.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm">No transactions recorded for {selectedDate}</p>
              <p className="text-xs mt-1">Create a new transaction to get started</p>
            </div>
          ) : (
            <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-6 font-semibold text-gray-700 text-sm">Date</th>
                <th className="text-left py-3 px-6 font-semibold text-gray-700 text-sm">Particulars</th>
                <th className="text-left py-3 px-6 font-semibold text-gray-700 text-sm">Ref/CV #</th>
                <th className="text-left py-3 px-6 font-semibold text-gray-700 text-sm">Type</th>
                <th className="text-right py-3 px-6 font-semibold text-gray-700 text-sm">Amount</th>
                <th className="text-center py-3 px-6 font-semibold text-gray-700 text-sm">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentTransactions.map((transaction, idx) => (
                <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-6 text-sm text-gray-900">{transaction.date}</td>
                  <td className="py-3 px-6 text-sm text-gray-900 font-medium">{transaction.particulars}</td>
                  <td className="py-3 px-6 text-sm text-gray-600 font-mono">{transaction.refNo}</td>
                  <td className="py-3 px-6">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                      transaction.type === 'Cash Receipt' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {transaction.type}
                    </span>
                  </td>
                  <td className="py-3 px-6 text-sm text-right font-semibold text-gray-900">
                    ₱{transaction.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-6 text-center">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                      transaction.status === 'Recorded' 
                        ? 'bg-blue-100 text-blue-800' 
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {transaction.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      </div>

      {/* Transaction Selection Modal */}
      {showTransactionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900">New Transaction</h3>
                <button
                  onClick={() => setShowTransactionModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-gray-600 mt-2">What type of transaction would you like to record?</p>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { title: 'Cash Receipt', desc: 'Money received by the cooperative', icon: '💵', color: 'green' },
                  { title: 'Cash Disbursement', desc: 'Money paid out by the cooperative', icon: '💸', color: 'red' },
                  { title: 'Sales', desc: 'Record a sale or income-generating transaction', icon: '🛒', color: 'blue' },
                  { title: 'Loan Payment', desc: 'Record payment received from a borrower', icon: '💰', color: 'purple' },
                  { title: 'Savings / Deposit', desc: 'Record savings or time-deposit transactions', icon: '🏦', color: 'teal' },
                  { title: 'Other Transaction', desc: 'For transactions that don\'t fall under common categories', icon: '📋', color: 'gray' }
                ].map((type, idx) => (
                  <button
                    key={idx}
                    className="flex items-start space-x-4 p-4 border-2 border-gray-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-all text-left"
                  >
                    <span className="text-3xl">{type.icon}</span>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">{type.title}</p>
                      <p className="text-sm text-gray-600 mt-1">{type.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookkeeperDashboard;
