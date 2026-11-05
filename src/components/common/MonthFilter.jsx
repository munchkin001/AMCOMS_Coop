import React, { useState } from 'react';
import { Filter } from 'lucide-react';
import { getMonthKey } from './monthFilterUtils';

const MonthFilter = ({ dates, value, onChange, id = 'month-filter' }) => {
  const [open, setOpen] = useState(false);
  const months = [...new Set((dates || []).map(getMonthKey).filter(Boolean))].sort().reverse();

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
      >
        <Filter aria-hidden="true" size={16} />
        Filter by month
      </button>
      {open && (
        <div id={`${id}-options`} className="absolute right-0 z-10 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Month
          </label>
          <select
            id={id}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
          >
            <option value="all">All months</option>
            {months.map((month) => {
              const [year, monthNumber] = month.split('-').map(Number);
              const label = new Date(year, monthNumber - 1, 1)
                .toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
              return <option key={month} value={month}>{label}</option>;
            })}
          </select>
        </div>
      )}
    </div>
  );
};

export default MonthFilter;
