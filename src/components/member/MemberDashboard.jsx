import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const MemberDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [memberData, setMemberData] = useState({
    memberId: null,
    totalSavings: 0,
    totalTimeDeposit: 0,
    totalLoanBalance: 0,
    nextPaymentAmount: 0,
    nextPaymentDate: null,
    recentTransactions: [],
    pendingRequests: []
  });

  useEffect(() => {
    fetchMemberData();
  }, []);

  const fetchMemberData = async () => {
    try {
      setLoading(true);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get member details
      const { data: memberInfo } = await supabase
        .from('members')
        .select('member_id')
        .eq('user_id', user.id)
        .single();

      if (!memberInfo) return;

      const memberId = memberInfo.member_id;

      // Fetch total savings
      const { data: savingsAccounts } = await supabase
        .from('savings_accounts')
        .select('balance')
        .eq('member_id', memberId)
        .eq('status', 'active');

      const totalSavings = savingsAccounts?.reduce((sum, acc) => sum + parseFloat(acc.balance || 0), 0) || 0;

      // Fetch total time deposits
      const { data: timeDeposits } = await supabase
        .from('time_deposits')
        .select('amount')
        .eq('member_id', memberId)
        .eq('status', 'active');

      const totalTimeDeposit = timeDeposits?.reduce((sum, td) => sum + parseFloat(td.amount || 0), 0) || 0;

      // Fetch active loans
      const { data: activeLoans } = await supabase
        .from('loans')
        .select('*')
        .eq('member_id', memberId)
        .in('status', ['approved', 'active'])
        .order('created_at', { ascending: false });

      const totalLoanBalance = activeLoans?.reduce((sum, loan) => {
        const balance = parseFloat(loan.loan_amount || 0) - parseFloat(loan.amount_paid || 0);
        return sum + balance;
      }, 0) || 0;

      // Get next payment (assuming monthly payments)
      let nextPaymentAmount = 0;
      let nextPaymentDate = null;
      if (activeLoans && activeLoans.length > 0) {
        const loan = activeLoans[0];
        if (loan.monthly_payment) {
          nextPaymentAmount = parseFloat(loan.monthly_payment);
          // Calculate next payment date (simplified - would need actual payment schedule)
          const today = new Date();
          nextPaymentDate = new Date(today.getFullYear(), today.getMonth() + 1, 10);
        }
      }

      // Fetch recent transactions (savings transactions + loan payments)
      const { data: savingsTransactions } = await supabase
        .from('savings_transactions')
        .select('*, savings_account:savings_accounts(account_number)')
        .eq('savings_accounts.member_id', memberId)
        .order('transaction_date', { ascending: false })
        .limit(5);

      const { data: loanPayments } = await supabase
        .from('loan_payments')
        .select('*, loan:loans(loan_number)')
        .eq('loans.member_id', memberId)
        .order('payment_date', { ascending: false })
        .limit(5);

      // Combine and sort transactions
      const recentTransactions = [];
      
      // Fetch pending loan applications
      const { data: pendingLoans } = await supabase
        .from('loans')
        .select('*')
        .eq('member_id', memberId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      const pendingRequests = pendingLoans || [];

      setMemberData({
        memberId,
        totalSavings,
        totalTimeDeposit,
        totalLoanBalance,
        nextPaymentAmount,
        nextPaymentDate,
        recentTransactions,
        pendingRequests
      });
    } catch (error) {
      console.error('Error fetching member data:', error);
    } finally {
      setLoading(false);
    }
  };

  const announcements = [
    {
      id: 1,
      title: 'Cooperative General Assembly',
      date: 'June 15, 2026',
      excerpt: 'The annual general assembly will be held at the cooperative office. All members are encouraged to attend.'
    },
    {
      id: 2,
      title: 'Updated Interest Rates',
      date: 'June 1, 2026',
      excerpt: 'New interest rates for savings and time deposits will take effect this month.'
    }
  ];

  return (
    <div className="space-y-6">
      {/* My Account Summary - Large Cards */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">My Account Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Savings */}
          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-md p-6 text-white">
            <p className="text-sm font-medium opacity-90">SAVINGS</p>
            <p className="text-3xl font-bold mt-2">
              {loading ? '...' : `₱${memberData.totalSavings.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
            </p>
            <button 
              onClick={() => alert('Navigate to "My Savings" in the sidebar menu to view your complete savings account details and transaction history.')}
              className="mt-4 text-sm font-medium text-white hover:text-green-100 flex items-center space-x-1 cursor-pointer"
            >
              <span>View Account</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Time Deposit */}
          <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg shadow-md p-6 text-white">
            <p className="text-sm font-medium opacity-90">TIME DEPOSIT</p>
            <p className="text-3xl font-bold mt-2">
              {loading ? '...' : `₱${memberData.totalTimeDeposit.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
            </p>
            <button 
              onClick={() => alert('Navigate to "My Savings" in the sidebar menu to view your time deposit account details.')}
              className="mt-4 text-sm font-medium text-white hover:text-indigo-100 flex items-center space-x-1 cursor-pointer"
            >
              <span>View Account</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Loan Balance */}
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-md p-6 text-white">
            <p className="text-sm font-medium opacity-90">LOAN BALANCE</p>
            <p className="text-3xl font-bold mt-2">
              {loading ? '...' : `₱${memberData.totalLoanBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
            </p>
            <button 
              onClick={() => alert('Navigate to "My Loans" in the sidebar menu to view your loan details, payment history, and outstanding balance.')}
              className="mt-4 text-sm font-medium text-white hover:text-orange-100 flex items-center space-x-1 cursor-pointer"
            >
              <span>View Loan</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Next Payment */}
          <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-lg shadow-md p-6 text-white">
            <p className="text-sm font-medium opacity-90">NEXT PAYMENT</p>
            <p className="text-3xl font-bold mt-2">
              {loading ? '...' : memberData.nextPaymentAmount > 0 
                ? `₱${memberData.nextPaymentAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                : '₱0.00'
              }
            </p>
            {memberData.nextPaymentDate && (
              <p className="text-sm opacity-90 mt-1">
                Due: {new Date(memberData.nextPaymentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button 
            onClick={() => alert('Feature Coming Soon!\n\nDeposit functionality will be available soon. For now, please visit your cooperative office to make deposits or contact the treasurer.')}
            className="flex flex-col items-center justify-center p-6 border-2 border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-all cursor-pointer"
          >
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-900">Deposit</span>
          </button>

          <button 
            onClick={() => alert('Feature Coming Soon!\n\nWithdrawal requests will be available soon. For now, please visit your cooperative office or contact the treasurer to process withdrawals.')}
            className="flex flex-col items-center justify-center p-6 border-2 border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-all cursor-pointer"
          >
            <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-900">Withdraw</span>
          </button>

          <button 
            onClick={() => alert('Navigate to "Loan Requests" in the sidebar menu to submit a new loan application.')}
            className="flex flex-col items-center justify-center p-6 border-2 border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-all cursor-pointer"
          >
            <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-900">Apply for Loan</span>
          </button>

          <button 
            onClick={() => alert('Navigate to "Transactions" in the sidebar menu to view all your transaction history.')}
            className="flex flex-col items-center justify-center p-6 border-2 border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-all cursor-pointer"
          >
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-900">View Transactions</span>
          </button>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Requests */}
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Pending Requests</h3>
            <button 
              onClick={() => alert('Navigate to "Loan Requests" in the sidebar menu to view all your loan application requests and their status.')}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer"
            >
              View All
            </button>
          </div>
          <div className="space-y-3">
            {loading ? (
              <div className="p-4 bg-gray-50 rounded-lg text-center text-gray-500">
                <p className="text-sm">Loading...</p>
              </div>
            ) : memberData.pendingRequests.length === 0 ? (
              <div className="p-4 bg-gray-50 rounded-lg text-center text-gray-500">
                <svg className="w-12 h-12 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm">No pending requests</p>
              </div>
            ) : (
              memberData.pendingRequests.map((request) => (
                <div key={request.loan_id} className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">📝 Loan Application</p>
                      <p className="text-sm text-gray-600 mt-1">
                        {request.loan_type} • ₱{parseFloat(request.loan_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
                      Pending Review
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Announcements */}
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Announcements</h3>
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 bg-red-500 rounded-full"></span>
              <button 
                onClick={() => alert('Navigate to "Announcements" in the sidebar menu to view all cooperative announcements and updates.')}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer"
              >
                View All
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {announcements.map((announcement) => (
              <div key={announcement.id} className="p-4 bg-blue-50 rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer">
                <div className="flex items-start space-x-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">{announcement.title}</p>
                    <p className="text-xs text-gray-600 mt-1">{announcement.date}</p>
                    <p className="text-sm text-gray-700 mt-2">{announcement.excerpt}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Recent Transactions</h3>
          <button 
            onClick={() => alert('Navigate to "Transactions" in the sidebar menu to view your complete transaction history.')}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center space-x-1 cursor-pointer"
          >
            <span>View All Transactions</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Date</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Transaction</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Amount</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="4" className="py-8 text-center text-gray-500">
                    <p className="text-sm">Loading transactions...</p>
                  </td>
                </tr>
              ) : memberData.recentTransactions.length === 0 ? (
                <tr>
                  <td colSpan="4" className="py-8 text-center text-gray-500">
                    <svg className="w-12 h-12 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <p className="text-sm">No transactions yet</p>
                  </td>
                </tr>
              ) : (
                memberData.recentTransactions.map((transaction) => (
                  <tr key={transaction.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm text-gray-900">{transaction.date}</td>
                    <td className="py-3 px-4 text-sm text-gray-900">{transaction.type}</td>
                    <td className={`py-3 px-4 text-sm text-right font-medium ${
                      transaction.amount > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {transaction.amount > 0 ? '+' : ''}₱{Math.abs(transaction.amount).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                        {transaction.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default MemberDashboard;
