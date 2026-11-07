import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const DebugAuth = () => {
  const { user, staff, loading, error } = useAuth();

  return (
    <div className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">Auth Debug</h1>
        <div className="mt-4 space-y-3 text-sm">
          <p><strong>Loading:</strong> {String(loading)}</p>
          <p><strong>Error:</strong> {error || 'None'}</p>
          <p><strong>User:</strong> {user ? JSON.stringify(user, null, 2) : 'null'}</p>
          <p><strong>Staff:</strong> {staff ? JSON.stringify(staff, null, 2) : 'null'}</p>
        </div>
      </div>
    </div>
  );
};

export default DebugAuth;
