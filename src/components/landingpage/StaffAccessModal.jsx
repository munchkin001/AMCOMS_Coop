import { useEffect, useRef, useState } from 'react';
import { LockKeyhole, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const StaffAccessModal = ({ onClose }) => {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
    const handleEscape = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [busy, onClose]);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const response = await fetch('/api/staff-access', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: accessCode })
      });
      if (response.status === 401) {
        setError('Invalid access code');
        return;
      }
      if (response.status !== 200 || !response.headers.get('content-type')?.includes('application/json')) {
        setError('Staff access could not be verified. Please try again later.');
        return;
      }
      const result = await response.json();
      if (result.success !== true) {
        setError('Staff access could not be verified. Please try again later.');
        return;
      }
      onClose();
      navigate('/login/staff');
    } catch (requestError) {
      console.error('Unable to verify staff gateway access:', requestError);
      setError('Staff access could not be verified. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-access-title"
        className="w-full max-w-md rounded-2xl border border-emerald-900/10 bg-white p-6 shadow-2xl sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
              <LockKeyhole aria-hidden="true" size={22} />
            </span>
            <h2 id="staff-access-title" className="text-xl font-bold text-gray-900">Staff &amp; Admin Access</h2>
            <p className="mt-1 text-sm text-gray-600">Enter your cooperative’s staff access code to continue.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close staff access dialog"
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <label htmlFor="staff-access-code" className="block text-sm font-semibold text-gray-800">
            Access Code / Security Key
          </label>
          <input
            ref={inputRef}
            id="staff-access-code"
            name="staff-access-code"
            type="password"
            autoComplete="off"
            required
            maxLength={256}
            value={accessCode}
            onChange={(event) => {
              setAccessCode(event.target.value);
              if (error) setError('');
            }}
            aria-invalid={!!error}
            aria-describedby={error ? 'staff-access-error' : undefined}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20"
          />
          {error && (
            <p id="staff-access-error" role="alert" className="text-sm font-medium text-red-700">{error}</p>
          )}
          <button
            type="submit"
            disabled={busy || !accessCode}
            className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-800 px-4 py-3 font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Verifying...' : 'Continue to Staff Login'}
          </button>
        </form>
        <p className="mt-4 text-xs leading-5 text-gray-500">
          This access code is an additional gateway and does not replace your staff username and password.
        </p>
      </section>
    </div>
  );
};

export default StaffAccessModal;
