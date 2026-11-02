import React from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import StaffLayout from './StaffLayout';
import LoadingSpinner from '../components/common/LoadingSpinner';
import StaffProfile from './StaffProfile';
import PublishedPolicies from '../components/common/PublishedPolicies';
import TransactionWorkflow from '../components/common/TransactionWorkflow';

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
import Reconciliation from '../components/bookkeeper/Reconciliation';
import GeneralLedger from '../components/accounting/GeneralLedger';
import FinancialReports from '../components/bookkeeper/FinancialReports';
import BookkeeperMemberManagement from '../components/bookkeeper/MemberManagement';
import LoanRequests from '../components/manager/LoanRequests';

// Inventory Components - Existing
import Products from '../components/inventory/Products';
import StockManagement from '../components/inventory/StockManagement';
import Production from '../components/inventory/Production';
import InventoryReports from '../components/inventory/InventoryReports';
import InventoryHistory from '../components/inventory/InventoryHistory';
import Purchases from '../components/inventory/Purchases';

const StaffPortal = () => {
  const { staff, loading } = useAuth();
  const navigate = useNavigate();

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
        return (
          <BookkeeperDashboard
            onSelectTransaction={(type) => navigate('/staff/transactions', {
              state: type
                ? { initialTransactionType: type }
                : { startNewTransaction: true }
            })}
            onViewBooks={() => navigate('/staff/general-ledger')}
          />
        );
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
        <Route
          path="/policies"
          element={staff.role === 'chairman' ? <Policies /> : <PublishedPolicies />}
        />

        {/* Manager Routes */}
        <Route path="/members" element={staff.role === 'bookkeeper' ? <BookkeeperMemberManagement /> : <MemberManagement />} />
        <Route path="/requests" element={<Navigate to="/staff/dashboard" replace />} />
        <Route path="/member-requests" element={<Navigate to="/staff/dashboard" replace />} />
        <Route path="/loans" element={<Navigate to="/staff/dashboard" replace />} />
        <Route
          path="/loan-requests"
          element={['manager', 'bookkeeper', 'treasurer'].includes(staff.role) ? <LoanRequests /> : <Navigate to="/staff/dashboard" replace />}
        />
        <Route
          path="/transaction-approvals"
          element={staff.role === 'manager' ? <TransactionWorkflow role="manager" /> : <Navigate to="/staff/dashboard" replace />}
        />
        <Route
          path="/approved-transactions"
          element={staff.role === 'bookkeeper' ? <TransactionWorkflow role="bookkeeper" /> : <Navigate to="/staff/dashboard" replace />}
        />
        <Route
          path="/cash-release"
          element={staff.role === 'treasurer' ? <TransactionWorkflow role="treasurer" /> : <Navigate to="/staff/dashboard" replace />}
        />
        <Route path="/savings" element={<MemberAccounts />} />
        <Route path="/inventory" element={<OperationsMonitoring />} />
        <Route path="/announcements" element={<Announcements />} />
        <Route path="/sms" element={['manager', 'chairman'].includes(staff.role) ? <SMSCenter /> : <Navigate to="/staff/dashboard" replace />} />
        <Route
          path="/reports"
          element={staff.role === 'bookkeeper'
            ? <FinancialReports />
            : staff.role === 'inventory' ? <InventoryReports /> : <ManagerReports />}
        />

        {/* Treasurer Routes */}
        <Route path="/cash-receipts" element={<DailyCollection />} />
        <Route path="/cash-disbursements" element={<TreasurerTransactions />} />
        <Route path="/loan-collections" element={<TransactionHistory />} />

        {/* Bookkeeper Routes */}
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/books/*" element={<Navigate to="/staff/general-ledger" replace />} />
        <Route path="/reconciliation" element={<Reconciliation />} />
        <Route
          path="/general-ledger"
          element={['bookkeeper', 'treasurer', 'manager', 'chairman'].includes(staff.role) ? <GeneralLedger /> : <Navigate to="/staff/dashboard" replace />}
        />

        {/* Inventory Routes */}
        <Route path="/products" element={<Products />} />
        <Route path="/stock" element={<StockManagement />} />
        <Route path="/production" element={<Production />} />
        <Route path="/sales" element={<InventoryHistory />} />
        <Route path="/purchases" element={<Purchases />} />

        {/* Fallback - redirect to dashboard */}
        <Route path="*" element={<Navigate to="/staff/dashboard" replace />} />
      </Routes>
    </StaffLayout>
  );
};

export default StaffPortal;
