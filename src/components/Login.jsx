import React, { useState, useEffect, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Login = () => {
  const { portalType } = useParams(); // Get portal type from URL
  const navigate = useNavigate();
  const { login, staff, user } = useAuth();
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({ fullName: '', password: '' });
  const [portalConfig, setPortalConfig] = useState({
    name: 'AMCOMS',
    subtitle: 'Login Portal',
    cooperative: 'Agay-ayan Multi-Purpose Cooperative',
    gradient: 'from-blue-950 to-blue-800',
    buttonColor: 'bg-[#c49a45] hover:bg-[#b18835]',
    inputFocus: 'focus:ring-[#c49a45] focus:border-[#c49a45]',
    linkColor: 'text-blue-800 hover:text-amber-700',
    backLinkHover: 'hover:text-amber-700'
  });

  const redirectToPortal = useCallback((role) => {
    const staffRoles = ['chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory'];

    if (staffRoles.includes(role)) {
      navigate('/staff', { replace: true });
    } else if (role === 'member') {
      navigate('/member', { replace: true });
    } else {
      console.warn('Unknown role, redirecting to home');
      navigate('/', { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    // Configure the login page based on selected portal
    const configs = {
      'staff': {
        name: 'AMCOMS',
        subtitle: 'Staff Portal',
        cooperative: 'Agay-ayan Multi-Purpose Cooperative',
        gradient: 'from-blue-950 to-blue-800',
        buttonColor: 'bg-[#c49a45] hover:bg-[#b18835]',
        inputFocus: 'focus:ring-[#c49a45] focus:border-[#c49a45]',
        linkColor: 'text-blue-800 hover:text-amber-700',
        backLinkHover: 'hover:text-amber-700'
      },
      'member': {
        name: 'AMCOMS',
        subtitle: 'Member Portal',
        cooperative: 'Agay-ayan Multi-Purpose Cooperative',
        gradient: 'from-[#0d3b2d] via-[#146344] to-[#2a8057]',
        buttonColor: 'bg-[#c49a45] hover:bg-[#b18835]',
        inputFocus: 'focus:ring-[#c49a45] focus:border-[#c49a45]',
        linkColor: 'text-emerald-800 hover:text-amber-700',
        backLinkHover: 'hover:text-amber-700'
      }
    };

    if (portalType && configs[portalType]) {
      setPortalConfig(configs[portalType]);
    }

    // Add keyboard shortcuts
    const handleKeyDown = (e) => {
      // Escape key - go back to portal selection
      if (e.key === 'Escape') {
        navigate('/portal-selection');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [portalType, navigate]);

  // Auto-redirect when staff profile loads after login
  useEffect(() => {
    // Only act if we're in loading state and have both user and staff
    if (!user || !staff || !loading) {
      return;
    }

    console.log('Staff profile loaded during login, validating and redirecting...');
    const userRole = staff.role;
    
    // Validate portal access
    const staffRoles = ['chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory'];
    const isStaffUser = staffRoles.includes(userRole);
    const isMemberUser = userRole === 'member';
    
    // Check if user is accessing the correct portal type
    if (portalType === 'staff' && !isStaffUser) {
      setError('You do not have access to the Staff Portal. Please use the Member Portal.');
      setLoading(false);
      return;
    }
    
    if (portalType === 'member' && !isMemberUser) {
      setError('You do not have access to the Member Portal. Please use the Staff Portal.');
      setLoading(false);
      return;
    }

    if (isMemberUser && staff.must_change_password) {
      navigate('/reset-password', { replace: true });
      return;
    }

    // Valid access - redirect to portal
    console.log('Valid access confirmed for role:', userRole, '- redirecting...');
    redirectToPortal(userRole);
    // Note: Keep loading=true until navigation completes
  }, [user, staff, loading, portalType, navigate, redirectToPortal]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({ fullName: '', password: '' });

    // Validate fields
    const errors = {};
    if (!fullName.trim()) {
      errors.fullName = 'Enter your username or full name';
    }
    if (!password.trim()) {
      errors.password = 'Password is required';
    } else if (password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);

    try {
      // Authenticate with username or full name
      const result = await login(fullName, password);

      if (!result.success) {
        setError(result.error || 'Login failed. Please try again.');
        setLoading(false);
        return;
      }

      const userRole = result.staff?.role || result.role;
      const staffRoles = ['chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory'];
      const isStaffUser = staffRoles.includes(userRole);
      const isMemberUser = userRole === 'member';

      if ((portalType === 'staff' && !isStaffUser) || (portalType === 'member' && !isMemberUser)) {
        setError(portalType === 'staff'
          ? 'You do not have access to the Staff Portal. Please use the Member Portal.'
          : 'You do not have access to the Member Portal. Please use the Staff Portal.');
        setLoading(false);
        return;
      }

      // Remember-me is optional and must not turn a successful login into an error.
      try {
        if (rememberMe) {
          localStorage.setItem('amcoms_remember', 'true');
        } else {
          localStorage.removeItem('amcoms_remember');
        }
      } catch (storageError) {
        console.warn('Unable to save remember-me preference:', storageError);
      }

      if (isMemberUser && result.staff?.must_change_password) {
        navigate('/reset-password', { replace: true });
        return;
      }

      redirectToPortal(userRole);
      
    } catch (err) {
      console.error('Unexpected login error:', err);
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#e7efe8_0%,_#f5f6f3_62%)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Login Card */}
        <div className="overflow-hidden rounded-xl border border-emerald-100 bg-white shadow-[0_24px_60px_rgba(16,44,32,0.14)]">
          {/* Header */}
          <div className={`border-b-4 border-[#c49a45] bg-gradient-to-br ${portalConfig.gradient} px-8 py-10 text-center text-white sm:py-12`}>
            {/* Logo */}
            <div className="mb-4">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[#e9c46a]/70 bg-white/10 p-2 shadow-[0_0_24px_rgba(233,196,106,0.18)]">
                <img 
                  src="/LOGO.png" 
                  alt="Agay-ayan MPC Logo" 
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            {/* System Name */}
            <h1 className="text-3xl font-bold mb-2">{portalConfig.name}</h1>
            <p className="mb-1 text-sm font-medium text-[#f0d995]">{portalConfig.subtitle}</p>
            <p className="text-xs text-white/75">{portalConfig.cooperative}</p>
          </div>

          {/* Form */}
          <div className="px-6 py-7 sm:px-8 sm:py-8">
            <form onSubmit={handleLogin}>
              {/* Error Message */}
              {error && (
                <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Full Name Field */}
              <div className="mb-5">
                <label htmlFor="fullName" className="block text-gray-700 text-sm font-semibold mb-2">
                  Username or full name
                </label>
                <input
                  type="text"
                  id="fullName"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (fieldErrors.fullName) {
                      setFieldErrors(prev => ({ ...prev, fullName: '' }));
                    }
                  }}
                  placeholder="Enter your username or full name"
                  className={`w-full rounded-lg border ${fieldErrors.fullName ? 'border-red-300' : 'border-gray-200'} px-4 py-3 transition-all focus:outline-none focus:ring-2 ${portalConfig.inputFocus}`}
                  required
                  disabled={loading}
                />
                {fieldErrors.fullName && (
                  <p className="mt-1 text-sm text-red-600 flex items-center space-x-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span>{fieldErrors.fullName}</span>
                  </p>
                )}
              </div>

              {/* Password Field */}
              <div className="mb-6">
                <label htmlFor="password" className="block text-gray-700 text-sm font-semibold mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldErrors.password) {
                        setFieldErrors(prev => ({ ...prev, password: '' }));
                      }
                    }}
                    placeholder="Enter your password"
                    className={`w-full rounded-lg border ${fieldErrors.password ? 'border-red-300' : 'border-gray-200'} px-4 py-3 pr-12 transition-all focus:outline-none focus:ring-2 ${portalConfig.inputFocus}`}
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    disabled={loading}
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
                {fieldErrors.password && (
                  <p className="mt-1 text-sm text-red-600 flex items-center space-x-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span>{fieldErrors.password}</span>
                  </p>
                )}
              </div>

              {/* Remember Me & Forgot Password */}
              <div className="flex items-center justify-between mb-6">
                <label className="flex items-center text-sm text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="mr-2 h-4 w-4 rounded border-gray-300 accent-[#c49a45] focus:ring-[#c49a45]"
                  />
                  Remember me
                </label>
                <Link to="/forgot-password" className={`text-sm ${portalConfig.linkColor} font-medium`}>
                  Forgot Password?
                </Link>
              </div>

              {/* Login Button */}
              <button
                type="submit"
                disabled={loading}
                className={`flex w-full items-center justify-center rounded-lg ${portalConfig.buttonColor} py-3 font-semibold text-[#183c30] shadow-sm transition-colors hover:shadow-md disabled:cursor-not-allowed disabled:bg-gray-400 disabled:text-white`}
              >
                {loading ? (
                  <>
                    <svg className="-ml-1 mr-3 h-5 w-5 animate-spin text-[#183c30]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Logging in...
                  </>
                ) : (
                  'Sign in'
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Back to Portal Selection */}
        <div className="text-center mt-6">
          <Link 
            to="/portal-selection" 
            className={`text-gray-600 ${portalConfig.backLinkHover} text-sm flex items-center justify-center space-x-2 transition-colors`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to Portal Selection</span>
          </Link>
        </div>

        {/* Footer */}
        <div className="text-center mt-4">
          <p className="mb-2 text-xs text-gray-500">
            Press <kbd className="rounded border border-gray-300 bg-white px-2 py-1 text-gray-700">Enter</kbd> to sign in or <kbd className="rounded border border-gray-300 bg-white px-2 py-1 text-gray-700">Esc</kbd> to go back
          </p>
          <p className="text-xs text-gray-500">
            Secure sign-in for cooperative staff and members
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
