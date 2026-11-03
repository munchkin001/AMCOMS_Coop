import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import LedgerView from './LedgerView';
import JournalEntries from './JournalEntries';
import { FinancialStatements, TrialBalance } from './AccountingReports';
import ReviewPanel from './ReviewPanel';
import PostingRules from './PostingRules';

const tabs = [
  { id: 'ledger', label: 'General Ledger' },
  { id: 'journal', label: 'Journal Entries' },
  { id: 'trial-balance', label: 'Trial Balance' },
  { id: 'statements', label: 'Financial Statements', hideFor: ['bookkeeper'] },
  { id: 'review', label: 'Discrepancies and Audit', hideFor: ['bookkeeper', 'manager'] },
  { id: 'rules', label: 'Posting Rules', hideFor: ['bookkeeper', 'manager'] }
];

const GeneralLedger = () => {
  const { staff } = useAuth();
  const [active, setActive] = useState('ledger');
  const canPost = ['bookkeeper', 'treasurer'].includes(staff?.role);
  const chairmanTheme = staff?.role === 'chairman';
  const visibleTabs = tabs.filter((tab) => !tab.hideFor?.includes(staff?.role));
  const current = visibleTabs.some((tab) => tab.id === active) ? active : 'ledger';

  return (
    <div className={`space-y-6 ${chairmanTheme ? 'chairman-ledger-page' : ''}`}>
      <div className={`no-print border bg-white shadow-sm ${chairmanTheme ? 'rounded-2xl border-slate-200 p-5 sm:p-6' : 'rounded-xl border-gray-200 p-4 sm:p-6'}`}>
        {chairmanTheme && <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">Financial oversight</p>}
        <h2 className={chairmanTheme ? 'mt-1 text-xl font-bold tracking-tight text-gray-900' : 'text-xl font-semibold text-gray-900'}>General Ledger</h2>
        {chairmanTheme && <p className="mt-1 text-sm text-slate-600">Review posted entries, balances, and cooperative financial statements.</p>}
      </div>

      <div className="no-print overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <div role="tablist" className="flex min-w-max border-b border-gray-200">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={current === tab.id}
              onClick={() => setActive(tab.id)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${current === tab.id ? chairmanTheme ? 'border-b-2 border-blue-800 bg-blue-50 text-blue-900' : 'border-b-2 border-blue-600 bg-blue-50 text-blue-700' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {current === 'ledger' && <LedgerView />}
      {current === 'journal' && <JournalEntries canPost={canPost} />}
      {current === 'trial-balance' && <TrialBalance />}
      {current === 'statements' && <FinancialStatements />}
      {current === 'review' && <ReviewPanel />}
      {current === 'rules' && <PostingRules />}
    </div>
  );
};

export default GeneralLedger;
