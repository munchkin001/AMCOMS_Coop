import React, { useCallback, useState, useEffect } from 'react';
import { Building2, CalendarClock, ChartNoAxesCombined, HandCoins, Landmark, PiggyBank } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import offlineDb from '../../lib/Offline/OfflineDb';
import DashboardMetricCard from '../common/DashboardMetricCard';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';

const savingsTransactionTitle = (transaction) => {
  const account = transaction.savings_accounts?.account_type === 'time_deposit' ? 'Time deposit' : 'Savings';
  const action = transaction.transaction_type === 'deposit' && account === 'Time deposit'
    ? 'placement'
    : transaction.transaction_type;
  return `${account} ${action}`;
};

const officialReceiptNumber = (value) => /^AMCOMS-\d{4}-\d{6}$/.test(value || '') ? value : null;

const MemberDashboard = ({ onNavigate }) => {
  const { staff, offlineMode } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offlineNotice, setOfflineNotice] = useState('');
  const [memberData, setMemberData] = useState({
    memberId: null,
    memberNumber: '',
    fullName: '',
    firstName: '',
    dueDates: [],
    totalSavings: 0,
    totalTimeDeposit: 0,
    totalCapital: 0,
    sharesOwned: 0,
    totalLoanBalance: 0,
    nextPaymentAmount: 0,
    nextPaymentDate: null,
    recentTransactions: [],
    announcements: []
  });

  const fetchMemberData = useCallback(async () => {
    const memberId = staff?.member_id;
    if (!memberId) {
      setError('Your member profile is not linked to a member record.');
      setLoading(false);
      return;
    }

    const cacheKey = `member-dashboard:${memberId}`;
    const loadCachedDashboard = async (notice) => {
      const cachedDashboard = await offlineDb.cachedData.get(cacheKey);
      if (!cachedDashboard?.data?.memberData) return false;

      setMemberData(cachedDashboard.data.memberData);
      setOfflineNotice(notice);
      setError('');
      return true;
    };

    if (offlineMode || !navigator.onLine) {
      setLoading(true);
      try {
        const loaded = await loadCachedDashboard(
          'You are viewing the last account summary saved on this device. Reconnect to refresh your balances and activity.'
        );
        if (!loaded) {
          setOfflineNotice('No saved account summary is available on this device yet. Connect to the internet and open the dashboard to save one for offline viewing.');
        }
      } catch (cacheError) {
        console.error('Unable to load cached member dashboard:', cacheError);
        setOfflineNotice('The saved account summary on this device could not be opened. Reconnect to refresh your account.');
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      setLoading(true);
      setOfflineNotice('');

      // Fetch member details
      const { data: memberInfo, error: memberError } = await supabase
        .from('members')
        .select('id, member_number, first_name, middle_name, last_name, email, total_capital, shares_owned')
        .eq('id', memberId)
        .single();

      if (memberError) throw memberError;

      // Fetch total savings from all savings accounts
      const { data: savingsAccounts, error: savingsError } = await supabase
        .from('savings_accounts')
        .select('balance, account_type')
        .eq('member_id', memberId)
        .eq('status', 'active');

      if (savingsError) throw savingsError;
      const totalSavings = (savingsAccounts || [])
        .filter((account) => account.account_type !== 'time_deposit')
        .reduce((sum, account) => sum + Number(account.balance || 0), 0);
      const totalTimeDeposit = (savingsAccounts || [])
        .filter((account) => account.account_type === 'time_deposit')
        .reduce((sum, account) => sum + Number(account.balance || 0), 0);

      // Fetch active loans and calculate balance
      const { data: activeLoans, error: loansError } = await supabase
        .from('loans')
        .select('id, loan_number, principal_amount, balance, monthly_payment, release_date, maturity_date, status')
        .eq('member_id', memberId)
        .in('status', ['active'])
        .order('created_at', { ascending: false });

      if (loansError) throw loansError;
      const totalLoanBalance = activeLoans?.reduce((sum, loan) => sum + parseFloat(loan.balance || 0), 0) || 0;

      // Next payments come from the repayment schedule
      const { data: dueRows, error: dueError } = await supabase
        .from('loan_schedule')
        .select('id, installment_number, due_date, amount_due, amount_paid, penalty_amount, loans!inner(loan_number, member_id, status)')
        .eq('loans.member_id', memberId)
        .eq('loans.status', 'active')
        .neq('status', 'paid')
        .order('due_date', { ascending: true })
        .limit(4);
      if (dueError) throw dueError;
      const dueDates = dueRows || [];
      const nextPaymentAmount = dueDates[0]
        ? Number(dueDates[0].amount_due) + Number(dueDates[0].penalty_amount) - Number(dueDates[0].amount_paid)
        : 0;
      const nextPaymentDate = dueDates[0]?.due_date || null;

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
          reference_number,
          savings_accounts!inner(account_number, member_id, account_type)
        `)
        .eq('savings_accounts.member_id', memberId)
        .eq('status', 'recorded')
        .order('transaction_date', { ascending: false })
        .limit(5);

      if (savingsTxError) throw savingsTxError;

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
          receipt_id,
          reference_number,
          loans!inner(loan_number, member_id)
        `)
        .eq('loans.member_id', memberId)
        .eq('status', 'recorded')
        .order('payment_date', { ascending: false })
        .limit(5);

      if (loanPaymentsError) throw loanPaymentsError;

      // Combine transactions
      // Bookkeeper actions (loan released, disbursements) are mirrored here
      const { data: activityRows, error: activityError } = await supabase
        .from('member_activity')
        .select('id, activity_type, title, amount, created_at, is_discrepancy, note, reference, voided_at, void_reason')
        .eq('member_id', memberId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (activityError) throw activityError;

      const requestActivity = (activityRows || []).map((row) => ({
        id: row.id,
        rawDate: row.created_at,
        type: row.title,
        amount: null,
        requested: row.amount,
        status: row.voided_at ? 'Voided' : row.is_discrepancy ? 'Discrepancy' : 'Recorded',
        note: row.void_reason || row.note,
        receiptNumber: officialReceiptNumber(row.reference)
      }));
      const dividendReferences = new Set(
        (activityRows || []).filter((row) => row.activity_type === 'dividend').map((row) => row.reference)
      );
      const recentTransactions = [
        ...requestActivity,
        ...(savingsTransactions || []).filter((t) => !dividendReferences.has(t.reference_number)).map(t => ({
          id: t.id,
          rawDate: t.transaction_date,
          type: savingsTransactionTitle(t),
          amount: t.amount,
          receiptNumber: officialReceiptNumber(t.reference_number),
          status: 'Completed'
        })),
        ...(loanPayments || []).filter((t) => !t.receipt_id && !dividendReferences.has(t.reference_number)).map(t => ({
          id: t.id,
          rawDate: t.payment_date,
          type: 'Loan Payment',
          amount: -t.amount_paid,
          status: 'Completed'
        }))
      ]
        .sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate))
        .slice(0, 6)
        .map((item) => ({ ...item, date: new Date(item.rawDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) }));
      
      // Fetch announcements for members
      const { data: announcements, error: announcementsError } = await supabase
        .from('announcements')
        .select('id, title, content, published_at')
        .eq('is_active', true)
        .contains('target_roles', ['member'])
        .order('published_at', { ascending: false })
        .limit(3);

      if (announcementsError) throw announcementsError;

      const refreshedMemberData = {
        memberId,
        memberNumber: memberInfo.member_number,
        fullName: `${memberInfo.first_name} ${memberInfo.last_name}`,
        firstName: memberInfo.first_name,
        dueDates,
        totalSavings,
        totalTimeDeposit,
        totalCapital: Number(memberInfo.total_capital || 0),
        sharesOwned: Number(memberInfo.shares_owned || 0),
        totalLoanBalance,
        nextPaymentAmount,
        nextPaymentDate,
        recentTransactions,
        announcements: announcements || []
      };
      setMemberData(refreshedMemberData);
      try {
        await offlineDb.cachedData.put({
          key: cacheKey,
          data: { memberData: refreshedMemberData },
          updatedAt: new Date().toISOString()
        });
      } catch (cacheError) {
        console.error('Unable to cache member dashboard for offline viewing:', cacheError);
      }
      setError('');
    } catch (error) {
      console.error('Error fetching member data:', error);
      try {
        const loaded = await loadCachedDashboard(
          'We could not refresh your account right now, so this is the last summary saved on this device.'
        );
        if (!loaded) {
          setError(getDataLoadErrorMessage(error, 'your account data'));
        }
      } catch (cacheError) {
        console.error('Unable to load cached member dashboard after refresh failed:', cacheError);
        setError(getDataLoadErrorMessage(error, 'your account data'));
      }
    } finally {
      setLoading(false);
    }
  }, [staff?.member_id, offlineMode]);

  useEffect(() => {
    const refreshDashboard = () => {
      if (staff?.member_id) fetchMemberData();
    };
    refreshDashboard();
    window.addEventListener('online', refreshDashboard);
    window.addEventListener('offline', refreshDashboard);
    return () => {
      window.removeEventListener('online', refreshDashboard);
      window.removeEventListener('offline', refreshDashboard);
    };
  }, [staff?.member_id, fetchMemberData]);

  useMultipleRealtimeSubscriptions(
    [
      { table: 'members', onUpdate: fetchMemberData },
      { table: 'savings_accounts', onUpdate: fetchMemberData },
      { table: 'savings_transactions', onUpdate: fetchMemberData },
      { table: 'loans', onUpdate: fetchMemberData },
      { table: 'loan_payments', onUpdate: fetchMemberData },
      { table: 'member_activity', onUpdate: fetchMemberData },
      { table: 'loan_schedule', onUpdate: fetchMemberData },
      { table: 'announcements', onUpdate: fetchMemberData }
    ],
    [fetchMemberData]
  );

  // Announcements now fetched from database

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {offlineNotice && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{offlineNotice}</p>}
      {/* Greeting and account summary */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">Hi, {memberData.firstName || 'Member'}!</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
          <DashboardMetricCard
            label="Savings"
            value={loading ? '...' : `₱${memberData.totalSavings.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
            detail="Member balance"
            icon={PiggyBank}
            tone="green"
            solid
          />
          <DashboardMetricCard
            label="Time Deposit"
            value={loading ? '...' : `₱${memberData.totalTimeDeposit.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
            detail="Current balance"
            icon={Landmark}
            tone="indigo"
            solid
          />
          <DashboardMetricCard
            label="Capital Share"
            value={loading ? '...' : `₱${memberData.totalCapital.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
            detail="Member share capital"
            icon={Building2}
            tone="blue"
            solid
          />
          <DashboardMetricCard
            label="Shares Owned"
            value={loading ? '...' : Number(memberData.sharesOwned || 0).toLocaleString('en-US')}
            detail="Member shares"
            icon={ChartNoAxesCombined}
            tone="teal"
            solid
          />
          <DashboardMetricCard
            label="Loan Balance"
            value={loading ? '...' : `₱${memberData.totalLoanBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
            detail="Outstanding balance"
            icon={HandCoins}
            tone="orange"
            solid
          />
          <DashboardMetricCard
            label="Next Payment"
            value={loading ? '...' : `₱${memberData.nextPaymentAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
            detail={memberData.nextPaymentDate ? `Due ${new Date(`${memberData.nextPaymentDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'No payment scheduled'}
            icon={CalendarClock}
            tone="red"
            solid
          />
        </div>
      </div>

      {/* Upcoming due dates */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-4 sm:p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Upcoming Loan Due Dates</h3>
        {memberData.dueDates.length === 0 ? (
          <p className="text-sm text-gray-500">No upcoming loan payments.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {memberData.dueDates.map((item) => {
              const days = Math.round((new Date(`${item.due_date}T00:00:00`) - new Date(new Date().toDateString())) / 86400000);
              const overdue = days < 0;
              return (
                <li key={item.id} className="flex items-center justify-between py-3 gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {new Date(`${item.due_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                    <p className="text-xs text-gray-500">{item.loans?.loan_number} · payment {item.installment_number}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">₱{(Number(item.amount_due) + Number(item.penalty_amount) - Number(item.amount_paid)).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                    <p className={`text-xs font-medium ${overdue ? 'text-red-600' : days <= 7 ? 'text-orange-600' : 'text-gray-500'}`}>
                      {overdue ? `${-days} day${days === -1 ? '' : 's'} overdue` : days === 0 ? 'Due today' : `in ${days} day${days === 1 ? '' : 's'}`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 gap-6">
        {/* Announcements */}
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Announcements</h3>
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 bg-red-500 rounded-full"></span>
              <button 
                onClick={() => onNavigate?.('announcements')}
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
                <div key={announcement.id} className="p-4 bg-green-50 rounded-lg border border-green-200 hover:bg-green-100 transition-colors cursor-pointer">
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            onClick={() => onNavigate?.('transactions')}
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
                    <td className="py-3 px-4 text-sm text-gray-900">
                      {transaction.type}
                      {transaction.receiptNumber && (
                        <p className="mt-1 text-xs font-medium text-green-800">
                          Official receipt: {transaction.receiptNumber}
                        </p>
                      )}
                      {transaction.note && <p className="mt-1 text-xs text-red-700">Reason: {transaction.note}</p>}
                    </td>
                    <td className={`py-3 px-4 text-sm text-right font-medium ${
                      transaction.amount == null ? 'text-gray-900' : transaction.amount > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {transaction.amount == null
                        ? `₱${Number(transaction.requested || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
                        : `${transaction.amount > 0 ? '+' : ''}₱${Math.abs(transaction.amount).toLocaleString()}`}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        transaction.status === 'Discrepancy' ? 'bg-red-100 text-red-800'
                          : transaction.status === 'Voided' ? 'bg-gray-100 text-gray-700'
                            : 'bg-green-100 text-green-800'
                      }`}>
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
