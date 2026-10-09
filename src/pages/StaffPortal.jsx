import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import StaffLayout from '../layouts/StaffLayout';
import LoadingSpinner from '../components/common/LoadingSpinner';
import StaffProfile from '../components/common/StaffProfile';

// Dashboard Components
import ChairmanDashboard from '../components/chairman/ChairmanDashboard';
import ManagerDashboard from '../components/manager/ManagerDashboard';
import TreasurerDashboard from '../components/treasurer/TreasurerDashboard';
import BookkeeperDashboard from '../components/bookkeeper/BookkeeperDashboard';
import InventoryDashboard from '../components/inventory/InventoryDashboard';

// Chairman Components
import PerformanceReport from '../components/chairman/PerformanceReport';
import AuditLog from '../components/chairman/AuditLog';
import Policies from '../components/chairman/Policies';

// Manager Components - Existing
import MemberManagement from '../components/manager/MemberManagement';
import MemberAccountRecovery from '../components/manager/MemberAccountRecovery';
import Announcements from '../components/manager/Announcements';
import SMSCenter from '../components/manager/SMSCenter';
import ManagerReports from '../components/manager/Reports';
import OperationsMonitoring from '../components/manager/OperationsMonitoring';

// Treasurer Components - Existing
import TreasurerTransactions from '../components/treasurer/Transactions';
import DailyCollection from '../components/treasurer/DailyCollection';
import MemberAccounts from '../components/treasurer/MemberAccounts';
import TransactionHistory from '../components/treasurer/TransactionHistory';

// Bookkeeper Components
import Transactions from '../components/bookkeeper/Transactions';
import Books from '../components/bookkeeper/Books';
import CashReceiptsBook from '../components/bookkeeper/books/CashReceiptsBook';
import CashDisbursementsBook from '../components/bookkeeper/books/CashDisbursementsBook';
import GeneralJournal from '../components/bookkeeper/books/GeneralJournal';
import Ledger from '../components/bookkeeper/books/Ledger';
import Reconciliation from '../components/bookkeeper/Reconciliation';
import FinancialReports from '../components/bookkeeper/FinancialReports';
import BookkeeperMemberManagement from '../components/bookkeeper/MemberManagement';
import Requests from '../components/bookkeeper/Requests';

// Inventory Components - Existing
import Products from '../components/inventory/Products';
import StockManagement from '../components/inventory/StockManagement';
import Production from '../components/inventory/Production';
import InventoryReports from '../components/inventory/InventoryReports';
import InventoryHistory from '../components/inventory/InventoryHistory';

const StaffPortal = () => {
  const { staff, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  if (!staff) {
    return <Navigate to="/login/staff" replace />;
  }

  // Determine which dashboard to show based on role
  const getDashboardComponent = () => {
    switch (staff.role) {
      case 'chairman':
        return <ChairmanDashboard />;
      case 'manager':
        return <ManagerDashboard />;
      case 'treasurer':
        return <TreasurerDashboard />;
      case 'bookkeeper':
        return <BookkeeperDashboard />;
      case 'inventory':
        return <InventoryDashboard />;
      default:
        return <ManagerDashboard />;
    }
  };

  return (
    <StaffLayout>
      <Routes>
        {/* Default Dashboard Route */}
        <Route path="/" element={<Navigate to="/staff/dashboard" replace />} />
        <Route path="/dashboard" element={getDashboardComponent()} />
        <Route path="/profile" element={<StaffProfile roleName={staff.role} />} />

        {/* Chairman Routes */}
        <Route path="/performance" element={<PerformanceReport />} />
        <Route path="/audit-log" element={<AuditLog />} />
        <Route path="/policies" element={<Policies />} />

        {/* Manager Routes */}
        <Route path="/members" element={staff.role === 'bookkeeper' ? <BookkeeperMemberManagement /> : <MemberManagement />} />
        <Route path="/requests" element={staff.role === 'bookkeeper' ? <Requests /> : <Navigate to="/staff/dashboard" replace />} />
        <Route path="/member-requests" element={<Navigate to="/staff/requests" replace />} />
        <Route path="/loans" element={<Navigate to="/staff/requests" replace />} />
        <Route path="/savings" element={<MemberAccounts />} />
        <Route path="/inventory" element={<OperationsMonitoring />} />
        <Route path="/announcements" element={<Announcements />} />
        <Route path="/sms" element={['manager', 'chairman'].includes(staff.role) ? <SMSCenter /> : <Navigate to="/staff/dashboard" replace />} />
        <Route path="/member-account-recovery" element={staff.role === 'chairman' ? <MemberAccountRecovery /> : <Navigate to="/staff/dashboard" replace />} />
        <Route path="/reports" element={<ManagerReports />} />

        {/* Treasurer Routes */}
        <Route path="/cash-receipts" element={<DailyCollection />} />
        <Route path="/cash-disbursements" element={<TreasurerTransactions />} />
        <Route path="/loan-collections" element={<TransactionHistory />} />

        {/* Bookkeeper Routes */}
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/books" element={<Books />} />
        <Route path="/books/cash-receipts" element={<CashReceiptsBook />} />
        <Route path="/books/cash-disbursements" element={<CashDisbursementsBook />} />
        <Route path="/books/general-journal" element={<GeneralJournal />} />
        <Route path="/books/ledger" element={<Ledger />} />
        <Route path="/reconciliation" element={<Reconciliation />} />

        {/* Inventory Routes */}
        <Route path="/products" element={<Products />} />
        <Route path="/stock" element={<StockManagement />} />
        <Route path="/production" element={<Production />} />
        <Route path="/sales" element={<InventoryHistory />} />
        <Route path="/purchases" element={<InventoryHistory />} />

        {/* Fallback - redirect to dashboard */}
        <Route path="*" element={<Navigate to="/staff/dashboard" replace />} />
      </Routes>
    </StaffLayout>
  );
};

export default StaffPortal;
