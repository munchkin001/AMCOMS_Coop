import { useState } from 'react';
import NewMemberRequests from './NewMemberRequests';
import RequestManagement from './RequestManagement';

const tabs = [
  { key: 'members', label: 'New Member Requests' },
  { key: 'other', label: 'Loan Requests' }
];

const Requests = () => {
  const [tab, setTab] = useState('members');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3" role="tablist">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${tab === key ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'members' ? <NewMemberRequests /> : <RequestManagement />}
    </div>
  );
};

export default Requests;
