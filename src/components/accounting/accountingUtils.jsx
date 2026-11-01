import { useCallback, useEffect, useState } from 'react';
import offlineDb from '../../lib/Offline/OfflineDb';
import { supabase } from '../../lib/supabase';

export const peso = (value) => `PHP ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const amount = (value) => (Number(value) ? Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
export const formatDate = (value) => (value
  ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
  : '');
export const formatDateTime = (value) => (value
  ? new Date(value).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  : '');

export const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
export const startOfYearISO = () => `${todayISO().slice(0, 4)}-01-01`;

export const inputClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20';
export const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50';
export const primaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50';

export const PrintStyles = () => (
  <style>{`
    @media print {
      @page { size: A4 landscape; margin: 12mm; }
      html, body, #root { width: 100% !important; min-width: 0 !important; height: auto !important; overflow: visible !important; }
      body * { visibility: hidden !important; }
      #gl-print, #gl-print * { visibility: visible !important; }
      #gl-print { position: absolute; left: 0; top: 0; width: 100% !important; min-width: 0 !important; max-width: none !important; overflow: visible !important; border: 0 !important; box-shadow: none !important; }
      #gl-print * { min-width: 0 !important; overflow: visible !important; }
      #gl-print table { width: 100% !important; min-width: 0 !important; max-width: 100% !important; }
      .no-print, .print\\:hidden, [data-no-print="true"] { display: none !important; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; }
    }
  `}</style>
);

export const useAccounts = (userId = null, offlineMode = false) => {
  const [accounts, setAccounts] = useState([]);

  const load = useCallback(async () => {
    const cacheKey = userId ? `chart-of-accounts:${userId}` : null;
    if (!navigator.onLine || offlineMode) {
      const cached = cacheKey ? await offlineDb.cachedData.get(cacheKey) : null;
      setAccounts(cached?.data || []);
      return;
    }
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name, account_type, is_active')
      .order('account_name');
    if (data) {
      setAccounts(data);
      if (cacheKey) {
        try {
          await offlineDb.cachedData.put({ key: cacheKey, data, updatedAt: new Date().toISOString() });
        } catch (error) {
          console.error('Unable to cache chart of accounts:', error);
        }
      }
    } else {
      console.error('Unable to load chart of accounts while online.');
      const cached = cacheKey ? await offlineDb.cachedData.get(cacheKey) : null;
      setAccounts(cached?.data || []);
    }
  }, [offlineMode, userId]);

  useEffect(() => { load(); }, [load]);
  return accounts;
};

export const accountTypeLabel = (type) => ({
  asset: 'Assets', liability: 'Liabilities', equity: 'Equity', revenue: 'Revenue', expense: 'Expenses'
}[type] || type);
