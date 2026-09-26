import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MemberDashboard from '../components/member/MemberDashboard';
import MyProfile from '../components/member/MyProfile';
import MySavings from '../components/member/MySavings';
import MyTimeDeposit from '../components/member/MyTimeDeposit';
import MyLoans from '../components/member/MyLoans';
import MemberRequests from '../components/member/MemberRequests';
import MemberTransactionHistory from '../components/member/MemberTransactionHistory';
import MemberAnnouncements from '../components/member/MemberAnnouncements';

const MemberPortal = () => {
  const navigate = useNavigate();
  const [activeModule, setActiveModule] = useState('dashboard');
  const [activeSubModule, setActiveSubModule] = useState('');
  const [showAccountsMenu, setShowAccountsMenu] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([
    { id: 1, message: 'Your loan request has been approved', time: '1 hour ago', read: false },
    { id: 2, message: 'New announcement: Annual General Assembly', time: '3 hours ago', read: false },
    { id: 3, message: 'Loan payment due in 5 days', time: '1 day ago', read: true }
  ]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const handleProfileClick = () => {
    setShowProfileModal(true);
    setShowUserMenu(false);
  };

  const handleSettingsClick = () => {
    setActiveModule('settings');
    setShowAccountsMenu(false);
    setShowUserMenu(false);
  };

  const confirmLogout = () => {
    setShowLogoutModal(false);
    navigate('/portal-selection');
  };

  const cancelLogout = () => {
    setShowLogoutModal(false);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = (id) => {
    setNotifications(notifications.map(n =>
      n.id === id ? { ...n, read: true } : n
    ));
  };

  const handleAccountsClick = (subModule) => {
    setActiveModule('my-accounts');
    setActiveSubModule(subModule);
    setShowAccountsMenu(true);
    setIsMobileMenuOpen(false);
  };

  const handleModuleChange = (module) => {
    setActiveModule(module);
    setShowAccountsMenu(false);
    setIsMobileMenuOpen(false);
  };

  const renderModule = () => {
    if (activeModule === 'my-accounts') {
      switch (activeSubModule) {
        case 'savings':
          return <MySavings />;
        case 'time-deposit':
          return <MyTimeDeposit />;
        case 'loans':
          return <MyLoans />;
        default:
          return <MySavings />;
      }
    }

    switch (activeModule) {
      case 'dashboard':
        return <MemberDashboard />;
      case 'requests':
        return <MemberRequests />;
      case 'transactions':
        return <MemberTransactionHistory />;
      case 'settings':
        return (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Settings</h3>
            <div className="space-y-6">
              <div>
                <h4 className="text-md font-semibold text-gray-900 mb-3">Change Password</h4>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Current Password</label>
                    <input type="password" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">New Password</label>
                    <input type="password" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Confirm New Password</label>
                    <input type="password" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                  </div>
                </div>
              </div>
              <button className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                Save Changes
              </button>
            </div>
          </div>
        );
      default:
        return <MemberDashboard />;
    }
  };

  const getModuleTitle = () => {
    if (activeModule === 'my-accounts') {
      switch (activeSubModule) {
        case 'savings':
          return 'Savings';
        case 'time-deposit':
          return 'Time Deposit';
        case 'loans':
          return 'Loans';
        default:
          return 'My Accounts';
      }
    }

    switch (activeModule) {
      case 'dashboard':
        return 'Dashboard';
      case 'requests':
        return 'Requests';
      case 'transactions':
        return 'Transactions';
      case 'settings':
        return 'Settings';
      default:
        return 'Dashboard';
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 bg-white border-r border-gray-200 flex flex-col
        transform transition-transform duration-300 ease-in-out
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AMCOMS</h1>
            <p className="text-indigo-600 text-sm mt-1">Member Portal</p>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {/* Dashboard */}
          <button
            onClick={() => handleModuleChange('dashboard')}
            className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
              activeModule === 'dashboard'
                ? 'bg-indigo-50 text-indigo-700 font-medium'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center space-x-3">
              <span className="text-lg">🏠</span>
              <span>Dashboard</span>
            </div>
          </button>

          {/* My Accounts */}
          <div>
            <button
              onClick={() => setShowAccountsMenu(!showAccountsMenu)}
              className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                activeModule === 'my-accounts'
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="text-lg">💰</span>
                  <span>My Accounts</span>
                </div>
                <svg
                  className={`w-4 h-4 transition-transform ${showAccountsMenu ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {showAccountsMenu && (
              <div className="ml-4 mt-1 space-y-1">
                <button
                  onClick={() => handleAccountsClick('savings')}
                  className={`w-full text-left px-4 py-2 rounded-lg text-sm transition-colors ${
                    activeSubModule === 'savings'
                      ? 'bg-indigo-50 text-indigo-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Savings
                </button>
                <button
                  onClick={() => handleAccountsClick('time-deposit')}
                  className={`w-full text-left px-4 py-2 rounded-lg text-sm transition-colors ${
                    activeSubModule === 'time-deposit'
                      ? 'bg-indigo-50 text-indigo-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Time Deposit
                </button>
                <button
                  onClick={() => handleAccountsClick('loans')}
                  className={`w-full text-left px-4 py-2 rounded-lg text-sm transition-colors ${
                    activeSubModule === 'loans'
                      ? 'bg-indigo-50 text-indigo-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Loans
                </button>
              </div>
            )}
          </div>

          {/* Requests */}
          <button
            onClick={() => handleModuleChange('requests')}
            className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
              activeModule === 'requests'
                ? 'bg-indigo-50 text-indigo-700 font-medium'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center space-x-3">
              <span className="text-lg">📝</span>
              <span>Requests</span>
            </div>
          </button>

          {/* Transactions */}
          <button
            onClick={() => handleModuleChange('transactions')}
            className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
              activeModule === 'transactions'
                ? 'bg-indigo-50 text-indigo-700 font-medium'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center space-x-3">
              <span className="text-lg">📄</span>
              <span>Transactions</span>
            </div>
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-white border-b border-gray-200 px-4 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {/* Hamburger Menu Button */}
              <button
                onClick={() => {
                  setIsMobileMenuOpen(true);
                  setShowUserMenu(false);
                }}
                className="lg:hidden p-2 rounded-lg hover:bg-gray-100"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              <div>
                <h2 className="text-xl lg:text-2xl font-bold text-gray-900">{getModuleTitle()}</h2>
              </div>
            </div>

            <div className="flex items-center space-x-2 lg:space-x-4">
              <div className="relative">
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="p-2 text-gray-600 hover:text-gray-900 relative"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                  )}
                </button>

                {showNotifications && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-10">
                    <div className="p-4 border-b border-gray-200">
                      <h3 className="font-semibold text-gray-800">Notifications</h3>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {notifications.map(notif => (
                        <div
                          key={notif.id}
                          className={`p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${
                            !notif.read ? 'bg-indigo-50' : ''
                          }`}
                          onClick={() => markAsRead(notif.id)}
                        >
                          <p className="text-sm font-medium text-gray-800">{notif.message}</p>
                          <p className="text-xs text-gray-500 mt-1">{notif.time}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="text-right">
                <p className="text-sm text-gray-600">
                  {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>

              <div className="relative">
                <button
                  onClick={() => {
                    setShowUserMenu(!showUserMenu);
                    setIsMobileMenuOpen(false);
                  }}
                  className="flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-gray-50"
                >
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">Juan Dela Cruz</p>
                    <p className="text-xs text-gray-500">Member #M-00125</p>
                  </div>
                  <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                    <span className="text-indigo-600 font-semibold">J</span>
                  </div>
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                    <button
                      onClick={handleProfileClick}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      My Profile
                    </button>
                    <button
                      onClick={handleSettingsClick}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Settings
                    </button>
                    <hr className="my-1" />
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-50"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 lg:p-8">
          {renderModule()}
        </div>
      </div>

      {showLogoutModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 bg-indigo-100 rounded-full mx-auto mb-4">
                <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Confirm Logout</h3>
              <p className="text-gray-600 text-center mb-6">
                Are you sure you want to logout from the Member Portal?
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={cancelLogout}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmLogout}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">My Profile</h2>
              <button
                onClick={() => setShowProfileModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              <MyProfile />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemberPortal;
