import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getNavigationForRole, getRoleDisplayName, getRoleColors } from './staffNavigation';

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
  const isChairman = staff?.role === 'chairman';
  const isManager = staff?.role === 'manager';
  const isTreasurer = staff?.role === 'treasurer';
  const isBookkeeper = staff?.role === 'bookkeeper';
  const isInventory = staff?.role === 'inventory';

  const handleLogout = () => {
    setShowUserMenu(false);
    setShowLogoutModal(true);
  };

  const confirmLogout = async () => {
    await signOut();
    setShowLogoutModal(false);
    navigate('/');
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
    <div className={`amcoms-portal-shell flex h-screen ${isChairman ? 'amcoms-chairman-portal' : ''} ${isManager ? 'amcoms-manager-portal' : ''} ${isTreasurer ? 'amcoms-treasurer-portal' : ''} ${isBookkeeper ? 'amcoms-bookkeeper-portal' : ''} ${isInventory ? 'amcoms-inventory-portal' : ''}`}>
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
        ${isChairman ? 'ch-sidebar' : ''}
        ${isManager ? 'mgr-sidebar' : ''}
        ${isTreasurer ? 'tr-sidebar' : ''}
        ${isBookkeeper ? 'bk-sidebar' : ''}
        ${isInventory ? 'inv-sidebar' : ''}
        transform transition-[margin,transform] duration-300 ease-in-out
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        ${isDesktopSidebarOpen ? 'lg:ml-0' : 'lg:-ml-64'}
      `}>
        {/* Sidebar Header */}
        <div className="flex items-center justify-between border-b border-[#e9c46a]/25 p-6">
          <div>
            <h1 className={`text-2xl font-bold ${isManager ? 'text-orange-950' : 'text-white'}`}>AMCOMS</h1>
            <p className={`mt-1 text-sm font-medium ${isChairman ? 'text-blue-200' : isManager ? 'text-orange-950/80' : isBookkeeper ? 'text-purple-200' : isTreasurer ? 'text-teal-100' : isInventory ? 'text-lime-200' : 'text-[#e9c46a]'}`}>
              {roleDisplayName}
            </p>
          </div>
          {/* Close button for mobile */}
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className={`rounded-lg p-2 ${isManager ? 'text-orange-950 hover:bg-white/40' : 'text-white hover:bg-white/10'} focus-visible:outline-none focus-visible:ring-2 ${isChairman ? 'focus-visible:ring-blue-200' : isManager ? 'focus-visible:ring-orange-700' : isBookkeeper ? 'focus-visible:ring-purple-200' : isTreasurer ? 'focus-visible:ring-teal-200' : 'focus-visible:ring-[#e9c46a]'} lg:hidden`}
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
                className={`w-full rounded-lg px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 ${isChairman ? 'focus-visible:ring-blue-200' : isManager ? 'focus-visible:ring-orange-700' : isBookkeeper ? 'focus-visible:ring-purple-300' : isTreasurer ? 'focus-visible:ring-teal-200' : 'focus-visible:ring-[#e9c46a]'} ${
                  isActiveRoute(item.path)
                    ? isChairman ? 'bg-gradient-to-r from-blue-300 to-blue-100 font-semibold text-blue-950 shadow-md' : isManager ? 'bg-gradient-to-r from-white/90 to-orange-100 font-semibold text-orange-950 shadow-md' : isBookkeeper ? 'bg-gradient-to-r from-purple-300 to-purple-200 font-semibold text-purple-950 shadow-md' : isTreasurer ? 'bg-gradient-to-r from-teal-200 to-cyan-100 font-semibold text-teal-950 shadow-md' : 'bg-gradient-to-r from-[#e9c46a] to-[#d6ab4a] font-semibold text-blue-950 shadow-md'
                    : isChairman ? 'text-blue-50/90 hover:bg-white/10 hover:text-blue-100' : isManager ? 'text-orange-950/85 hover:bg-white/45 hover:text-orange-950' : isBookkeeper ? 'text-purple-50/90 hover:bg-white/10 hover:text-purple-100' : isTreasurer ? 'text-teal-50/90 hover:bg-white/10 hover:text-teal-100' : 'text-blue-50/90 hover:bg-white/10 hover:text-[#f0d995]'
                }`}
                aria-current={isActiveRoute(item.path) ? 'page' : undefined}
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
                      className={`w-full rounded-lg px-4 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 ${isChairman ? 'focus-visible:ring-blue-200' : isManager ? 'focus-visible:ring-orange-700' : isBookkeeper ? 'focus-visible:ring-purple-300' : isTreasurer ? 'focus-visible:ring-teal-200' : 'focus-visible:ring-[#e9c46a]'} ${
                        isActiveRoute(subItem.path)
                          ? isChairman ? 'bg-gradient-to-r from-blue-300 to-blue-100 font-semibold text-blue-950 shadow-md' : isManager ? 'bg-gradient-to-r from-white/90 to-orange-100 font-semibold text-orange-950 shadow-md' : isBookkeeper ? 'bg-gradient-to-r from-purple-300 to-purple-200 font-semibold text-purple-950 shadow-md' : isTreasurer ? 'bg-gradient-to-r from-teal-200 to-cyan-100 font-semibold text-teal-950 shadow-md' : 'bg-gradient-to-r from-[#e9c46a] to-[#d6ab4a] font-semibold text-blue-950 shadow-md'
                          : isChairman ? 'text-blue-50/90 hover:bg-white/10 hover:text-blue-100' : isManager ? 'text-orange-950/85 hover:bg-white/45 hover:text-orange-950' : isBookkeeper ? 'text-purple-50/90 hover:bg-white/10 hover:text-purple-100' : isTreasurer ? 'text-teal-50/90 hover:bg-white/10 hover:text-teal-100' : 'text-blue-50/90 hover:bg-white/10 hover:text-[#f0d995]'
                      }`}
                      aria-current={isActiveRoute(subItem.path) ? 'page' : undefined}
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
        <div className={`border-t p-4 ${isManager ? 'border-orange-900/15' : 'border-[#e9c46a]/25'}`}>
          <div className={`text-center text-xs ${isManager ? 'text-orange-950/70' : 'text-blue-100/70'}`}>
            <p>Agay-ayan Multi-Purpose</p>
            <p>Cooperative</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Navigation Bar */}
        <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-4 shadow-sm backdrop-blur lg:px-8">
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
                className={`hidden shrink-0 items-center justify-center rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 ${isChairman ? 'focus-visible:ring-blue-600' : isManager ? 'focus-visible:ring-orange-600' : isBookkeeper ? 'focus-visible:ring-purple-600' : isTreasurer ? 'focus-visible:ring-teal-600' : 'focus-visible:ring-[#e9c46a]'} lg:inline-flex`}
                aria-label={isDesktopSidebarOpen ? 'Close staff sidebar' : 'Open staff sidebar'}
                aria-expanded={isDesktopSidebarOpen}
                aria-controls="staff-sidebar"
                title={isDesktopSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
              >
                <Menu aria-hidden="true" size={22} />
              </button>
              
              <div>
                <h2 className="text-xl lg:text-2xl font-bold text-gray-900">
                  {roleDisplayName}
                </h2>
                <p className="text-sm text-gray-500">Staff Portal</p>
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
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${isManager ? 'font-medium text-orange-700' : isBookkeeper ? 'font-medium text-purple-700' : isTreasurer ? 'font-medium text-teal-700' : 'text-red-600'}`}
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
        <a href="#staff-main-content" className="sr-only z-[100] rounded-lg bg-white px-4 py-3 font-semibold text-slate-900 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:shadow-lg">
          Skip to main content
        </a>
        <main id="staff-main-content" tabIndex="-1" className="amcoms-portal-content flex-1 overflow-auto p-4 lg:p-8">
          {children}
        </main>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <div className={`w-full max-w-md rounded-xl border shadow-2xl ${isManager ? 'border-orange-200 bg-gradient-to-br from-orange-50 via-orange-100 to-orange-200 text-orange-950' : `text-white ${isBookkeeper ? 'border-purple-300/40 bg-gradient-to-br from-[#28134b] via-[#542b86] to-[#8a52bf]' : isTreasurer ? 'border-teal-200/50 bg-gradient-to-br from-[#064e50] via-[#087f83] to-[#19a4a0]' : 'border-[#e9c46a]/50 bg-gradient-to-br from-blue-950 via-blue-900 to-slate-950'}`}`}>
            <div className="p-6">
              <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border ${isManager ? 'border-orange-300 bg-white/60 text-orange-800' : `bg-white/10 ${isBookkeeper ? 'border-purple-200/50 text-purple-100' : isTreasurer ? 'border-teal-100/60 text-teal-100' : 'border-[#e9c46a]/50 text-[#f0d995]'}`}`}>
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </div>
              <h3 className={`mb-2 text-center text-xl font-bold ${isManager ? 'text-orange-950' : 'text-white'}`}>Confirm Logout</h3>
              <p className={`mb-6 text-center ${isManager ? 'text-orange-900' : isBookkeeper ? 'text-purple-100' : isTreasurer ? 'text-teal-50' : 'text-blue-100/85'}`}>
                Are you sure you want to logout from the Staff Portal?
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={cancelLogout}
                  className={`min-h-11 flex-1 rounded-lg border px-4 py-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 ${isManager ? 'border-orange-300 bg-white/70 text-orange-900 hover:bg-white focus-visible:ring-orange-500' : 'border-white/25 bg-white/10 text-white hover:bg-white/20'} ${isManager ? '' : isBookkeeper ? 'focus-visible:ring-purple-200' : isTreasurer ? 'focus-visible:ring-teal-200' : 'focus-visible:ring-[#e9c46a]'}`}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmLogout}
                  className={`min-h-11 flex-1 rounded-lg px-4 py-2 font-semibold transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${isManager ? 'bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 text-white focus-visible:ring-orange-500 focus-visible:ring-offset-orange-100' : isBookkeeper ? 'bg-gradient-to-r from-purple-200 via-fuchsia-200 to-purple-300 text-purple-950 focus-visible:ring-purple-200 focus-visible:ring-offset-purple-900' : isTreasurer ? 'bg-gradient-to-r from-teal-100 via-cyan-100 to-teal-200 text-teal-950 focus-visible:ring-teal-100 focus-visible:ring-offset-teal-900' : 'bg-gradient-to-r from-[#e9c46a] to-[#d6ab4a] text-blue-950 focus-visible:ring-[#e9c46a] focus-visible:ring-offset-blue-950'}`}
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
