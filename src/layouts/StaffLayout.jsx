import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getNavigationForRole, getRoleDisplayName, getRoleColors } from '../config/staffNavigation';

const StaffLayout = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { staff, signOut } = useAuth();
  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState({});
  const userMenuRef = useRef(null);

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

  // Get navigation items for current role
  const navigationItems = getNavigationForRole(staff?.role);
  const roleColors = getRoleColors(staff?.role);
  const roleDisplayName = getRoleDisplayName(staff?.role);

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

  const toggleSubmenu = (menuId) => {
    setExpandedMenus(prev => ({
      ...prev,
      [menuId]: !prev[menuId]
    }));
  };

  const isActiveRoute = (path) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
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
      <div id="staff-sidebar" className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 shrink-0 flex flex-col border-r border-[#e9c46a]/30 bg-gradient-to-b from-blue-950 via-blue-900 to-slate-950 shadow-xl
        transform transition-[margin,transform] duration-300 ease-in-out
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        ${isDesktopSidebarOpen ? 'lg:ml-0' : 'lg:-ml-64'}
      `}>
        {/* Sidebar Header */}
        <div className="flex items-center justify-between border-b border-[#e9c46a]/25 p-6">
          <div>
            <h1 className="text-2xl font-bold text-white">AMCOMS</h1>
            <p className="mt-1 text-sm font-medium text-[#e9c46a]">
              {roleDisplayName}
            </p>
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

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navigationItems.map((item) => (
            <div key={item.id}>
              {/* Main Menu Item */}
              <button
                onClick={() => {
                  if (item.subMenu) {
                    toggleSubmenu(item.id);
                  } else {
                    navigate(item.path);
                    setIsMobileMenuOpen(false);
                  }
                }}
                className={`w-full rounded-lg px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9c46a] ${
                  isActiveRoute(item.path)
                    ? 'bg-gradient-to-r from-[#e9c46a] to-[#d6ab4a] font-semibold text-blue-950 shadow-md'
                    : 'text-blue-50/90 hover:bg-white/10 hover:text-[#f0d995]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <item.icon aria-hidden="true" className="size-5 shrink-0" />
                    <span>{item.name}</span>
                  </div>
                  {item.subMenu && (
                    <svg 
                      className={`w-4 h-4 transition-transform ${expandedMenus[item.id] ? 'rotate-180' : ''}`}
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  )}
                </div>
              </button>

              {/* Submenu */}
              {item.subMenu && expandedMenus[item.id] && (
                <div className="ml-4 mt-1 space-y-1">
                  {item.subMenu.map((subItem) => (
                    <button
                      key={subItem.id}
                      onClick={() => {
                        navigate(subItem.path);
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full rounded-lg px-4 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9c46a] ${
                        isActiveRoute(subItem.path)
                          ? 'bg-gradient-to-r from-[#e9c46a] to-[#d6ab4a] font-semibold text-blue-950 shadow-md'
                          : 'text-blue-50/90 hover:bg-white/10 hover:text-[#f0d995]'
                      }`}
                    >
                      {subItem.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="border-t border-[#e9c46a]/25 p-4">
          <div className="text-center text-xs text-blue-100/70">
            <p>Agay-ayan Multi-Purpose</p>
            <p>Cooperative</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Navigation Bar */}
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
                aria-label="Open staff navigation"
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
                aria-label={isDesktopSidebarOpen ? 'Close staff sidebar' : 'Open staff sidebar'}
                aria-expanded={isDesktopSidebarOpen}
                aria-controls="staff-sidebar"
                title={isDesktopSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
              >
                <Menu aria-hidden="true" size={22} />
              </button>
              
              <div>
                <h2 className="text-xl lg:text-2xl font-bold text-gray-900">
                  Staff Portal
                </h2>
                <p className="text-sm text-gray-500">{roleDisplayName}</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {/* Date Display */}
              <div className="hidden md:block text-right">
                <p className="text-sm text-gray-600">
                  {new Date().toLocaleDateString('en-US', { 
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>

              {/* User Menu */}
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  aria-expanded={showUserMenu}
                  aria-controls="staff-user-menu"
                  onClick={() => {
                    setShowUserMenu(!showUserMenu);
                    setIsMobileMenuOpen(false);
                  }}
                  className="flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-gray-50"
                >
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-medium text-gray-900">{staff?.full_name || 'Staff User'}</p>
                    <p className="text-xs text-gray-500">@{staff?.username}</p>
                  </div>
                  <div className={`w-10 h-10 ${roleColors.bg} bg-opacity-10 rounded-full flex items-center justify-center border-2 ${roleColors.bg} border-opacity-20`}>
                    <span className={`${roleColors.text} font-semibold text-lg`}>
                      {staff?.full_name?.charAt(0) || 'S'}
                    </span>
                  </div>
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showUserMenu && (
                  <div id="staff-user-menu" className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                    <button 
                      onClick={() => {
                        navigate('/staff/profile');
                        setShowUserMenu(false);
                      }}
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

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-4 lg:p-8">
          {children}
        </div>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <div className="w-full max-w-md rounded-xl border border-[#e9c46a]/50 bg-gradient-to-br from-blue-950 via-blue-900 to-slate-950 text-white shadow-2xl">
            <div className="p-6">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[#e9c46a]/50 bg-white/10 text-[#f0d995]">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </div>
              <h3 className="mb-2 text-center text-xl font-bold text-white">Confirm Logout</h3>
              <p className="mb-6 text-center text-blue-100/85">
                Are you sure you want to logout from the Staff Portal?
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
                  className="min-h-11 flex-1 rounded-lg bg-gradient-to-r from-[#e9c46a] to-[#d6ab4a] px-4 py-2 font-semibold text-blue-950 transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9c46a] focus-visible:ring-offset-2 focus-visible:ring-offset-blue-950"
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

export default StaffLayout;
