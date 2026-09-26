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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: memberInfo } = await supabase
        .from('staff')
        .select('member_id')
        .eq('user_id', user.id)
        .single();

      if (!memberInfo) return;

      const { data: savingsAccounts } = await supabase
        .from('savings_accounts')
        .select('balance')
        .eq('member_id', memberInfo.member_id)
        .eq('status', 'active');

      const totalSavings = savingsAccounts?.reduce((sum, acc) => sum + parseFloat(acc.balance || 0), 0) || 0;

      const { data: activeLoans } = await supabase
        .from('loans')
        .select('*')
        .eq('member_id', memberInfo.member_id)
        .in('status', ['approved', 'active'])
        .order('created_at', { ascending: false });

      const totalLoanBalance = activeLoans?.reduce((sum, loan) => {
        const balance = parseFloat(loan.balance || 0);
        return sum + balance;
      }, 0) || 0;

      setMemberData({
        memberId: memberInfo.member_id,
        totalSavings,
        totalTimeDeposit: 0,
        totalLoanBalance,
        nextPaymentAmount: 0,
        nextPaymentDate: null,
        recentTransactions: [],
        pendingRequests: []
      });
    } catch (error) {
      console.error('Error fetching member data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-700 to-indigo-800 rounded-2xl p-8 text-white">
        <h2 className="text-2xl font-bold mb-2">Member Dashboard</h2>
        <p className="text-indigo-100">Welcome to your AMCOMS Member Portal</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Total Savings</p>
          <p className="text-2xl font-bold text-green-600">₱{memberData.totalSavings.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Time Deposit</p>
          <p className="text-2xl font-bold text-blue-600">₱{memberData.totalTimeDeposit.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Loan Balance</p>
          <p className="text-2xl font-bold text-orange-600">₱{memberData.totalLoanBalance.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Next Payment</p>
          <p className="text-2xl font-bold text-gray-900">
            {memberData.nextPaymentAmount > 0 ? `₱${memberData.nextPaymentAmount.toLocaleString()}` : '—'}
          </p>
          {memberData.nextPaymentDate && (
            <p className="text-xs text-gray-500 mt-1">{memberData.nextPaymentDate}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default MemberDashboard;
