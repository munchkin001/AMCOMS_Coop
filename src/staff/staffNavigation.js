import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  BarChart3,
  BookOpen,
  ClipboardList,
  Factory,
  FileText,
  HandCoins,
  Landmark,
  LayoutDashboard,
  Library,
  Megaphone,
  MessageSquareText,
  Package,
  RefreshCw,
  ShoppingCart,
  Tags,
  UserPlus,
  Users,
} from 'lucide-react';

const staffNavigationConfig = {
  chairman: [
    {
      id: 'dashboard',
      name: 'Dashboard',
      icon: '📊',
      path: '/staff/dashboard',
      component: 'ChairmanDashboard'
    },
    {
      id: 'performance',
      name: 'Performance Report',
      icon: '📈',
      path: '/staff/performance',
      component: 'PerformanceReport'
    },
    {
      id: 'general-ledger',
      name: 'General Ledger',
      icon: '📒',
      path: '/staff/general-ledger',
      component: 'GeneralLedger'
    },
    {
      id: 'chart-of-accounts',
      name: 'Chart of Accounts',
      icon: Library,
      path: '/staff/chart-of-accounts',
      component: 'ChartOfAccounts'
    },
    {
      id: 'audit-log',
      name: 'Audit Log',
      icon: '📋',
      path: '/staff/audit-log',
      component: 'AuditLog'
    },
    {
      id: 'policies',
      name: 'Policies',
      icon: '📜',
      path: '/staff/policies',
      component: 'Policies'
    }
  ],

  manager: [
    {
      id: 'dashboard',
      name: 'Dashboard',
      icon: '📊',
      path: '/staff/dashboard',
      component: 'ManagerDashboard'
    },
    {
      id: 'members',
      name: 'Members',
      icon: '👥',
      path: '/staff/members',
      component: 'Members'
    },
    {
      id: 'loan-requests',
      name: 'Loan Requests',
      icon: HandCoins,
      path: '/staff/loan-requests',
      component: 'LoanRequests'
    },
    {
      id: 'transaction-approvals',
      name: 'Transactions Management',
      icon: ClipboardList,
      path: '/staff/transaction-approvals',
      component: 'TransactionApprovals'
    },
    {
      id: 'inventory',
      name: 'Operations Monitoring',
      icon: '📦',
      path: '/staff/inventory',
      component: 'Inventory'
    },
    {
      id: 'general-ledger',
      name: 'General Ledger',
      icon: '📒',
      path: '/staff/general-ledger',
      component: 'GeneralLedger'
    },
    {
      id: 'chart-of-accounts',
      name: 'Chart of Accounts',
      icon: Library,
      path: '/staff/chart-of-accounts',
      component: 'ChartOfAccounts'
    },
    {
      id: 'reports',
      name: 'Reports',
      icon: '📑',
      path: '/staff/reports',
      component: 'Reports'
    },
    {
      id: 'audit-log',
      name: 'Audit Log',
      icon: 'audit-log',
      path: '/staff/audit-log',
      component: 'AuditLog'
    },
    {
      id: 'announcements',
      name: 'Announcements',
      icon: '📢',
      path: '/staff/announcements',
      component: 'Announcements'
    },
    {
      id: 'sms',
      name: 'SMS Center',
      icon: MessageSquareText,
      path: '/staff/sms',
      component: 'SMSCenter'
    },
    {
      id: 'policies',
      name: 'Policies',
      icon: FileText,
      path: '/staff/policies',
      component: 'PublishedPolicies'
    }
  ],

  treasurer: [
    {
      id: 'dashboard',
      name: 'Dashboard',
      icon: '📊',
      path: '/staff/dashboard',
      component: 'TreasurerDashboard'
    },
    {
      id: 'savings',
      name: 'Member Accounts',
      icon: '🏦',
      path: '/staff/savings',
      component: 'SavingsManagement'
    },
    {
      id: 'approved-transactions',
      name: 'Transactions Management',
      icon: HandCoins,
      path: '/staff/loan-requests',
      component: 'LoanRequests'
    },
    {
      id: 'cash-release',
      name: 'Cash Release',
      icon: Banknote,
      path: '/staff/cash-release',
      component: 'CashRelease'
    },
    {
      id: 'loan-collections',
      name: 'Loan Collections',
      icon: '📥',
      path: '/staff/loan-collections',
      component: 'LoanCollections'
    },
    {
      id: 'general-ledger',
      name: 'General Ledger',
      icon: '📒',
      path: '/staff/general-ledger',
      component: 'GeneralLedger'
    },
    {
      id: 'chart-of-accounts',
      name: 'Chart of Accounts',
      icon: Library,
      path: '/staff/chart-of-accounts',
      component: 'ChartOfAccounts'
    },
    {
      id: 'reports',
      name: 'Reports',
      icon: '📑',
      path: '/staff/reports',
      component: 'TreasurerReports'
    },
    {
      id: 'policies',
      name: 'Policies',
      icon: FileText,
      path: '/staff/policies',
      component: 'PublishedPolicies'
    }
  ],

  bookkeeper: [
    {
      id: 'dashboard',
      name: 'Dashboard',
      icon: '📊',
      path: '/staff/dashboard',
      component: 'BookkeeperDashboard'
    },
    {
      id: 'members',
      name: 'Members',
      icon: Users,
      path: '/staff/members',
      component: 'MemberManagement'
    },
    {
      id: 'transactions',
      name: 'Transactions',
      icon: '💳',
      path: '/staff/transactions',
      component: 'Transactions'
    },
    {
      id: 'approved-transactions',
      name: 'Transactions Management',
      icon: ClipboardList,
      path: '/staff/approved-transactions',
      component: 'ApprovedTransactions'
    },
    {
      id: 'loan-requests',
      name: 'Loan Requests',
      icon: HandCoins,
      path: '/staff/loan-requests',
      component: 'LoanRequests'
    },
    {
      id: 'general-ledger',
      name: 'General Ledger',
      icon: '📒',
      path: '/staff/general-ledger',
      component: 'GeneralLedger'
    },
    {
      id: 'chart-of-accounts',
      name: 'Chart of Accounts',
      icon: Library,
      path: '/staff/chart-of-accounts',
      component: 'ChartOfAccounts'
    },
    {
      id: 'reconciliation',
      name: 'Reconciliation',
      icon: '🔄',
      path: '/staff/reconciliation',
      component: 'Reconciliation'
    },
    {
      id: 'reports',
      name: 'Financial Reports',
      icon: '📑',
      path: '/staff/reports',
      component: 'FinancialReports'
    },
    {
      id: 'policies',
      name: 'Policies',
      icon: FileText,
      path: '/staff/policies',
      component: 'PublishedPolicies'
    }
  ],

  inventory: [
    {
      id: 'dashboard',
      name: 'Dashboard',
      icon: '📊',
      path: '/staff/dashboard',
      component: 'InventoryDashboard'
    },
    {
      id: 'products',
      name: 'Products',
      icon: '🏷️',
      path: '/staff/products',
      component: 'Products'
    },
    {
      id: 'stock',
      name: 'Stock Management',
      icon: '📦',
      path: '/staff/stock',
      component: 'StockManagement'
    },
    {
      id: 'production',
      name: 'Production',
      icon: '🏭',
      path: '/staff/production',
      component: 'Production'
    },
    {
      id: 'sales',
      name: 'Inventory Tracking',
      icon: '🛒',
      path: '/staff/sales',
      component: 'SalesOrders'
    },
    {
      id: 'purchases',
      name: 'Purchases',
      icon: '📋',
      path: '/staff/purchases',
      component: 'Purchases'
    },
    {
      id: 'reports',
      name: 'Inventory Reports',
      icon: '📑',
      path: '/staff/reports',
      component: 'InventoryReports'
    },
    {
      id: 'policies',
      name: 'Policies',
      icon: FileText,
      path: '/staff/policies',
      component: 'PublishedPolicies'
    }
  ]
};

/**
 * Get navigation items for a specific role
 * @param {string} role - Staff role (chairman, manager, treasurer, bookkeeper, inventory)
 * @returns {Array} Navigation items for the role
 */
export const getNavigationForRole = (role) => {
  const icons = {
    dashboard: LayoutDashboard,
    performance: BarChart3,
    'audit-log': ClipboardList,
    policies: FileText,
    members: Users,
    requests: ClipboardList,
    loans: HandCoins,
    savings: Landmark,
    inventory: Package,
    reports: BarChart3,
    announcements: Megaphone,
    sms: MessageSquareText,
    'cash-receipts': Banknote,
    'cash-disbursements': ArrowUpFromLine,
    'loan-collections': ArrowDownToLine,
    transactions: Banknote,
    books: BookOpen,
    'general-ledger': Library,
    'chart-of-accounts': BookOpen,
    reconciliation: RefreshCw,
    products: Tags,
    stock: Package,
    production: Factory,
    sales: ShoppingCart,
    purchases: ClipboardList,
  };

  return (staffNavigationConfig[role] || []).map((item) => ({
    ...item,
    icon: icons[item.id] || FileText,
  }));
};

/**
 * Check if a role has access to a specific module
 * @param {string} role - Staff role
 * @param {string} moduleId - Module ID to check
 * @returns {boolean} True if role has access
 */
export const hasAccessToModule = (role, moduleId) => {
  const navigation = staffNavigationConfig[role] || [];
  return navigation.some(item => item.id === moduleId);
};

/**
 * Get display name for a role
 * @param {string} role - Staff role
 * @returns {string} Display name
 */
export const getRoleDisplayName = (role) => {
  const roleNames = {
    chairman: 'Chairman',
    manager: 'Manager',
    treasurer: 'Treasurer',
    bookkeeper: 'Bookkeeper',
    inventory: 'Inventory Staff'
  };
  return roleNames[role] || role;
};

/**
 * Get color scheme for a role
 * @param {string} role - Staff role
 * @returns {Object} Color configuration
 */
export const getRoleColors = (role) => {
  const colors = {
    chairman: {
      primary: 'navy',
      gradient: 'from-blue-900 to-blue-800',
      bg: 'bg-blue-800',
      text: 'text-blue-800',
      hover: 'hover:bg-blue-50'
    },
    manager: {
      primary: 'orange',
      gradient: 'from-orange-700 to-orange-600',
      bg: 'bg-orange-600',
      text: 'text-orange-700',
      hover: 'hover:bg-orange-50'
    },
    treasurer: {
      primary: 'teal',
      gradient: 'from-teal-800 to-teal-700',
      bg: 'bg-teal-700',
      text: 'text-teal-700',
      hover: 'hover:bg-teal-50'
    },
    bookkeeper: {
      primary: 'purple',
      gradient: 'from-purple-700 to-purple-800',
      bg: 'bg-purple-600',
      text: 'text-purple-600',
      hover: 'hover:bg-purple-50'
    },
    inventory: {
      primary: 'lime',
      gradient: 'from-lime-800 to-emerald-700',
      bg: 'bg-lime-600',
      text: 'text-lime-700',
      hover: 'hover:bg-lime-50'
    }
  };
  return colors[role] || colors.manager;
};

export default {
  staffNavigationConfig,
  getNavigationForRole,
  hasAccessToModule,
  getRoleDisplayName,
  getRoleColors
};
