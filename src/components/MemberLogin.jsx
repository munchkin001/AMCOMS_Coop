import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const MemberLogin = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    setLoading(true);

    try {
      // 1. Authenticate with Supabase
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        if (authError.message.includes('Invalid login credentials')) {
          setError('Invalid email or password. Please check and try again.');
        } else {
          setError(authError.message);
        }
        setLoading(false);
        return;
      }

      if (!authData.user) {
        setError('Login failed. Please try again.');
        setLoading(false);
        return;
      }

      // 2. Check member application status
      const { data: application, error: appError } = await supabase
        .from('member_applications')
        .select('*')
        .eq('user_id', authData.user.id)
        .single();

      if (appError && appError.code !== 'PGRST116') {
        console.error('Error checking application:', appError);
      }

      // 3. Check if application exists
      if (!application) {
        // No application found - might be old member or error
        setError('No membership application found. Please contact the cooperative office or register first.');
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      // 4. Check application status
      if (application.status === 'pending') {
        setError('Your application is still pending approval. Please wait for the manager to review your application.');
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      if (application.status === 'rejected') {
        setError(`Your application was rejected. Reason: ${application.rejection_reason || 'Not specified'}. Please contact the cooperative office.`);
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      // 5. Check if member record exists (should be auto-created by trigger)
      const { data: staff, error: staffError } = await supabase
        .from('staff')
        .select('*, members(*)')
        .eq('user_id', authData.user.id)
        .eq('role', 'member')
        .single();

      if (staffError || !staff) {
        setError('Member profile not found. Please contact the cooperative office.');
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      if (!staff.is_active) {
        setError('Your account has been deactivated. Please contact the cooperative office.');
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      // 6. Success! Redirect to member portal
      navigate('/member-portal');

    } catch (err) {
      console.error('Login error:', err);
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-br from-green-700 to-green-800 text-white px-8 py-12 text-center">
            {/* Logo */}
            <div className="mb-6">
              <div className="w-24 h-24 bg-white bg-opacity-20 backdrop-blur-sm rounded-full mx-auto flex items-center justify-center border-2 border-white border-opacity-30 p-3">
                <img
                  src="/LOGO.png"
                  alt="Agay-ayan MPC Logo"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            {/* System Name */}
            <h1 className="text-4xl font-bold mb-3">Member Portal</h1>
            <p className="text-green-100 text-xl font-medium">Agay-ayan Multi-Purpose Cooperative</p>
          </div>

          {/* Form */}
          <div className="px-8 py-10">
            <form onSubmit={handleLogin} className="space-y-6">
              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border-2 border-red-200 text-red-800 px-5 py-4 rounded-xl text-base">
                  <div className="flex items-start">
                    <svg className="w-6 h-6 text-red-600 mr-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{error}</span>
                  </div>
                </div>
              )}

              {/* Email Field */}
              <div>
                <label htmlFor="email" className="block text-gray-800 text-lg font-bold mb-3">
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="w-full px-5 py-4 text-lg border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                  required
                  disabled={loading}
                />
              </div>

              {/* Password Field */}
              <div>
                <label htmlFor="password" className="block text-gray-800 text-lg font-bold mb-3">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full px-5 py-4 text-lg border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all pr-14"
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    disabled={loading}
                  >
                    {showPassword ? (
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Login Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 text-white text-xl font-bold py-5 px-6 rounded-xl transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center shadow-lg"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Logging In...
                  </>
                ) : (
                  'LOGIN'
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t-2 border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-base">
                <span className="px-4 bg-white text-gray-500 font-medium">New Member?</span>
              </div>
            </div>

            {/* Sign Up Button */}
            <Link
              to="/member-signup"
              className="block w-full bg-blue-600 hover:bg-blue-700 text-white text-xl font-bold py-5 px-6 rounded-xl transition-colors text-center shadow-lg"
            >
              Create Account
            </Link>
          </div>
        </div>

        {/* Back to Portal Selection */}
        <div className="text-center mt-6">
          <Link
            to="/portal-selection"
            className="text-gray-700 hover:text-green-600 text-lg flex items-center justify-center space-x-2 transition-colors font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to Portal Selection</span>
          </Link>
        </div>

        {/* Information Box */}
        <div className="mt-6 bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
          <div className="flex items-start space-x-4">
            <svg className="w-8 h-8 text-blue-600 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h4 className="text-lg font-bold text-blue-900 mb-2">First Time Member?</h4>
              <p className="text-base text-blue-800">
                Click "Create Account" to register. Your application will be reviewed by the manager.
                Once approved, you can login and access all member services.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-sm text-gray-500">
            Secured & Protected by AMCOMS
          </p>
        </div>
      </div>
    </div>
  );
};

export default MemberLogin;
