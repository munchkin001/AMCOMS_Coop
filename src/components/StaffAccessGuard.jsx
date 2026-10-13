import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import LoadingSpinner from './common/LoadingSpinner';

const StaffAccessGuard = ({ children }) => {
  const [state, setState] = useState('checking');

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/staff-access', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal
    })
      .then((response) => {
        if (response.status === 204) {
          setState('allowed');
        } else if (response.status === 401) {
          setState('denied');
        } else {
          setState('unavailable');
        }
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setState('unavailable');
      });

    return () => controller.abort();
  }, []);

  if (state === 'denied') return <Navigate to="/" replace />;

  if (state !== 'allowed') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md text-center">
          {state === 'checking' ? (
            <>
              <LoadingSpinner size="large" />
              <p className="mt-4 text-gray-700">Verifying staff access...</p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-gray-900">Staff access unavailable</h1>
              <p className="mt-2 text-sm text-gray-600">
                The secure staff gateway could not be verified. Please return to the public site and try again.
              </p>
              <a href="/" className="mt-5 inline-flex rounded-lg bg-emerald-800 px-4 py-2 font-semibold text-white hover:bg-emerald-900">
                Return to AMCOMS
              </a>
            </>
          )}
        </div>
      </main>
    );
  }

  return children;
};

export default StaffAccessGuard;
