import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const { login, loading: authLoading } = useAuth();
const [username, setUsername] = useState('');
const [password, setPassword] = useState('');
const [loading, setLoading] = useState(false);
const [error, setError] = useState('');

const handleLogin = async (e) => {
  e.preventDefault();
  setError('');
  setLoading(true);

  try {
    const result = await login(username.trim(), password);

    if (!result.success) {
      setError(result.error || 'Unable to sign in.');
      return;
    }

    const portalMap = {
      chairman: '/chairman-portal',
      manager: '/manager-portal',
      treasurer: '/treasurer-portal',
      bookkeeper: '/bookkeeper-portal',
      inventory: '/inventory-portal',
      member: '/member-portal',
    };

    const destination = portalMap[result.role];

    if (!destination) {
      setError('Your account has no valid portal assignment.');
      return;
    }

    navigate(destination, { replace: true });
  } finally {
    setLoading(false);
  

    setLoading(true);

    try {
      const { data, error: authError } = await signIn(email, password);

      if (authError) {
        if (authError.message.includes('Invalid login credentials')) {
          setError('Invalid email or password');
        } else {
          setError('Login failed. Please try again.');
        }
        return;
      }

      if (data?.user) {
        const portalMap = {
          chairman: '/chairman-portal',
          manager: '/manager-portal',
          treasurer: '/treasurer-portal',
          bookkeeper: '/bookkeeper-portal',
          inventory: '/inventory-portal',
          member: '/member-portal',
        };
        navigate(portalMap[staff?.role] || '/portal-selection');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const colorClasses = {
    purple: { bg: 'bg-purple-700', border: 'border-purple-200', text: 'text-purple-600' },
    blue: { bg: 'bg-blue-700', border: 'border-blue-200', text: 'text-blue-600' },
    green: { bg: 'bg-green-700', border: 'border-green-200', text: 'text-green-600' },
    orange: { bg: 'bg-orange-700', border: 'border-orange-200', text: 'text-orange-600' },
    teal: { bg: 'bg-teal-700', border: 'border-teal-200', text: 'text-teal-600' },
  };

  const colors = colorClasses[config.color] || colorClasses.green;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className={`${colors.bg} text-white px-8 py-10 text-center`}>
            <div className="mb-4">
              <div className="w-20 h-20 bg-white bg-opacity-20 backdrop-blur-sm rounded-full mx-auto flex items-center justify-center border-2 border-white border-opacity-30 p-2">
                <img src="/LOGO.png" alt="Agay-ayan MPC Logo" className="w-full h-full object-contain" />
              </div>
            </div>
            <h1 className="text-3xl font-bold mb-2">{config.title}</h1>
            <p className="text-white/80 text-sm">Agay-ayan Multi-Purpose Cooperative</p>
          </div>

          {/* Form */}
          <div className="px-8 py-8">
            <form onSubmit={handleLogin} className="space-y-5">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="username">
  Username
</label>

<input
  id="username"
  type="text"
  autoComplete="username"
  value={username}
  onChange={(e) => setUsername(e.target.value)}
  placeholder="Enter your username"
  required
  disabled={loading || authLoading}
/>
              </div>

              <div>
                <label htmlFor="password" className="block text-gray-700 text-sm font-semibold mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
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

              <button
                type="submit"
                disabled={loading}
                className={`w-full ${colors.bg} text-white py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Signing In...
                  </span>
                ) : (
                  'Login'
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Back Link */}
        <div className="text-center mt-6">
          <Link to="/portal-selection" className="text-gray-600 hover:text-blue-600 text-sm flex items-center justify-center space-x-2 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to Portal Selection</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
