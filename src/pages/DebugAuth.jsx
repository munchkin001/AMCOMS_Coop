import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const DebugAuth = () => {
  const { user, staff, loading, authError } = useAuth();

  return (
    <div className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">Auth Debug</h1>
        <div className="mt-4 space-y-3 text-sm">
          <p><strong>Loading:</strong> {String(loading)}</p>
          <p><strong>Error:</strong> {authError || 'None'}</p>
          <p><strong>Authenticated:</strong> {String(Boolean(user))}</p>
          <p><strong>Staff profile loaded:</strong> {String(Boolean(staff))}</p>
        </div>
      </div>
    </div>
  );
};

export default DebugAuth;