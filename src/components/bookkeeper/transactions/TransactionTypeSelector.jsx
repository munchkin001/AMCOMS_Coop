import React from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BadgeDollarSign,
  Banknote,
  Building2,
  CircleDollarSign,
  FileText,
  HandCoins,
  Landmark,
  ReceiptText,
  ShoppingCart,
  Wallet,
} from 'lucide-react';

const transactionGroups = [
  {
    id: 'cash-in',
    title: 'Cash In / Receipt',
    description: 'Record money received and update the related member or sales records.',
    icon: ArrowDownLeft,
    tone: 'emerald',
    types: [
      { id: 'sales', name: 'Sales', description: 'Product or service sales, including credit sales.', icon: ShoppingCart },
      { id: 'loan-payment', name: 'Loan Payments', description: 'Apply payments to principal, interest, and penalties.', icon: HandCoins },
      { id: 'savings-deposit', name: 'Savings Deposits', description: 'Deposit to a member’s regular savings account.', icon: Wallet },
      { id: 'time-deposit', name: 'Time Deposits', description: 'Create a time deposit with maturity terms.', icon: Landmark },
      { id: 'capital-contribution', name: 'Capital Contributions', description: 'Record a member’s monthly capital share.', icon: BadgeDollarSign },
      { id: 'other-receipt', name: 'Other Receipts', description: 'Record other income with balanced account allocations.', icon: ReceiptText },
    ],
  },
  {
    id: 'cash-out',
    title: 'Cash Out / Disbursement',
    description: 'Record money paid out while preserving the proper approval and account rules.',
    icon: ArrowUpRight,
    tone: 'rose',
    types: [
      { id: 'loan-disbursement', name: 'Loan Disbursements', description: 'Release an approved loan through the existing loan-release workflow.', icon: HandCoins },
      { id: 'savings-withdrawal', name: 'Savings Withdrawals', description: 'Withdraw from a member’s regular savings account.', icon: Wallet },
      { id: 'time-deposit-withdrawal', name: 'Time Deposit Withdrawals', description: 'Withdraw from a member’s time deposit account.', icon: Landmark },
      { id: 'operating-expense', name: 'Operating Expenses', description: 'Record expenses paid from cash on hand or the bank.', icon: Building2 },
      { id: 'approved-dividend', name: 'Approved Dividends', description: 'Post approved worksheet allocations to member accounts.', icon: CircleDollarSign },
      { id: 'other-disbursement', name: 'Other Disbursements', description: 'Record other payments with balanced account allocations.', icon: FileText },
    ],
  },
];

const toneClasses = {
  emerald: {
    section: 'border-emerald-200 bg-emerald-50/70',
    badge: 'bg-emerald-100 text-emerald-800',
    icon: 'text-emerald-700',
    focus: 'focus-visible:ring-emerald-600',
  },
  rose: {
    section: 'border-rose-200 bg-rose-50/70',
    badge: 'bg-rose-100 text-rose-800',
    icon: 'text-rose-700',
    focus: 'focus-visible:ring-rose-600',
  },
};

const TransactionTypeSelector = ({ onSelectType, onCancel }) => (
  <div className="space-y-6">
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-700">Bookkeeper workspace</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">New Transaction</h2>
        <p className="mt-1 text-sm text-slate-600">Choose a direction, then select the transaction type.</p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Close transaction type selection"
        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      {transactionGroups.map((group) => {
        const tone = toneClasses[group.tone];
        return (
          <section key={group.id} className={`overflow-hidden rounded-2xl border ${tone.section}`}>
            <header className="flex items-start gap-3 border-b border-white/80 px-5 py-4">
              <span className={`rounded-xl bg-white p-2.5 shadow-sm ${tone.icon}`}>
                <group.icon size={22} aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-lg font-bold text-slate-950">{group.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{group.description}</p>
              </div>
              <span className={`ml-auto hidden rounded-full px-2.5 py-1 text-xs font-semibold sm:inline-flex ${tone.badge}`}>
                {group.types.length} types
              </span>
            </header>
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              {group.types.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => onSelectType(type.id)}
                  className={`group flex min-h-28 items-start gap-3 rounded-xl border border-white bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md ${tone.focus} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2`}
                >
                  <span className={`mt-0.5 rounded-lg bg-slate-50 p-2 ${tone.icon}`}>
                    <type.icon size={19} aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block font-semibold text-slate-900 group-hover:text-slate-950">{type.name}</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-600">{type.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>

    <div className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 sm:flex-row sm:items-center">
      <Banknote size={19} className="shrink-0 text-blue-700" aria-hidden="true" />
      <p>
        Transactions are posted through the existing server-validated workflows. Credit sales remain receivables;
        loan releases require an approved loan and are completed in the loan-release workflow.
      </p>
    </div>

    <div className="flex justify-end">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 font-medium text-slate-700 hover:bg-slate-50"
      >
        Cancel
      </button>
    </div>
  </div>
);

export default TransactionTypeSelector;
