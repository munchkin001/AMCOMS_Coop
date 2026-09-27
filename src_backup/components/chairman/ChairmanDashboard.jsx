import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const ChairmanDashboard = () => {
  const [stats, setStats] = useState({
    totalMembers: 0,
    totalSavings: 0,
    totalLoans: 0,
    monthlyIncome: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const { count: memberCount } = await supabase
        .from('members')
        .select('*', { count: 'exact', head: true })
        .eq('membership_status', 'active');

      setStats({
        totalMembers: memberCount || 0,
        totalSavings: 0,
        totalLoans: 0,
        monthlyIncome: 0,
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-700 to-blue-800 rounded-2xl p-8 text-white">
        <h2 className="text-2xl font-bold mb-2">Chairman Dashboard</h2>
        <p className="text-blue-100">Welcome to the AMCOMS Chairman Portal</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Total Members</p>
          <p className="text-3xl font-bold text-gray-900">{stats.totalMembers}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Total Savings</p>
          <p className="text-3xl font-bold text-gray-900">₱{stats.totalSavings.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Active Loans</p>
          <p className="text-3xl font-bold text-gray-900">{stats.totalLoans}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Monthly Income</p>
          <p className="text-3xl font-bold text-gray-900">₱{stats.monthlyIncome.toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
};

export default ChairmanDashboard;
