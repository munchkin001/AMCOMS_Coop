import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import { supabase } from '../lib/supabase';
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
  const { signOut, staff, user } = useAuth();
  const [activeModule, setActiveModule] = useState('dashboard');
  const [activeSubModule, setActiveSubModule] = useState(''); // For My Accounts submenu
  const [showAccountsMenu, setShowAccountsMenu] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    if (!staff?.id) {
      setNotifications([]);
      setNotificationsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, title, message, is_read, priority, action_url, created_at')
        .eq('user_id', staff.id)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;
      setNotifications(data || []);
    } catch (error) {
      console.error('Unable to load member notifications:', error);
    } finally {
      setNotificationsLoading(false);
    }
  }, [staff?.id]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useRealtimeSubscription(
    'notifications',
    fetchNotifications,
    staff?.id ? { column: 'user_id', value: staff.id } : null,
    [staff?.id],
    Boolean(staff?.id)
  );

  useEffect(() => {
    if (!showUserMenu) return undefined;

    const dismissOnOutsideClick = (event) => {
      if (!userMenuRef.current?.contains(event.target)) setShowUserMenu(false);
    };
    const dismissOnEscape = (event) => {
      if (event.key === 'Escape') setShowUserMenu(false);
    };

    document.addEventListener('pointerdown', dismissOnOutsideClick);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOnOutsideClick);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [showUserMenu]);

  const handleLogout = () => {
    setShowUserMenu(false);
    setShowLogoutModal(true);
  };

  const handleProfileClick = () => {
    setActiveModule('profile');
    setShowAccountsMenu(false);
    setIsMobileMenuOpen(false);
    setShowUserMenu(false);
  };

  const confirmLogout = async () => {
    await signOut();
    setShowLogoutModal(false);
    navigate('/portal-selection');
  };

  const cancelLogout = () => {
    setShowLogoutModal(false);
  };

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

  const markAsRead = async (notification) => {
    if (notification.is_read || !staff?.id) return;

    setNotifications((current) => current.map((item) =>
      item.id === notification.id ? { ...item, is_read: true } : item
    ));

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', notification.id)
      .eq('user_id', staff.id);

    if (error) {
      console.error('Unable to mark notification as read:', error);
      setNotifications((current) => current.map((item) =>
        item.id === notification.id ? { ...item, is_read: false } : item
      ));
    }
  };

  const handleAccountsClick = (subModule) => {
    setActiveModule('my-accounts');
    setActiveSubModule(subModule);
    setShowAccountsMenu(true);
    setIsMobileMenuOpen(false); // Close mobile menu
  };

  const handleModuleChange = (module) => {
    setActiveModule(module);
    setShowAccountsMenu(false);
    setIsMobileMenuOpen(false); // Close mobile menu
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
      case 'profile':
        return <MyProfile />;
      case 'requests':
        return <MemberRequests />;
      case 'transactions':
        return <MemberTransactionHistory />;
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
      case 'profile':
        return 'My Profile';
      case 'requests':
        return 'Requests';
      case 'transactions':
        return 'Transactions';
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
      <div id="member-sidebar" className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 shrink-0 flex flex-col border-r border-[#e9c46a]/30 bg-gradient-to-b from-[#0d3b2d] via-[#146344] to-[#2a8057] shadow-xl
        transform transition-[margin,transform] duration-300 ease-in-out
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        ${isDesktopSidebarOpen ? 'lg:ml-0' : 'lg:-ml-64'}
      `}>
        <div className="flex items-center justify-between border-b border-[#e9c46a]/25 p-6">
          <div>
            <h1 className="text-2xl font-bold text-white">AMCOMS</h1>
            <p className="mt-1 text-sm text-[#e9c46a]">Member Portal</p>
          </div>
          {/* Close button for mobile */}
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="rounded-lg p-2 text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9c46a] lg:hidden"
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
            className={`w-full rounded-lg px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9c46a] ${
              activeModule === 'dashboard' 
                ? 'bg-gradient-to-r from-[#e9c46a] to-[#d6ab4a] font-semibold text-[#0d3b2d] shadow-md' 
                : 'text-green-50/95 hover:bg-white/10 hover:text-[#f0d995]'
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
              className={`w-full rounded-lg px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9c46a] ${
                activeModule === 'my-accounts'
                  ? 'bg-gradient-to-r from-[#e9c46a] to-[#d6ab4a] font-semibold text-[#0d3b2d] shadow-md' 
                  : 'text-green-50/95 hover:bg-white/10 hover:text-[#f0d995]'
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
                  className={`w-full rounded-lg px-4 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9c46a] ${
                    activeSubModule === 'savings'
                      ? 'bg-gradient-to-r from-[#e9c46a] to-[#d6ab4a] font-semibold text-[#0d3b2d] shadow-md'
                      : 'text-green-50/90 hover:bg-white/10 hover:text-[#f0d995]'
                  }`}
                >
                  Savings
                </button>
                <button
                  onClick={() => handleAccountsClick('time-deposit')}
                  className={`w-full rounded-lg px-4 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9c46a] ${
                    activeSubModule === 'time-deposit'
                      ? 'bg-gradient-to-r from-[#e9c46a] to-[#d6ab4a] font-semibold text-[#0d3b2d] shadow-md'
                      : 'text-green-50/90 hover:bg-white/10 hover:text-[#f0d995]'
                  }`}
                >
                  Time Deposit
                </button>
                <button
                  onClick={() => handleAccountsClick('loans')}
                  className={`w-full rounded-lg px-4 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9c46a] ${
                    activeSubModule === 'loans'
                      ? 'bg-gradient-to-r from-[#e9c46a] to-[#d6ab4a] font-semibold text-[#0d3b2d] shadow-md'
                      : 'text-green-50/90 hover:bg-white/10 hover:text-[#f0d995]'
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
            className={`w-full rounded-lg px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9c46a] ${
              activeModule === 'requests' 
                ? 'bg-gradient-to-r from-[#e9c46a] to-[#d6ab4a] font-semibold text-[#0d3b2d] shadow-md' 
                : 'text-green-50/95 hover:bg-white/10 hover:text-[#f0d995]'
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
            className={`w-full rounded-lg px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9c46a] ${
              activeModule === 'transactions' 
                ? 'bg-gradient-to-r from-[#e9c46a] to-[#d6ab4a] font-semibold text-[#0d3b2d] shadow-md' 
                : 'text-green-50/95 hover:bg-white/10 hover:text-[#f0d995]'
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
                aria-label="Open member navigation"
                aria-expanded={isMobileMenuOpen}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              <button
                type="button"
                onClick={() => setIsDesktopSidebarOpen((open) => !open)}
                className="hidden shrink-0 items-center justify-center rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9c46a] lg:inline-flex"
                aria-label={isDesktopSidebarOpen ? 'Close member sidebar' : 'Open member sidebar'}
                aria-expanded={isDesktopSidebarOpen}
                aria-controls="member-sidebar"
                title={isDesktopSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
              >
                <Menu aria-hidden="true" size={22} />
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
                      {notificationsLoading ? (
                        <p className="p-4 text-sm text-gray-500">Loading notifications...</p>
                      ) : notifications.length === 0 ? (
                        <p className="p-4 text-sm text-gray-500">You’re all caught up.</p>
                      ) : notifications.map((notification) => (
                        <button
                          key={notification.id}
                          type="button"
                          className={`block w-full border-b border-gray-100 p-4 text-left transition-colors hover:bg-gray-50 ${notification.is_read ? '' : 'bg-emerald-50'}`}
                          onClick={() => markAsRead(notification)}
                        >
                          <span className="flex items-start justify-between gap-3">
                            <span className="text-sm font-medium text-gray-800">{notification.title}</span>
                            {!notification.is_read && <span className="mt-1 size-2 shrink-0 rounded-full bg-emerald-600" aria-label="Unread" />}
                          </span>
                          <span className="mt-1 block text-sm text-gray-600">{notification.message}</span>
                          <span className="mt-2 block text-xs text-gray-500">{new Date(notification.created_at).toLocaleString()}</span>
                        </button>
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

              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  aria-expanded={showUserMenu}
                  aria-controls="member-user-menu"
                  onClick={() => {
                    setShowUserMenu(!showUserMenu);
                    setIsMobileMenuOpen(false);
                  }}
                  className="flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-gray-50"
                >
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">{staff?.full_name || 'Member'}</p>
                    <p className="text-xs text-gray-500">{user?.email || 'Member account'}</p>
                  </div>
                  <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                    <span className="text-indigo-600 font-semibold">{staff?.full_name?.charAt(0) || 'M'}</span>
                  </div>
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showUserMenu && (
                  <div id="member-user-menu" className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                    <button 
                      onClick={handleProfileClick}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      My Profile
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <div className="w-full max-w-md rounded-xl border border-[#e9c46a]/50 bg-gradient-to-br from-[#0d3b2d] via-[#146344] to-[#2a8057] text-white shadow-2xl">
            <div className="p-6">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[#e9c46a]/50 bg-white/10 text-[#f0d995]">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </div>
              <h3 className="mb-2 text-center text-xl font-bold text-white">Confirm Logout</h3>
              <p className="mb-6 text-center text-green-50/85">
                Are you sure you want to logout from the Member Portal?
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={cancelLogout}
                  className="min-h-11 flex-1 rounded-lg border border-white/25 bg-white/10 px-4 py-2 font-medium text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9c46a]"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmLogout}
                  className="min-h-11 flex-1 rounded-lg bg-gradient-to-r from-[#e9c46a] to-[#d6ab4a] px-4 py-2 font-semibold text-[#0d3b2d] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9c46a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d3b2d]"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default MemberPortal;
