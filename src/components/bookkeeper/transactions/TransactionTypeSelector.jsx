import React from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BadgeDollarSign,
  Banknote,
  Building2,
  ChevronRight,
  CircleDollarSign,
  FileText,
  HandCoins,
  Landmark,
  ReceiptText,
  ShoppingCart,
  Wallet,
  X,
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
    tone: 'blue',
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
    section: 'border-emerald-200',
    header: 'bg-emerald-50/80',
    badge: 'bg-emerald-100 text-emerald-800',
    icon: 'bg-emerald-50 text-emerald-700',
    hover: 'hover:border-emerald-300 hover:bg-emerald-50/50',
    focus: 'focus-visible:ring-emerald-600',
  },
  blue: {
    section: 'border-blue-200',
    header: 'bg-blue-50/80',
    badge: 'bg-blue-100 text-blue-800',
    icon: 'bg-blue-50 text-blue-700',
    hover: 'hover:border-blue-300 hover:bg-blue-50/50',
    focus: 'focus-visible:ring-blue-700',
  },
};

const TransactionTypeSelector = ({ onSelectType, onCancel }) => (
  <div className="mx-auto max-w-[1500px] space-y-5">
    <header className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-7">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Bookkeeper workspace</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-[28px]">New transaction</h2>
        <p className="mt-1 text-sm text-slate-600">Choose whether funds are coming in or going out, then select a transaction type.</p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
      >
        <X size={16} aria-hidden="true" />
        Close
      </button>
    </header>

    <div className="grid items-start gap-5 xl:grid-cols-2">
      {transactionGroups.map((group) => {
        const tone = toneClasses[group.tone];
        return (
          <section key={group.id} className={`flex h-full flex-col overflow-hidden rounded-2xl border bg-white shadow-sm ${tone.section}`}>
            <header className={`flex min-h-[104px] items-start gap-3 border-b border-slate-200/80 px-4 py-4 sm:px-5 ${tone.header}`}>
              <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tone.icon}`}>
                <group.icon size={20} strokeWidth={2.2} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-bold tracking-tight text-slate-950 sm:text-lg">{group.title}</h3>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone.badge}`}>
                    {group.types.length} options
                  </span>
                </div>
                <p className="mt-1 text-sm leading-5 text-slate-600">{group.description}</p>
              </div>
            </header>
            <div className="grid flex-1 auto-rows-fr gap-2.5 p-3 sm:grid-cols-2 sm:p-4">
              {group.types.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => onSelectType(type.id)}
                  className={`group flex h-full min-h-[88px] items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left transition hover:shadow-sm ${tone.hover} ${tone.focus} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1`}
                >
                  <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${tone.icon}`}>
                    <type.icon size={17} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-5 text-slate-900">{type.name}</span>
                    <span className="mt-1 block text-xs leading-[1.35rem] text-slate-600">{type.description}</span>
                  </span>
                  <ChevronRight size={17} className="mt-1 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-700" aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>

    <aside className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-700 shadow-sm">
      <Banknote size={18} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
      <p className="leading-6">
        Transactions are validated through the approval workflow. Credit sales remain receivables; loan cash releases require an approved loan and Treasurer proof.
      </p>
    </aside>
  </div>
);

export default TransactionTypeSelector;
