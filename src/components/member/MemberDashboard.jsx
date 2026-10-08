import React, { useState, useEffect } from 'react';
import { CalendarClock, HandCoins, Landmark, PiggyBank } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import DashboardMetricCard from '../common/DashboardMetricCard';

const MemberDashboard = () => {
  const { staff, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [memberData, setMemberData] = useState({
    memberId: null,
    memberNumber: '',
    fullName: '',
    totalSavings: 0,
    totalTimeDeposit: 0,
    totalLoanBalance: 0,
    nextPaymentAmount: 0,
    nextPaymentDate: null,
    recentTransactions: [],
    pendingRequests: [],
    announcements: []
  });

  useEffect(() => {
    if (staff?.member_id) {
      fetchMemberData();
    }
  }, [staff]);

  // Set up real-time subscriptions for live updates
  useMultipleRealtimeSubscriptions([
    {
      table: 'savings_accounts',
      onUpdate: () => {
        if (staff?.member_id) {
          fetchMemberData();
        }
      }
    },
    {
      table: 'savings_transactions',
      onUpdate: () => {
        if (staff?.member_id) {
          fetchMemberData();
        }
      }
    },
    {
      table: 'loans',
      onUpdate: () => {
        if (staff?.member_id) {
          fetchMemberData();
        }
      }
    },
    {
      table: 'loan_payments',
      onUpdate: () => {
        if (staff?.member_id) {
          fetchMemberData();
        }
      }
    },
    {
      table: 'announcements',
      onUpdate: () => {
        if (staff?.member_id) {
          fetchMemberData();
        }
      }
    }
  ], [staff?.member_id]);

  const fetchMemberData = async () => {
    try {
      setLoading(true);

      // Get member_id from staff profile (members have their member_id linked)
      const memberId = staff.member_id;
      
      if (!memberId) {
        console.error('No member_id found in staff profile');
        setLoading(false);
        return;
      }

      // Fetch member details
      const { data: memberInfo, error: memberError } = await supabase
        .from('members')
        .select('id, member_number, first_name, middle_name, last_name, email')
        .eq('id', memberId)
        .single();

      if (memberError) throw memberError;

      // Fetch total savings from all savings accounts
      const { data: savingsAccounts, error: savingsError } = await supabase
        .from('savings_accounts')
        .select('balance')
        .eq('member_id', memberId)
        .eq('status', 'active');

      if (savingsError) console.error('Error fetching savings:', savingsError);
      const totalSavings = savingsAccounts?.reduce((sum, acc) => sum + parseFloat(acc.balance || 0), 0) || 0;

      // Note: time_deposits table needs to be created - using 0 for now
      const totalTimeDeposit = 0;

      // Fetch active loans and calculate balance
      const { data: activeLoans, error: loansError } = await supabase
        .from('loans')
        .select('id, loan_number, principal_amount, balance, monthly_payment, release_date, maturity_date, status')
        .eq('member_id', memberId)
        .in('status', ['approved', 'active'])
        .order('created_at', { ascending: false });

      if (loansError) console.error('Error fetching loans:', loansError);
      const totalLoanBalance = activeLoans?.reduce((sum, loan) => sum + parseFloat(loan.balance || 0), 0) || 0;

      // Get next payment from first active loan
      let nextPaymentAmount = 0;
      let nextPaymentDate = null;
      if (activeLoans && activeLoans.length > 0) {
        const loan = activeLoans[0];
        nextPaymentAmount = parseFloat(loan.monthly_payment || 0);
        
        // Calculate next payment date based on release_date
        if (loan.release_date) {
          const releaseDate = new Date(loan.release_date);
          const today = new Date();
          const dayOfMonth = releaseDate.getDate();
          nextPaymentDate = new Date(today.getFullYear(), today.getMonth() + 1, dayOfMonth);
        }
      }

      // Fetch recent savings transactions
      const { data: savingsTransactions, error: savingsTxError } = await supabase
        .from('savings_transactions')
        .select(`
          id,
          transaction_type,
          amount,
          balance_after,
          transaction_date,
          description,
          savings_accounts!inner(account_number, member_id)
        `)
        .eq('savings_accounts.member_id', memberId)
        .order('transaction_date', { ascending: false })
        .limit(5);

      if (savingsTxError) console.error('Error fetching savings transactions:', savingsTxError);

      // Fetch recent loan payments
      const { data: loanPayments, error: loanPaymentsError } = await supabase
        .from('loan_payments')
        .select(`
          id,
          payment_date,
          amount_paid,
          principal_paid,
          interest_paid,
          balance_after,
          loans!inner(loan_number, member_id)
        `)
        .eq('loans.member_id', memberId)
        .order('payment_date', { ascending: false })
        .limit(5);

      if (loanPaymentsError) console.error('Error fetching loan payments:', loanPaymentsError);

      // Combine transactions
      const recentTransactions = [
        ...(savingsTransactions || []).map(t => ({
          id: t.id,
          date: new Date(t.transaction_date).toLocaleDateString(),
          type: `Savings ${t.transaction_type}`,
          amount: t.amount,
          status: 'Completed'
        })),
        ...(loanPayments || []).map(t => ({
          id: t.id,
          date: new Date(t.payment_date).toLocaleDateString(),
          type: 'Loan Payment',
          amount: -t.amount_paid,
          status: 'Completed'
        }))
      ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
      
      // Fetch pending requests
      const { data: pendingLoans, error: pendingError } = await supabase
        .from('loans')
        .select('id, loan_number, principal_amount, status, application_date')
        .eq('member_id', memberId)
        .eq('status', 'pending')
        .order('application_date', { ascending: false });

      if (pendingError) console.error('Error fetching pending requests:', pendingError);

      // Fetch announcements for members
      const { data: announcements, error: announcementsError } = await supabase
        .from('announcements')
        .select('id, title, content, published_at')
        .eq('is_active', true)
        .contains('target_roles', ['member'])
        .order('published_at', { ascending: false })
        .limit(3);

      if (announcementsError) console.error('Error fetching announcements:', announcementsError);

      setMemberData({
        memberId,
        memberNumber: memberInfo.member_number,
        fullName: `${memberInfo.first_name} ${memberInfo.last_name}`,
        totalSavings,
        totalTimeDeposit,
        totalLoanBalance,
        nextPaymentAmount,
        nextPaymentDate,
        recentTransactions,
        pendingRequests: pendingLoans || [],
        announcements: announcements || []
      });
    } catch (error) {
      console.error('Error fetching member data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Announcements now fetched from database

  return (
    <div className="space-y-6">
      {/* My Account Summary - Large Cards */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">My Account Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <DashboardMetricCard
            label="Savings"
            value={loading ? '...' : `₱${memberData.totalSavings.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
            detail="Member balance"
            icon={PiggyBank}
            tone="green"
            actionLabel="View account"
            onAction={() => alert('Navigate to "My Savings" in the sidebar menu to view your complete savings account details and transaction history.')}
          />
          <DashboardMetricCard
            label="Time Deposit"
            value={loading ? '...' : `₱${memberData.totalTimeDeposit.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
            detail="Current balance"
            icon={Landmark}
            tone="indigo"
            actionLabel="View account"
            onAction={() => alert('Navigate to "My Savings" in the sidebar menu to view your time deposit account details.')}
          />
          <DashboardMetricCard
            label="Loan Balance"
            value={loading ? '...' : `₱${memberData.totalLoanBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
            detail="Outstanding balance"
            icon={HandCoins}
            tone="orange"
            actionLabel="View loans"
            onAction={() => alert('Navigate to "My Loans" in the sidebar menu to view your loan details, payment history, and outstanding balance.')}
          />
          <DashboardMetricCard
            label="Next Payment"
            value={loading ? '...' : `₱${memberData.nextPaymentAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
            detail={memberData.nextPaymentDate ? `Due ${new Date(memberData.nextPaymentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'No payment scheduled'}
            icon={CalendarClock}
            tone="red"
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                <p className="text-sm mt-2">Loading...</p>
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
                <div key={request.id} className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">Loan Application</p>
                      <p className="text-sm text-gray-600 mt-1">
                        {request.loan_number} • ₱{parseFloat(request.principal_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Applied: {new Date(request.application_date).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
                      {request.status}
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
            {loading ? (
              <div className="p-4 bg-gray-50 rounded-lg text-center text-gray-500">
                <p className="text-sm">Loading announcements...</p>
              </div>
            ) : memberData.announcements.length === 0 ? (
              <div className="p-4 bg-gray-50 rounded-lg text-center text-gray-500">
                <svg className="w-12 h-12 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
                <p className="text-sm">No announcements</p>
              </div>
            ) : (
              memberData.announcements.map((announcement) => (
                <div key={announcement.id} className="p-4 bg-blue-50 rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer">
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">{announcement.title}</p>
                      <p className="text-xs text-gray-600 mt-1">
                        {new Date(announcement.published_at).toLocaleDateString('en-US', { 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </p>
                      <p className="text-sm text-gray-700 mt-2">{announcement.content.substring(0, 150)}...</p>
                    </div>
                  </div>
                </div>
              ))
            )}
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
