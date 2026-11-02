import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const templates = [
  { name: 'Loan due reminder', message: 'Reminder: your loan payment is due on [DATE]. Please contact the cooperative office for assistance.' },
  { name: 'Meeting reminder', message: 'Reminder: the cooperative meeting is on [DATE] at [TIME]. We hope to see you there.' },
  { name: 'Payment received', message: 'The cooperative has received your payment. Thank you.' },
  { name: 'Time deposit maturity', message: 'Your time deposit matures on [DATE]. Please contact the cooperative office.' }
];

const SMSCenter = () => {
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [accountBalance, setAccountBalance] = useState(null);
  const [balanceUnit, setBalanceUnit] = useState('');
  const [balanceError, setBalanceError] = useState('');
  const [loadingBalance, setLoadingBalance] = useState(false);
  const balanceRequestInProgressRef = useRef(false);

  const loadCreditBalance = useCallback(async () => {
    if (balanceRequestInProgressRef.current) return;
    balanceRequestInProgressRef.current = true;
    setLoadingBalance(true);
    setBalanceError('');

    try {
      const { data, error: balanceLoadError } = await supabase.functions.invoke('semaphore-sms', {
        body: { action: 'balance' }
      });

      if (balanceLoadError) {
        let serverMessage;
        try {
          serverMessage = (await balanceLoadError.context?.clone?.().json())?.error;
        } catch {
          serverMessage = null;
        }
        throw new Error(serverMessage || balanceLoadError.message || 'SMS credits could not be loaded.');
      }

      const rawBalance = data?.balance;
      const balance = typeof rawBalance === 'number' || (typeof rawBalance === 'string' && rawBalance.trim() !== '')
        ? Number(rawBalance)
        : Number.NaN;
      if (Number.isFinite(balance) && balance >= 0 && typeof data?.unit === 'string' && data.unit.trim()) {
        setAccountBalance(balance);
        setBalanceUnit(data.unit.trim());
      } else {
        throw new Error('Mocean returned an invalid account balance.');
      }
    } catch (balanceLoadError) {
      console.error('Error loading SMS balance:', balanceLoadError);
      setBalanceError(balanceLoadError.message || 'SMS credits could not be loaded.');
    } finally {
      balanceRequestInProgressRef.current = false;
      setLoadingBalance(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    const { data, error: historyError } = await supabase
      .from('sms_logs')
      .select('id, recipient_name, phone_number, message, status, sent_at')
      .order('sent_at', { ascending: false })
      .limit(50);
    if (historyError) {
      console.error('Unable to load SMS history:', historyError);
      setError('SMS history could not be loaded.');
    } else {
      setHistory(data || []);
    }
    setLoadingHistory(false);
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    loadCreditBalance();
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') loadCreditBalance();
    };
    const interval = setInterval(refreshWhenVisible, 30000);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [loadCreditBalance]);

  const handleSendSMS = async (event) => {
    event.preventDefault();
    setError('');
    setSending(true);

    try {
      const { error: sendError } = await supabase.functions.invoke('semaphore-sms', {
        body: { action: 'send', phone, message }
      });
      if (sendError) {
        let messageFromServer;
        try {
          messageFromServer = (await sendError.context?.clone?.().json())?.error;
        } catch {
          messageFromServer = null;
        }
        throw new Error(messageFromServer || 'The SMS could not be sent. Please try again.');
      }

      setPhone('');
      setMessage('');
      await loadHistory();
      await loadCreditBalance();
    } catch (sendError) {
      setError(sendError.message || 'The SMS could not be sent. Please try again.');
      await loadHistory();
    } finally {
      setSending(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const sentToday = history.filter((sms) => sms.status === 'sent' && sms.sent_at?.slice(0, 10) === today).length;
  const failedToday = history.filter((sms) => sms.status === 'failed' && sms.sent_at?.slice(0, 10) === today).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-950">SMS Center</h1>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:col-span-3">
          <div>
            <dt className="text-sm text-gray-600">Mocean account balance</dt>
            <dd className="mt-1 text-2xl font-semibold text-gray-950">
              {loadingBalance && accountBalance === null
                ? 'Loading…'
                : accountBalance !== null
                  ? `${balanceUnit} ${accountBalance.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : 'Unavailable'}
            </dd>
            {balanceError && <p role="alert" className="mt-1 text-sm text-red-700">{balanceError}</p>}
          </div>
          <button type="button" onClick={loadCreditBalance} disabled={loadingBalance} aria-label="Refresh SMS credit balance" title="Refresh SMS credit balance" className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">
            <RefreshCw size={17} aria-hidden="true" className={loadingBalance ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4"><dt className="text-sm text-gray-600">Sent today</dt><dd className="mt-1 text-2xl font-semibold text-gray-950">{sentToday}</dd></div>
        <div className="rounded-lg border border-gray-200 bg-white p-4"><dt className="text-sm text-gray-600">Failed today</dt><dd className="mt-1 text-2xl font-semibold text-gray-950">{failedToday}</dd></div>
        <div className="rounded-lg border border-gray-200 bg-white p-4"><dt className="text-sm text-gray-600">Recent messages</dt><dd className="mt-1 text-2xl font-semibold text-gray-950">{history.length}</dd></div>
      </dl>

      <section className="rounded-lg border border-gray-200 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-950">Send SMS</h2>
        <form onSubmit={handleSendSMS} className="mt-4 space-y-4">
          {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
          <div>
            <label htmlFor="sms-phone" className="mb-1.5 block text-sm font-medium text-gray-800">Mobile number</label>
            <input id="sms-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="09XXXXXXXXX" required maxLength={24} className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20" />
          </div>
          <div>
            <label htmlFor="sms-message" className="mb-1.5 block text-sm font-medium text-gray-800">Message</label>
            <textarea id="sms-message" value={message} onChange={(event) => setMessage(event.target.value)} rows={4} maxLength={2000} required placeholder="Write your message" className="w-full resize-y rounded-md border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20" />
            <p className="mt-1 flex justify-between gap-3 text-xs text-gray-500">
              <span>SMS supports plain text; font and color formatting are not transmitted.</span>
              <span>{message.length}/2000 characters</span>
            </p>
          </div>
          <button type="submit" disabled={sending || !phone.trim() || !message.trim()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
            <Send size={17} aria-hidden="true" />{sending ? 'Sending…' : 'Send SMS'}
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-950">Quick templates</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {templates.map((template) => (
            <button key={template.name} type="button" onClick={() => setMessage(template.message)} className="rounded-md border border-gray-200 p-3 text-left hover:bg-gray-50">
              <span className="block text-sm font-medium text-gray-900">{template.name}</span>
              <span className="mt-1 block text-xs text-gray-600">{template.message}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-950">Recent SMS</h2>
        {loadingHistory ? <p className="mt-3 text-sm text-gray-500">Loading SMS history…</p> : history.length === 0 ? <p className="mt-3 text-sm text-gray-500">No messages have been logged.</p> : (
          <div className="mt-3 divide-y divide-gray-100">
            {history.map((sms) => (
              <article key={sms.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{sms.recipient_name || sms.phone_number}</p>
                  {sms.recipient_name && <p className="text-xs text-gray-500">{sms.phone_number}</p>}
                  <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{sms.message}</p>
                  <p className="mt-1 text-xs text-gray-500">{new Date(sms.sent_at).toLocaleString()}</p>
                </div>
                <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium ${sms.status === 'sent' ? 'bg-emerald-100 text-emerald-800' : sms.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{sms.status}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default SMSCenter;
