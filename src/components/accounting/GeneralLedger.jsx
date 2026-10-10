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
  { id: 'review', label: 'Discrepancies and Audit', hideFor: ['bookkeeper'] },
  { id: 'rules', label: 'Posting Rules', hideFor: ['bookkeeper'] }
];

const GeneralLedger = () => {
  const { staff } = useAuth();
  const [active, setActive] = useState('ledger');
  const canPost = ['bookkeeper', 'treasurer'].includes(staff?.role);
  const visibleTabs = tabs.filter((tab) => !tab.hideFor?.includes(staff?.role));
  const current = visibleTabs.some((tab) => tab.id === active) ? active : 'ledger';

  return (
    <div className="space-y-6">
      <div className="no-print rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-xl font-semibold text-gray-900">General Ledger</h2>
        <p className="mt-1 text-sm text-gray-600">
          {canPost
            ? 'Balances are computed from posted journal entries. Cash receipts and disbursements post here automatically; corrections are made with reversing or adjusting entries.'
            : 'Read-only view of the cooperative\'s accounting records. Posted entries cannot be edited or deleted.'}
        </p>
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
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${current === tab.id ? 'border-b-2 border-blue-600 bg-blue-50 text-blue-700' : 'text-gray-600 hover:text-gray-900'}`}
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
