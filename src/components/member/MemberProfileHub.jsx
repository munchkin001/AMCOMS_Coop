import React from 'react';
import { ChevronRight, HandCoins, Landmark, PiggyBank } from 'lucide-react';
import MyProfile from './MyProfile';

const links = [
  { id: 'savings', label: 'Savings', Icon: PiggyBank },
  { id: 'time-deposit', label: 'Time Deposit', Icon: Landmark },
  { id: 'loans', label: 'Loans', Icon: HandCoins }
];

// On phones the account pages are reached from the profile; on desktop they are in the sidebar.
const MemberProfileHub = ({ onOpen }) => (
  <div className="space-y-4">
    <MyProfile />
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white lg:hidden">
      <p className="px-4 pt-3 text-xs font-semibold uppercase text-gray-500">My accounts</p>
      {links.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onOpen(id)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-gray-50"
        >
          <span className="flex items-center gap-3 text-sm font-medium text-gray-900">
            <Icon aria-hidden="true" size={20} className="text-[#146344]" />
            {label}
          </span>
          <ChevronRight aria-hidden="true" size={18} className="text-gray-400" />
        </button>
      ))}
    </div>
  </div>
);

export default MemberProfileHub;
