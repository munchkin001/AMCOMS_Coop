import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from './common/LoadingSpinner';

/**
 * ProtectedRoute Component
 * Protects routes from unauthorized access based on authentication and role
 * 
 * @param {Object} props
 * @param {React.Component} props.children - Component to render if authorized
 * @param {string|string[]} props.allowedRoles - Role(s) allowed to access this route
 * @param {string} props.redirectTo - Where to redirect if unauthorized (default: /portal-selection)
 */
const ProtectedRoute = ({ 
  children, 
  allowedRoles = [], 
  redirectTo = '/portal-selection' 
}) => {
  const { user, staff, loading, authError } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <LoadingSpinner size="large" />
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated - redirect to portal selection
  if (!user || !staff) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // Staff profile error or inactive account
  if (authError || !staff.is_active) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-6">
            {authError || 'Your account has been deactivated. Please contact the administrator.'}
          </p>
          <a 
            href={redirectTo}
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to Login
          </a>
        </div>
      </div>
    );
  }

  // Check role authorization
  if (allowedRoles.length > 0) {
    const userRole = staff.role;
    const hasAccess = Array.isArray(allowedRoles) 
      ? allowedRoles.includes(userRole)
      : allowedRoles === userRole;

    if (!hasAccess) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8 text-center">
            <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Unauthorized Access</h2>
            <p className="text-gray-600 mb-2">
              You do not have permission to access this portal.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Your role: <span className="font-semibold">{userRole}</span>
            </p>
            <a 
              href={redirectTo}
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Back to Login
            </a>
          </div>
        </div>
      );
    }
  }

  // Authorized - render protected content
  return <>{children}</>;
};

export default ProtectedRoute;
