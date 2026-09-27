import React from 'react';

const MemberAnnouncements = () => {
  const announcements = [
    {
      id: 1,
      title: 'Annual General Assembly',
      category: 'Event',
      date: 'May 30, 2026',
      content: 'All members are invited to attend the Annual General Assembly on June 20, 2026 at 2:00 PM. The assembly will be held at the AMCOMS Office in Agay-ayan, Tublay. Agenda includes financial reports, election of officers, and cooperative updates.',
      priority: 'high',
      icon: '📢'
    },
    {
      id: 2,
      title: 'New Loan Policy Published',
      category: 'Policy',
      date: 'May 20, 2026',
      content: 'The cooperative has published a new Loan Policy effective June 1, 2026. Key updates include revised interest rates, new loan categories, and updated payment terms. Please review the full policy document.',
      priority: 'medium',
      icon: '📋'
    },
    {
      id: 3,
      title: 'Office Schedule: Holiday Closure',
      category: 'Notice',
      date: 'May 15, 2026',
      content: 'The AMCOMS office will be closed on June 12, 2026 in observance of Independence Day. Regular office hours will resume on June 13, 2026. Please plan your transactions accordingly.',
      priority: 'low',
      icon: '🏢'
    },
    {
      id: 4,
      title: 'Coconut Sugar Harvest Season Update',
      category: 'Update',
      date: 'May 10, 2026',
      content: 'The cooperative is now accepting coconut sap deliveries for the harvest season. Members can deliver to the BFT (Buying and Fermentation Facility) during regular hours. Good quality sap will be purchased at the agreed rate.',
      priority: 'medium',
      icon: '🥥'
    }
  ];

  const getPriorityColor = (priority) => {
    const colors = {
      high: 'bg-red-100 text-red-800 border-red-200',
      medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      low: 'bg-blue-100 text-blue-800 border-blue-200'
    };
    return colors[priority];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900">Cooperative Announcements</h3>
        <p className="text-sm text-gray-600 mt-1">
          Stay updated with the latest news, events, and policies from AMCOMS
        </p>
      </div>

      {/* Announcements List */}
      <div className="space-y-4">
        {announcements.map((announcement) => (
          <div key={announcement.id} className="bg-white rounded-lg shadow border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-start space-x-4">
              <div className="text-4xl">{announcement.icon}</div>
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">{announcement.title}</h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getPriorityColor(announcement.priority)}`}>
                    {announcement.priority.charAt(0).toUpperCase() + announcement.priority.slice(1)}
                  </span>
                </div>
                <div className="flex items-center space-x-4 text-sm text-gray-600 mb-3">
                  <span className="flex items-center space-x-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    <span>{announcement.category}</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>{announcement.date}</span>
                  </span>
                </div>
                <p className="text-gray-700 leading-relaxed">{announcement.content}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Information Note */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-blue-900">Stay Informed</p>
            <p className="text-sm text-blue-700 mt-1">
              Important announcements and policy updates are posted here. Enable notifications in your settings to receive alerts for new announcements.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MemberAnnouncements;
