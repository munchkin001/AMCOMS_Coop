import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const ResetPassword = () => {
  const navigate = useNavigate();
  const { updatePassword, staff, loading: authLoading } = useAuth();
  const [username, setUsername] = useState(staff?.username || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [validSession, setValidSession] = useState(false);

  useEffect(() => {
    // Check if user has a valid recovery session
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setValidSession(true);
      } else {
        setError('Sign in with the temporary password provided by the cooperative to change your password.');
      }
    };

    checkSession();
  }, []);

  const validatePassword = (password) => {
    if (password.length < 8) {
      return 'Password must be at least 8 characters long';
    }
    if (!/[A-Z]/.test(password)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/[a-z]/.test(password)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/[0-9]/.test(password)) {
      return 'Password must contain at least one number';
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      return 'Password must contain at least one special character or symbol';
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate passwords
    if (!newPassword || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (staff?.role === 'member' && staff.must_change_password) {
      const normalizedUsername = username.trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,30}$/.test(normalizedUsername)) {
        setError('Username must be 3-30 characters and contain only letters, numbers, dots, underscores, or hyphens.');
        return;
      }
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const { error: updateError, activated } = await updatePassword(
        newPassword,
        staff?.role === 'member' && staff.must_change_password ? username.trim().toLowerCase() : undefined
      );

      if (updateError) {
        throw updateError;
      }
      if (!activated) {
        const { error: auditError } = await supabase.rpc('record_auth_event', { p_event: 'password reset completed' });
        if (auditError) console.error('Password reset audit event could not be recorded.');
      }

      setSuccess(true);

      // Let the auth profile refresh complete before navigating.
      setTimeout(() => {
        navigate(staff?.role === 'member' ? '/member' : '/staff/dashboard', { replace: true });
      }, 1200);

    } catch (err) {
      console.error('Password reset error:', err);
      setError(err.message || 'Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden p-8">
            {/* Success Icon */}
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h2 className="text-2xl font-bold text-gray-900 text-center mb-4">
              Password Reset Successful!
            </h2>

            <p className="text-gray-600 text-center mb-8">
              Your password has been successfully updated. Opening your portal...
            </p>

            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!validSession && error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden p-8">
            {/* Error Icon */}
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>

            <h2 className="text-2xl font-bold text-gray-900 text-center mb-4">
              Sign-in required
            </h2>

            <p className="text-gray-600 text-center mb-8">
              {error}
            </p>

            <a 
              href="/forgot-password"
              className="block w-full bg-blue-800 text-white py-3 rounded-lg font-semibold hover:bg-blue-900 transition-colors text-center"
            >
              Go to Login
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-br from-blue-800 to-blue-900 text-white px-8 py-12 text-center">
            <div className="mb-4">
              <div className="w-20 h-20 bg-white bg-opacity-20 backdrop-blur-sm rounded-full mx-auto flex items-center justify-center border-2 border-white border-opacity-30">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
            </div>

            <h1 className="text-3xl font-bold mb-2">{staff?.must_change_password ? 'Set your AMCOMS password' : 'Change Password'}</h1>
            <p className="text-blue-200 text-sm">{staff?.must_change_password ? 'Create your private password to continue to your account.' : 'Create a new secure password'}</p>
          </div>

          {/* Form */}
          <div className="px-8 py-8">
            <form onSubmit={handleSubmit}>
              {/* Error Message */}
              {error && (
                <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {staff?.role === 'member' && staff.member_number && (
                <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
                  <p className="text-sm text-emerald-900">Member ID</p>
                  <p className="mt-1 text-lg font-semibold text-emerald-950">{staff.member_number}</p>
                </div>
              )}

              {staff?.role === 'member' && staff.must_change_password && (
                <div className="mb-5">
                  <label htmlFor="memberUsername" className="mb-2 block text-sm font-semibold text-gray-700">
                    Choose your username *
                  </label>
                  <input
                    type="text"
                    id="memberUsername"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="Enter a username"
                    autoComplete="username"
                    minLength={3}
                    maxLength={30}
                    required
                    disabled={loading}
                    aria-describedby="memberUsernameHelp"
                    className="w-full rounded-lg border-2 border-gray-200 px-4 py-3 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p id="memberUsernameHelp" className="mt-1.5 text-xs text-gray-500">
                    Use 3-30 letters, numbers, dots, underscores, or hyphens. This will be your username for future sign-ins.
                  </p>
                </div>
              )}

              {/* Password Requirements */}
              <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm font-semibold text-gray-900 mb-2">Password Requirements:</p>
                <ul className="text-xs text-gray-700 space-y-1">
                  <li>• At least 8 characters long</li>
                  <li>• Contains uppercase and lowercase letters</li>
                  <li>• Contains at least one number</li>
                  <li>• Contains at least one special character or symbol</li>
                </ul>
              </div>

              {/* New Password Field */}
              <div className="mb-5">
                <label htmlFor="newPassword" className="block text-gray-700 text-sm font-semibold mb-2">
                  New Password *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="newPassword"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all pr-12"
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Confirm Password Field */}
              <div className="mb-6">
                <label htmlFor="confirmPassword" className="block text-gray-700 text-sm font-semibold mb-2">
                  Confirm Password *
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  required
                  disabled={loading}
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || authLoading}
                className="w-full bg-blue-800 text-white py-3 rounded-lg font-semibold hover:bg-blue-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Resetting Password...
                  </span>
                ) : (
                  'Reset Password'
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Back to Login */}
        <div className="text-center mt-6">
          <a 
            href="/"
            className="text-gray-600 hover:text-blue-600 text-sm flex items-center justify-center space-x-2 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to Website</span>
          </a>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
