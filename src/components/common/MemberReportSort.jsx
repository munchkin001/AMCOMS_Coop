import React from 'react';
import { MEMBER_REPORT_SORT_OPTIONS } from './memberReportSorting';

const MemberReportSort = ({ value, onChange, id = 'member-report-sort' }) => (
  <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium text-slate-700">
    Sort members
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
    >
      {MEMBER_REPORT_SORT_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  </label>
);

export default MemberReportSort;
