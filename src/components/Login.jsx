import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Login = () => {
  const { portalType } = useParams(); // Get portal type from URL
  const navigate = useNavigate();
  const { signIn, staff } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({ email: '', password: '' });
  const [portalConfig, setPortalConfig] = useState({
    name: 'AMCOMS',
    subtitle: 'Login Portal',
    cooperative: 'Agay-ayan Multi-Purpose Cooperative',
    gradient: 'from-blue-800 to-blue-900',
    buttonColor: 'bg-blue-800 hover:bg-blue-900',
    inputFocus: 'focus:ring-blue-500 focus:border-blue-500',
    linkColor: 'text-blue-600 hover:text-blue-800',
    backLinkHover: 'hover:text-blue-600'
  });

  useEffect(() => {
    // Configure the login page based on selected portal
    const configs = {
      'chairman': {
        name: 'AMCOMS',
        subtitle: 'Chairman Portal',
        cooperative: 'Agay-ayan Multi-Purpose Cooperative',
        gradient: 'from-blue-800 to-blue-900',
        buttonColor: 'bg-blue-800 hover:bg-blue-900',
        inputFocus: 'focus:ring-blue-500 focus:border-blue-500',
        linkColor: 'text-blue-600 hover:text-blue-800',
        backLinkHover: 'hover:text-blue-600'
      },
      'manager': {
        name: 'AMCOMS',
        subtitle: 'Manager Portal',
        cooperative: 'Agay-ayan Multi-Purpose Cooperative',
        gradient: 'from-green-700 to-green-800',
        buttonColor: 'bg-green-700 hover:bg-green-800',
        inputFocus: 'focus:ring-green-500 focus:border-green-500',
        linkColor: 'text-green-600 hover:text-green-800',
        backLinkHover: 'hover:text-green-600'
      },
      'treasurer': {
        name: 'AMCOMS',
        subtitle: 'Treasurer Portal',
        cooperative: 'Agay-ayan Multi-Purpose Cooperative',
        gradient: 'from-teal-700 to-teal-800',
        buttonColor: 'bg-teal-700 hover:bg-teal-800',
        inputFocus: 'focus:ring-teal-500 focus:border-teal-500',
        linkColor: 'text-teal-600 hover:text-teal-800',
        backLinkHover: 'hover:text-teal-600'
      },
      'bookkeeper': {
        name: 'AMCOMS',
        subtitle: 'Bookkeeper Portal',
        cooperative: 'Agay-ayan Multi-Purpose Cooperative',
        gradient: 'from-purple-700 to-purple-800',
        buttonColor: 'bg-purple-700 hover:bg-purple-800',
        inputFocus: 'focus:ring-purple-500 focus:border-purple-500',
        linkColor: 'text-purple-600 hover:text-purple-800',
        backLinkHover: 'hover:text-purple-600'
      },
      'inventory': {
        name: 'AMCOMS',
        subtitle: 'Inventory Staff Portal',
        cooperative: 'Agay-ayan Multi-Purpose Cooperative',
        gradient: 'from-orange-700 to-orange-800',
        buttonColor: 'bg-orange-700 hover:bg-orange-800',
        inputFocus: 'focus:ring-orange-500 focus:border-orange-500',
        linkColor: 'text-orange-600 hover:text-orange-800',
        backLinkHover: 'hover:text-orange-600'
      },
      'member': {
        name: 'AMCOMS',
        subtitle: 'Member Portal',
        cooperative: 'Agay-ayan Multi-Purpose Cooperative',
        gradient: 'from-green-800 to-green-900',
        buttonColor: 'bg-green-800 hover:bg-green-900',
        inputFocus: 'focus:ring-green-500 focus:border-green-500',
        linkColor: 'text-green-600 hover:text-green-800',
        backLinkHover: 'hover:text-green-600'
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

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({ email: '', password: '' });

    // Validate fields
    const errors = {};
    if (!email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Please enter a valid email address';
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
      // Authenticate with Supabase
      const { data, error: signInError } = await signIn(email, password);

      if (signInError) {
        if (signInError.message.includes('Invalid login credentials')) {
          setError('Invalid email or password. Please try again.');
        } else if (signInError.message.includes('Email not confirmed')) {
          setError('Please verify your email address before logging in.');
        } else {
          setError(signInError.message || 'An error occurred. Please try again.');
        }
        setLoading(false);
        return;
      }

      // Wait a moment for staff profile to load
      await new Promise(resolve => setTimeout(resolve, 500));

      // Get the staff data from context (it should be loaded by AuthContext)
      // We'll check if the user has access to the selected portal
      if (staff) {
        // Normalize role comparison (handle both 'role' and 'position' fields)
        const userRole = staff.role || staff.position;
        
        // Check if user's role matches the selected portal
        if (portalType && userRole !== portalType) {
          setError('You do not have access to this portal. Please contact the administrator.');
          setLoading(false);
          return;
        }

        // Store remember me preference
        if (rememberMe) {
          localStorage.setItem('amcoms_remember', 'true');
        } else {
          localStorage.removeItem('amcoms_remember');
        }

        // Redirect to the appropriate portal
        redirectToPortal(userRole);
      } else {
        setError('Unable to load user profile. Please try again.');
        setLoading(false);
      }
      
    } catch (err) {
      console.error('Login error:', err);
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  // Redirect to appropriate portal based on role
  const redirectToPortal = (role) => {
    const portals = {
      'chairman': '/chairman-portal',
      'manager': '/manager-portal',
      'treasurer': '/treasurer-portal',
      'bookkeeper': '/bookkeeper-portal',
      'inventory': '/inventory-portal',
      'member': '/member-portal'
    };
    
    navigate(portals[role] || '/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className={`bg-gradient-to-br ${portalConfig.gradient} text-white px-8 py-12 text-center`}>
            {/* Logo */}
            <div className="mb-4">
              <div className="w-20 h-20 bg-white bg-opacity-20 backdrop-blur-sm rounded-full mx-auto flex items-center justify-center border-2 border-white border-opacity-30 p-2">
                <img 
                  src="/LOGO.png" 
                  alt="Agay-ayan MPC Logo" 
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            {/* System Name */}
            <h1 className="text-3xl font-bold mb-2">{portalConfig.name}</h1>
            <p className="text-blue-200 text-sm font-medium mb-1">{portalConfig.subtitle}</p>
            <p className="text-blue-300 text-xs">{portalConfig.cooperative}</p>
          </div>

          {/* Form */}
          <div className="px-8 py-8">
            <form onSubmit={handleLogin}>
              {/* Error Message */}
              {error && (
                <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* Email Field */}
              <div className="mb-5">
                <label htmlFor="email" className="block text-gray-700 text-sm font-semibold mb-2">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email) {
                      setFieldErrors(prev => ({ ...prev, email: '' }));
                    }
                  }}
                  placeholder="Enter your email"
                  className={`w-full px-4 py-3 border-2 ${fieldErrors.email ? 'border-red-300' : 'border-gray-200'} rounded-lg focus:outline-none focus:ring-2 ${portalConfig.inputFocus} transition-all`}
                  required
                  disabled={loading}
                />
                {fieldErrors.email && (
                  <p className="mt-1 text-sm text-red-600 flex items-center space-x-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span>{fieldErrors.email}</span>
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
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldErrors.password) {
                        setFieldErrors(prev => ({ ...prev, password: '' }));
                      }
                    }}
                    placeholder="Enter your password"
                    className={`w-full px-4 py-3 border-2 ${fieldErrors.password ? 'border-red-300' : 'border-gray-200'} rounded-lg focus:outline-none focus:ring-2 ${portalConfig.inputFocus} transition-all pr-12`}
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
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
                    className="mr-2 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
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
                className={`w-full ${portalConfig.buttonColor} text-white py-3 rounded-lg font-semibold transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center`}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Logging in...
                  </>
                ) : (
                  'LOGIN'
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
          <p className="text-xs text-gray-400 mb-2">
            💡 Tip: Press <kbd className="px-2 py-1 bg-gray-100 border border-gray-300 rounded text-gray-700">Enter</kbd> to login or <kbd className="px-2 py-1 bg-gray-100 border border-gray-300 rounded text-gray-700">Esc</kbd> to go back
          </p>
          <p className="text-xs text-gray-400">
            Protected by Design — Secured Through & All
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
