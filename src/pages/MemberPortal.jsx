import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, ChevronDown, FileText, HandCoins, Home, Landmark, Menu, PiggyBank, UserRound, Wallet } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import { supabase } from '../lib/supabase';
import MemberDashboard from '../components/member/MemberDashboard';
import MyProfile from '../components/member/MyProfile';
import MSOSavings from '../components/member/MSOSavings';
import MSOTimeDeposit from '../components/member/MSOTimeDeposit';
import MSOLoans from '../components/member/MSOLoans';
import MemberTransactionHistory from '../components/member/MemberTransactionHistory';
import MemberAnnouncements from '../components/member/MemberAnnouncements';

const MemberPortal = () => {
  const navigate = useNavigate();
  const { signOut, staff } = useAuth();
  const [activeModule, setActiveModule] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
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

  // Real-time subscription for notifications
  useRealtimeSubscription(
    'notifications',
    fetchNotifications,
    staff?.id ? { column: 'user_id', value: staff.id } : null,
    [fetchNotifications],
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

  const handleModuleChange = (module) => {
    setActiveModule(module);
    setIsMobileMenuOpen(false); // Close mobile menu
  };

  const handleDashboardNavigate = (target) => handleModuleChange(target);

  const renderAccountPage = (page) => (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => handleModuleChange('profile')}
        className="inline-flex items-center gap-1 text-sm font-medium text-[#146344] md:hidden"
      >
        <ArrowLeft aria-hidden="true" size={18} /> Back to profile
      </button>
      {page}
    </div>
  );

  const renderModule = () => {
    switch (activeModule) {
      case 'dashboard':
        return <MemberDashboard onNavigate={handleDashboardNavigate} />;
      case 'savings':
        return renderAccountPage(<MSOSavings />);
      case 'time-deposit':
        return renderAccountPage(<MSOTimeDeposit />);
      case 'loans':
        return renderAccountPage(<MSOLoans />);
      case 'profile':
        return <MyProfile />;
      case 'transactions':
        return <MemberTransactionHistory />;
      case 'announcements':
        return <MemberAnnouncements />;
      default:
        return <MemberDashboard onNavigate={handleDashboardNavigate} />;
    }
  };

  const getModuleTitle = () => {
    switch (activeModule) {
      case 'dashboard':
        return 'Dashboard';
      case 'savings':
        return 'Savings';
      case 'time-deposit':
        return 'Time Deposit';
      case 'loans':
        return 'Loans';
      case 'profile':
        return 'Profile';
      case 'transactions':
        return 'Transactions';
      case 'announcements':
        return 'Announcements';
      default:
        return 'Dashboard';
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div id="member-sidebar" className={`
        hidden md:flex md:static inset-y-0 left-0 z-50
        w-64 shrink-0 flex-col border-r border-[#e9c46a]/30 bg-gradient-to-b from-[#0d3b2d] via-[#146344] to-[#2a8057] shadow-xl
        transition-[margin] duration-300 ease-in-out
        ${isDesktopSidebarOpen ? 'md:ml-0' : 'md:-ml-64'}
      `}>
        <div className="flex items-center justify-between border-b border-[#e9c46a]/25 p-6">
          <div>
            <h1 className="text-2xl font-bold text-white">AMCOMS</h1>
            <p className="mt-1 text-sm text-[#e9c46a]">Member Portal</p>
          </div>
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
              <Home size={18} />
              <span>Dashboard</span>
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
              <FileText size={18} />
              <span>Transactions</span>
            </div>
          </button>

          <button
            onClick={() => handleModuleChange('announcements')}
            className={`w-full rounded-lg px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9c46a] ${
              activeModule === 'announcements'
                ? 'bg-gradient-to-r from-[#e9c46a] to-[#d6ab4a] font-semibold text-[#0d3b2d] shadow-md'
                : 'text-green-50/95 hover:bg-white/10 hover:text-[#f0d995]'
            }`}
          >
            <div className="flex items-center space-x-3">
              <Bell size={18} />
              <span>Announcements</span>
            </div>
          </button>

          <button
            onClick={() => handleModuleChange('profile')}
            aria-current={activeModule === 'profile' ? 'page' : undefined}
            className={`w-full rounded-lg px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9c46a] ${
              activeModule === 'profile'
                ? 'bg-gradient-to-r from-[#e9c46a] to-[#d6ab4a] font-semibold text-[#0d3b2d] shadow-md'
                : 'text-green-50/95 hover:bg-white/10 hover:text-[#f0d995]'
            }`}
          >
            <div className="flex items-center space-x-3">
              <UserRound size={18} />
              <span>Profile</span>
            </div>
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-white border-b border-gray-200 px-3 sm:px-4 md:px-8 py-3 md:py-4">
          <div className="flex items-center justify-between">
            <div className="flex min-w-0 items-center space-x-4">
              <button
                type="button"
                onClick={() => setIsDesktopSidebarOpen((open) => !open)}
                className="hidden shrink-0 items-center justify-center rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9c46a] md:inline-flex"
                aria-label={isDesktopSidebarOpen ? 'Close member sidebar' : 'Open member sidebar'}
                aria-expanded={isDesktopSidebarOpen}
                aria-controls="member-sidebar"
                title={isDesktopSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
              >
                <Menu aria-hidden="true" size={22} />
              </button>
              
              <div>
                <h2 className="truncate text-lg md:text-2xl font-bold text-gray-900">{getModuleTitle()}</h2>
              </div>
            </div>

            <div className="flex items-center space-x-2 md:space-x-4">
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

              <div className="hidden text-right md:block">
                <p className="whitespace-nowrap text-sm text-gray-600">
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
                  className="flex items-center space-x-2 rounded-lg px-1 py-1 hover:bg-gray-50 md:space-x-3 md:px-3 md:py-2"
                >
                  <div className="hidden text-right md:block">
                    <p className="text-sm font-medium text-gray-900">{staff?.full_name || 'Member'}</p>
                  </div>
                  <div className="h-9 w-9 shrink-0 md:h-10 md:w-10 bg-indigo-100 rounded-full flex items-center justify-center">
                    <span className="text-indigo-600 font-semibold">{staff?.full_name?.charAt(0) || 'M'}</span>
                  </div>
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showUserMenu && (
                  <div id="member-user-menu" className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
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

        <div className="flex-1 overflow-auto p-4 pb-24 md:p-8 md:pb-8">
          {renderModule()}
        </div>

        <nav aria-label="Member quick navigation" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_8px_rgba(0,0,0,0.05)] md:hidden">
          {[
            { id: 'dashboard', label: 'Home', Icon: Home },
            { id: 'transactions', label: 'Transactions', Icon: FileText },
            { id: 'profile', label: 'Profile', Icon: UserRound }
          ].map(({ id, label, Icon }) => {
            const active = activeModule === id || (id === 'profile' && ['savings', 'time-deposit', 'loans'].includes(activeModule));
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleModuleChange(id)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-700 ${active ? 'text-[#146344]' : 'text-gray-500'}`}
              >
                <Icon aria-hidden="true" size={22} strokeWidth={active ? 2.4 : 1.8} />
                {label}
              </button>
            );
          })}
        </nav>
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
