import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const inputClass = 'w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all';

const fields = [
  ['firstName', 'First name', true],
  ['middleName', 'Middle name', false],
  ['lastName', 'Last name', true],
  ['dateOfBirth', 'Date of birth', true, 'date'],
  ['email', 'Email', true, 'email'],
  ['phone', 'Contact number', true, 'tel'],
  ['gender', 'Gender', false, 'select'],
  ['occupation', 'Occupation', false],
  ['barangay', 'Barangay', false],
  ['municipality', 'Municipality / city', false],
  ['province', 'Province', false],
  ['emergencyContactName', 'Emergency contact name', false],
  ['emergencyContactPhone', 'Emergency contact phone', false, 'tel'],
  ['rsbsa', 'RSBSA', false],
  ['tin', 'TIN', false],
  ['ncfrs', 'NCFRS', false],
  ['pcaId', 'PCA ID', false]
];

const MemberSignup = () => {
  const navigate = useNavigate();
  const [showWarningModal, setShowWarningModal] = useState(true);
  const [showSubmittedModal, setShowSubmittedModal] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    middleName: '',
    lastName: '',
    dateOfBirth: '',
    gender: '',
    phone: '',
    occupation: '',
    barangay: '',
    municipality: '',
    province: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    rsbsa: '',
    tin: '',
    ncfrs: '',
    pcaId: '',
    address: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 8 || !/[A-Z]/.test(formData.password) || !/[a-z]/.test(formData.password) || !/[0-9]/.test(formData.password)) {
      setError('Use at least 8 characters with an uppercase letter, a lowercase letter, and a number.');
      return;
    }

    setLoading(true);

    try {
      // Step 1: Sign up the user with Supabase Auth
      const { data: created, error: createError } = await supabase.functions.invoke('member-signup', {
        body: {
          email: formData.email,
          password: formData.password,
          first_name: formData.firstName,
          last_name: formData.lastName,
          phone: formData.phone
        }
      });
      if (createError) {
        let message = '';
        try { message = (await createError.context?.json())?.error; } catch { /* ignore */ }
        throw new Error(message || 'Failed to create user account');
      }
      if (!created?.created) throw new Error('Failed to create user account');

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password
      });

      if (authError) throw authError;

      if (!authData.user) {
        throw new Error('Failed to create user account');
      }

      const { error: applicationError } = await supabase.rpc('submit_member_application', {
        p_first_name: formData.firstName,
        p_middle_name: formData.middleName || null,
        p_last_name: formData.lastName,
        p_email: formData.email,
        p_phone: formData.phone,
        p_address: formData.address,
        p_barangay: formData.barangay || null,
        p_municipality: formData.municipality || null,
        p_province: formData.province || null,
        p_date_of_birth: formData.dateOfBirth || null,
        p_occupation: formData.occupation || null,
        p_gender: formData.gender || null,
        p_emergency_contact_name: formData.emergencyContactName || null,
        p_emergency_contact_phone: formData.emergencyContactPhone || null,
        p_rsbsa: formData.rsbsa || null,
        p_tin: formData.tin || null,
        p_ncfrs: formData.ncfrs || null,
        p_pca_id: formData.pcaId || null
      });
      if (applicationError) throw applicationError;

      await supabase.auth.signOut();
      setShowSubmittedModal(true);
    } catch (err) {
      console.error('Signup error:', err);
      setError(err.message || 'Failed to create application. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {showSubmittedModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="submitted-title">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
            <div className="flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mx-auto mb-6">
              <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 id="submitted-title" className="text-2xl font-bold text-gray-900 mb-3">Application Received</h2>
            <p className="text-gray-600 mb-6">
              This may take a while. We will notify you via Email for the update.
            </p>
            <button
              type="button"
              onClick={() => navigate('/login/member')}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Warning Modal */}
      {showWarningModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8">
            <div className="flex items-center justify-center w-20 h-20 bg-yellow-100 rounded-full mx-auto mb-6">
              <svg className="w-10 h-10 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            
            <h3 className="text-2xl font-bold text-gray-900 text-center mb-4">
              Important Notice
            </h3>
            
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 rounded">
              <p className="text-gray-800 text-lg leading-relaxed">
                <strong>Please Note:</strong> If you have not visited <strong>Agay-Ayan Multi-Purpose Cooperative</strong> in person, 
                your user credentials may become invalid. Please visit the cooperative office before creating an account.
              </p>
            </div>

            <div className="space-y-3 mb-6 text-gray-700">
              <div className="flex items-start space-x-3">
                <svg className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <div>
                  <p className="font-semibold text-base">Location:</p>
                  <p className="text-sm">Agay-ayan, Gingoog City, Misamis Oriental</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <svg className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="font-semibold text-base">Office Hours:</p>
                  <p className="text-sm">Monday - Friday: 8:00 AM - 5:00 PM</p>
                  <p className="text-sm">Saturday: 8:00 AM - 12:00 PM</p>
                </div>
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => navigate('/login/member')}
                className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
              >
                Go Back
              </button>
              <button
                onClick={() => setShowWarningModal(false)}
                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                I Understand
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Signup Form */}
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-green-100 py-12 px-4">
        <div className="max-w-2xl mx-auto">
          {/* Back Button */}
          <button
            onClick={() => navigate('/login/member')}
            className="mb-6 flex items-center space-x-2 text-gray-700 hover:text-green-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="font-medium">Back to Login</span>
          </button>

          {/* Signup Card */}
          <div className="bg-white rounded-2xl shadow-2xl p-8 border-t-4 border-green-600">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="flex items-center justify-center space-x-3 mb-4">
                <img src="/LOGO.png" alt="Logo" className="w-16 h-16 object-contain" />
                <div className="text-left">
                  <h1 className="text-2xl font-bold text-gray-900">AMCOMS</h1>
                </div>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-2">Create Member Account</h2>
              <p className="text-gray-600 text-base">
                Apply for membership. Your application will be reviewed.
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded">
                <div className="flex items-center">
                  <svg className="w-5 h-5 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-red-700 text-sm font-medium">{error}</p>
                </div>
              </div>
            )}

            {/* Signup Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {fields.map(([name, label, required, type = 'text']) => (
                  <div key={name}>
                    <label className="mb-2 block font-medium text-gray-700">
                      {label} {required && <span className="text-red-500">*</span>}
                    </label>
                    {type === 'select' ? (
                      <select name={name} value={formData[name]} onChange={handleChange} required={required} className={inputClass}>
                        <option value="">Not specified</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    ) : (
                      <input type={type} name={name} value={formData[name]} onChange={handleChange} required={required} max={type === 'date' ? new Date().toISOString().slice(0, 10) : undefined} className={inputClass} />
                    )}
                  </div>
                ))}
                <div className="md:col-span-3">
                  <label className="mb-2 block font-medium text-gray-700">
                    Address <span className="text-red-500">*</span>
                  </label>
                  <textarea name="address" value={formData.address} onChange={handleChange} rows="2" className={inputClass} required />
                </div>
              </div>
              {/* Password */}
              <div>
                <label className="block text-gray-700 font-medium mb-2">
                  Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all pr-12"
                    minLength="6"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
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

              <div>
                <label className="block text-gray-700 font-medium mb-2">
                  Confirm Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all pr-12"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showConfirmPassword ? (
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

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 text-lg"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Submitting Application...</span>
                  </>
                ) : (
                  <>
                    <span>Submit Application</span>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </>
                )}
              </button>
            </form>

            {/* Footer Info */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              <div className="bg-green-50 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <svg className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-sm text-gray-700 font-medium mb-1">What happens next?</p>
                    <p className="text-sm text-gray-600">
                      Your application will be reviewed by the cooperative. You'll be notified once your account is approved.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center mt-6">
            <p className="text-gray-600 text-sm">
              Already have an account?{' '}
              <button
                onClick={() => navigate('/login/member')}
                className="text-green-600 hover:text-green-700 font-medium"
              >
                Sign in here
              </button>
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default MemberSignup;
