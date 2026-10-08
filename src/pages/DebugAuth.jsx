import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

const DebugAuth = () => {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [testEmail, setTestEmail] = useState('manager@amcoms.com');
  const [testPassword, setTestPassword] = useState('manager123');

  const testLogin = async () => {
    setLoading(true);
    const testResults = {
      step1_auth: null,
      step2_staff_by_id: null,
      step3_staff_by_email: null,
      step4_final_status: null,
      errors: []
    };

    try {
      // Step 1: Try authentication
      console.log('Step 1: Testing authentication...');
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: testEmail,
        password: testPassword,
      });

      if (authError) {
        testResults.errors.push(`Auth Error: ${authError.message}`);
        testResults.step1_auth = { success: false, error: authError.message };
      } else {
        testResults.step1_auth = { 
          success: true, 
          user_id: authData.user.id,
          email: authData.user.email 
        };

        // Step 2: Try fetching staff by user_id
        console.log('Step 2: Fetching staff by user_id...');
        const { data: staffById, error: staffByIdError } = await supabase
          .from('staff')
          .select('*')
          .eq('user_id', authData.user.id)
          .maybeSingle();

        if (staffByIdError) {
          testResults.errors.push(`Staff by ID Error: ${staffByIdError.message}`);
          testResults.step2_staff_by_id = { success: false, error: staffByIdError.message };
        } else if (!staffById) {
          testResults.step2_staff_by_id = { success: false, error: 'No staff record found by user_id' };
        } else {
          testResults.step2_staff_by_id = { success: true, data: staffById };
        }

        // Step 3: Try fetching staff by email
        console.log('Step 3: Fetching staff by email...');
        const { data: staffByEmail, error: staffByEmailError } = await supabase
          .from('staff')
          .select('*')
          .eq('email', authData.user.email)
          .maybeSingle();

        if (staffByEmailError) {
          testResults.errors.push(`Staff by Email Error: ${staffByEmailError.message}`);
          testResults.step3_staff_by_email = { success: false, error: staffByEmailError.message };
        } else if (!staffByEmail) {
          testResults.step3_staff_by_email = { success: false, error: 'No staff record found by email' };
        } else {
          testResults.step3_staff_by_email = { success: true, data: staffByEmail };
        }

        // Step 4: Determine final status
        if (testResults.step2_staff_by_id.success) {
          testResults.step4_final_status = 'SUCCESS: Staff found by user_id';
        } else if (testResults.step3_staff_by_email.success) {
          testResults.step4_final_status = 'SUCCESS: Staff found by email (needs linking)';
        } else {
          testResults.step4_final_status = 'FAIL: No staff record found';
        }

        // Sign out after test
        await supabase.auth.signOut();
      }
    } catch (error) {
      testResults.errors.push(`Unexpected Error: ${error.message}`);
      console.error('Test error:', error);
    }

    setResults(testResults);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">🔍 Authentication Debug Tool</h1>
          
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Test Email</label>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Test Password</label>
              <input
                type="password"
                value={testPassword}
                onChange={(e) => setTestPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <button
            onClick={testLogin}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Testing...' : 'Run Authentication Test'}
          </button>

          {results && (
            <div className="mt-8 space-y-4">
              <h2 className="text-xl font-bold text-gray-900">Test Results:</h2>
              
              {/* Step 1: Authentication */}
              <div className={`p-4 rounded-lg border-2 ${results.step1_auth?.success ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}>
                <h3 className="font-bold mb-2">Step 1: Authentication</h3>
                {results.step1_auth?.success ? (
                  <div className="text-sm">
                    <p className="text-green-700">✅ SUCCESS</p>
                    <p className="text-gray-700">User ID: {results.step1_auth.user_id}</p>
                    <p className="text-gray-700">Email: {results.step1_auth.email}</p>
                  </div>
                ) : (
                  <p className="text-red-700">❌ FAILED: {results.step1_auth?.error}</p>
                )}
              </div>

              {/* Step 2: Staff by ID */}
              <div className={`p-4 rounded-lg border-2 ${results.step2_staff_by_id?.success ? 'bg-green-50 border-green-500' : 'bg-yellow-50 border-yellow-500'}`}>
                <h3 className="font-bold mb-2">Step 2: Fetch Staff by user_id</h3>
                {results.step2_staff_by_id?.success ? (
                  <div className="text-sm">
                    <p className="text-green-700">✅ SUCCESS</p>
                    <pre className="bg-white p-2 rounded mt-2 text-xs overflow-auto">
                      {JSON.stringify(results.step2_staff_by_id.data, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <p className="text-yellow-700">⚠️ {results.step2_staff_by_id?.error}</p>
                )}
              </div>

              {/* Step 3: Staff by Email */}
              <div className={`p-4 rounded-lg border-2 ${results.step3_staff_by_email?.success ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}>
                <h3 className="font-bold mb-2">Step 3: Fetch Staff by email</h3>
                {results.step3_staff_by_email?.success ? (
                  <div className="text-sm">
                    <p className="text-green-700">✅ SUCCESS</p>
                    <pre className="bg-white p-2 rounded mt-2 text-xs overflow-auto">
                      {JSON.stringify(results.step3_staff_by_email.data, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <p className="text-red-700">❌ {results.step3_staff_by_email?.error}</p>
                )}
              </div>

              {/* Final Status */}
              <div className="p-4 rounded-lg border-2 border-blue-500 bg-blue-50">
                <h3 className="font-bold mb-2">Final Status:</h3>
                <p className="text-lg font-semibold">{results.step4_final_status}</p>
              </div>

              {/* Errors */}
              {results.errors.length > 0 && (
                <div className="p-4 rounded-lg border-2 border-red-500 bg-red-50">
                  <h3 className="font-bold mb-2 text-red-900">Errors:</h3>
                  {results.errors.map((error, i) => (
                    <p key={i} className="text-red-700 text-sm">{error}</p>
                  ))}
                </div>
              )}

              {/* Solution */}
              <div className="p-4 rounded-lg border-2 border-purple-500 bg-purple-50">
                <h3 className="font-bold mb-2 text-purple-900">Recommended Solution:</h3>
                {results.step2_staff_by_id?.success ? (
                  <p className="text-purple-700">✅ Everything looks good! Login should work.</p>
                ) : results.step3_staff_by_email?.success ? (
                  <div className="text-purple-700">
                    <p>⚡ Staff found by email but not linked to user_id.</p>
                    <p className="font-mono text-sm mt-2 bg-white p-2 rounded">
                      Run in Supabase SQL Editor:<br/>
                      UPDATE staff SET user_id = '{results.step1_auth?.user_id}' WHERE email = '{testEmail}';
                    </p>
                  </div>
                ) : (
                  <p className="text-purple-700">❌ No staff record found. Need to create staff record for this email.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DebugAuth;
